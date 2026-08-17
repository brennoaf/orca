import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  SlackFastResponseAttach,
  SlackFastResponseSnapshot,
  SlackFastResponseVisibility
} from '../../../../../shared/slack-fast-response'

export type SlackFastResponseHostBinding = {
  identity: SlackFastResponseVisibility
  visible: boolean
}

export type SlackFastResponseHostState =
  | { kind: 'inactive' }
  | { kind: 'loading'; contentMode: SlackFastResponseSnapshot['contentMode'] }
  | { kind: 'ready'; contentMode: SlackFastResponseSnapshot['contentMode'] }
  | { kind: 'crashed'; recoverable: boolean }
  | { kind: 'error'; recoverable: boolean }

function identityKey(identity: SlackFastResponseVisibility): string {
  return identity.target === 'attached'
    ? `attached:${identity.requestId}:${identity.surfaceId}:${identity.mode}`
    : identity.target === 'dock'
      ? `dock:${identity.generation}:${identity.revision}:${identity.tabId}`
      : `browser:${identity.browserTabId}:${identity.browserPageId}:${identity.workspaceId}:${identity.registrationToken}:${identity.revision}`
}

function snapshotState(snapshot: SlackFastResponseSnapshot): SlackFastResponseHostState {
  if (snapshot.crashed) {
    return { kind: 'crashed', recoverable: true }
  }
  return snapshot.loaded
    ? { kind: 'ready', contentMode: snapshot.contentMode }
    : { kind: 'loading', contentMode: snapshot.contentMode }
}

function rendererZoomFactor(): number {
  return Math.pow(1.2, window.api.ui.getZoomLevel())
}

export function useSlackFastResponseHost({
  binding,
  element
}: {
  binding?: SlackFastResponseHostBinding
  element: HTMLDivElement | null
}): SlackFastResponseHostState {
  const [state, setState] = useState<SlackFastResponseHostState>({ kind: 'inactive' })
  const bindingRef = useRef(binding)
  const sequenceRef = useRef(0)
  const ownerKeyRef = useRef<string | null>(null)
  bindingRef.current = binding

  const applySnapshot = useCallback((sequence: number, snapshot: SlackFastResponseSnapshot) => {
    if (sequence === sequenceRef.current) {
      setState(snapshotState(snapshot))
    }
  }, [])

  useLayoutEffect(() => {
    if (!binding || !element || !binding.visible || !window.api.slackFastResponse) {
      return
    }
    const sequence = ++sequenceRef.current
    const ownerKey = identityKey(binding.identity)
    let disposed = false
    let frame: number | null = null
    let inFlight = false
    let dirty = false
    const publish = (): void => {
      if (inFlight) {
        dirty = true
        return
      }
      const rect = element.getBoundingClientRect()
      const ownerWindow = element.ownerDocument.defaultView
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        !ownerWindow ||
        rect.right <= 0 ||
        rect.bottom <= 0 ||
        rect.left >= ownerWindow.innerWidth ||
        rect.top >= ownerWindow.innerHeight
      ) {
        return
      }
      const request: SlackFastResponseAttach = {
        ...binding.identity,
        rectCss: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        rendererZoomFactor: rendererZoomFactor()
      }
      const operation =
        ownerKeyRef.current === ownerKey
          ? window.api.slackFastResponse.updateBounds(request)
          : window.api.slackFastResponse.attach(request)
      inFlight = true
      void operation
        .then((snapshot) => {
          inFlight = false
          if (disposed || sequence !== sequenceRef.current) {
            return
          }
          ownerKeyRef.current = ownerKey
          applySnapshot(sequence, snapshot)
          if (dirty) {
            dirty = false
            schedulePublish()
          }
        })
        .catch(() => {
          inFlight = false
          if (!disposed && sequence === sequenceRef.current) {
            setState({ kind: 'error', recoverable: true })
          }
        })
    }
    const schedulePublish = (): void => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
      frame = requestAnimationFrame(() => {
        frame = null
        publish()
      })
    }
    publish()
    const resizeObserver = new ResizeObserver(schedulePublish)
    const intersectionObserver = new IntersectionObserver(schedulePublish)
    resizeObserver.observe(element)
    intersectionObserver.observe(element)
    window.addEventListener('resize', schedulePublish)
    window.addEventListener('scroll', schedulePublish, true)
    window.visualViewport?.addEventListener('resize', schedulePublish)
    window.visualViewport?.addEventListener('scroll', schedulePublish)
    return () => {
      disposed = true
      sequenceRef.current += 1
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
      window.removeEventListener('resize', schedulePublish)
      window.removeEventListener('scroll', schedulePublish, true)
      window.visualViewport?.removeEventListener('resize', schedulePublish)
      window.visualViewport?.removeEventListener('scroll', schedulePublish)
    }
  }, [applySnapshot, binding, element])

  useEffect(() => {
    if (!binding || !window.api.slackFastResponse) {
      setState({ kind: 'inactive' })
      return
    }
    const ownerKey = identityKey(binding.identity)
    if (binding.visible || ownerKeyRef.current !== ownerKey) {
      return
    }
    const sequence = ++sequenceRef.current
    void window.api.slackFastResponse.hide(binding.identity).then(
      (snapshot) => applySnapshot(sequence, snapshot),
      () => undefined
    )
  }, [applySnapshot, binding])

  useEffect(() => {
    if (!binding || !window.api.slackFastResponse) {
      return
    }
    return window.api.slackFastResponse.onStateChanged((event) => {
      const current = bindingRef.current
      if (!current || identityKey(current.identity) !== identityKey(event.identity)) {
        return
      }
      if (
        event.state === 'loading' ||
        event.state === 'compact' ||
        event.state === 'login' ||
        event.state === 'unsupported'
      ) {
        setState({
          kind: event.state === 'loading' ? 'loading' : 'ready',
          contentMode: event.contentMode
        })
      } else if (event.state === 'crashed') {
        ownerKeyRef.current = null
        setState({ kind: 'crashed', recoverable: event.recoverable })
      } else {
        setState({ kind: 'error', recoverable: event.recoverable })
      }
    })
  }, [binding])

  useEffect(
    () => () => {
      const current = bindingRef.current
      if (
        !current ||
        !window.api.slackFastResponse ||
        ownerKeyRef.current !== identityKey(current.identity)
      ) {
        return
      }
      sequenceRef.current += 1
      ownerKeyRef.current = null
      void window.api.slackFastResponse.hide(current.identity).catch(() => undefined)
    },
    []
  )

  return state
}
