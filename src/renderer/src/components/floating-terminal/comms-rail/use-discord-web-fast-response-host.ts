import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  DiscordWebFastResponseAttach,
  DiscordWebFastResponseSnapshot,
  DiscordWebFastResponseVisibility
} from '../../../../../shared/discord-web-fast-response'

export type DiscordWebFastResponseHostBinding = {
  identity: DiscordWebFastResponseVisibility
  visible: boolean
}

export type DiscordWebFastResponseHostState =
  | { kind: 'inactive' }
  | { kind: 'loading'; contentMode: DiscordWebFastResponseSnapshot['contentMode'] }
  | { kind: 'ready'; contentMode: DiscordWebFastResponseSnapshot['contentMode'] }
  | { kind: 'crashed' }
  | { kind: 'error' }

function identityKey(identity: DiscordWebFastResponseVisibility): string {
  return identity.target === 'attached'
    ? `attached:${identity.requestId}:${identity.surfaceId}:${identity.mode}`
    : `dock:${identity.generation}:${identity.revision}:${identity.tabId}`
}

function snapshotState(snapshot: DiscordWebFastResponseSnapshot): DiscordWebFastResponseHostState {
  if (snapshot.crashed) {
    return { kind: 'crashed' }
  }
  return snapshot.loaded
    ? { kind: 'ready', contentMode: snapshot.contentMode }
    : { kind: 'loading', contentMode: snapshot.contentMode }
}

function rendererZoomFactor(): number {
  return Math.pow(1.2, window.api.ui.getZoomLevel())
}

export function useDiscordWebFastResponseHost({
  binding,
  element
}: {
  binding?: DiscordWebFastResponseHostBinding
  element: HTMLDivElement | null
}): DiscordWebFastResponseHostState {
  const [state, setState] = useState<DiscordWebFastResponseHostState>({ kind: 'inactive' })
  const [recoveryEpoch, setRecoveryEpoch] = useState(0)
  const bindingRef = useRef(binding)
  const sequenceRef = useRef(0)
  const ownerKeyRef = useRef<string | null>(null)
  const visibleOwnerKeyRef = useRef<string | null>(null)
  const recoveryBindingKeyRef = useRef<string | null>(null)
  const recoveredOwnerKeyRef = useRef<string | null>(null)
  bindingRef.current = binding

  useEffect(() => {
    const nextKey = binding ? identityKey(binding.identity) : null
    if (recoveryBindingKeyRef.current === nextKey) {
      return
    }
    recoveryBindingKeyRef.current = nextKey
    recoveredOwnerKeyRef.current = null
  }, [binding])

  const applySnapshot = useCallback(
    (sequence: number, snapshot: DiscordWebFastResponseSnapshot) => {
      if (sequence === sequenceRef.current) {
        setState(snapshotState(snapshot))
      }
    },
    []
  )

  useLayoutEffect(() => {
    const api = window.api.discordWebFastResponse
    if (!binding || !element || !binding.visible || !api) {
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
      if (!ownerWindow) {
        return
      }
      const intersects =
        rect.width > 0 &&
        rect.height > 0 &&
        rect.right > 0 &&
        rect.bottom > 0 &&
        rect.left < ownerWindow.innerWidth &&
        rect.top < ownerWindow.innerHeight
      if (!intersects) {
        if (ownerKeyRef.current !== ownerKey || visibleOwnerKeyRef.current !== ownerKey) {
          return
        }
        inFlight = true
        void api.hide(binding.identity).then(
          (snapshot) => {
            inFlight = false
            if (disposed || sequence !== sequenceRef.current) {
              return
            }
            visibleOwnerKeyRef.current = null
            applySnapshot(sequence, snapshot)
            if (dirty) {
              dirty = false
              schedulePublish()
            }
          },
          () => {
            inFlight = false
            if (!disposed && sequence === sequenceRef.current) {
              setState({ kind: 'error' })
            }
          }
        )
        return
      }
      const request: DiscordWebFastResponseAttach = {
        ...binding.identity,
        rectCss: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        rendererZoomFactor: rendererZoomFactor()
      }
      const operation =
        ownerKeyRef.current !== ownerKey
          ? api.attach(request)
          : visibleOwnerKeyRef.current !== ownerKey
            ? api.show(binding.identity).then(() => api.updateBounds(request))
            : api.updateBounds(request)
      inFlight = true
      void operation.then(
        (snapshot) => {
          inFlight = false
          if (disposed || sequence !== sequenceRef.current) {
            return
          }
          ownerKeyRef.current = ownerKey
          visibleOwnerKeyRef.current = ownerKey
          applySnapshot(sequence, snapshot)
          if (dirty) {
            dirty = false
            schedulePublish()
          }
        },
        () => {
          inFlight = false
          if (!disposed && sequence === sequenceRef.current) {
            setState({ kind: 'error' })
          }
        }
      )
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
    }
  }, [applySnapshot, binding, element, recoveryEpoch])

  useEffect(() => {
    const api = window.api.discordWebFastResponse
    if (!binding || !api) {
      setState({ kind: 'inactive' })
      return
    }
    const ownerKey = identityKey(binding.identity)
    if (binding.visible || ownerKeyRef.current !== ownerKey) {
      return
    }
    const sequence = ++sequenceRef.current
    void api.hide(binding.identity).then(
      (snapshot) => {
        if (sequence === sequenceRef.current) {
          visibleOwnerKeyRef.current = null
        }
        applySnapshot(sequence, snapshot)
      },
      () => undefined
    )
  }, [applySnapshot, binding])

  useEffect(() => {
    const api = window.api.discordWebFastResponse
    if (!binding || !api) {
      return
    }
    return api.onStateChanged((event) => {
      const current = bindingRef.current
      if (!current || identityKey(current.identity) !== identityKey(event.identity)) {
        return
      }
      if (event.state === 'crashed') {
        const ownerKey = identityKey(event.identity)
        ownerKeyRef.current = null
        visibleOwnerKeyRef.current = null
        setState({ kind: 'crashed' })
        if (current.visible && event.recoverable && recoveredOwnerKeyRef.current !== ownerKey) {
          recoveredOwnerKeyRef.current = ownerKey
          setRecoveryEpoch((value) => value + 1)
        }
      } else if (event.state === 'error') {
        setState({ kind: 'error' })
      } else {
        setState({
          kind: event.state === 'loading' ? 'loading' : 'ready',
          contentMode: event.contentMode
        })
      }
    })
  }, [binding])

  useEffect(
    () => () => {
      const current = bindingRef.current
      const api = window.api.discordWebFastResponse
      if (!current || !api || ownerKeyRef.current !== identityKey(current.identity)) {
        return
      }
      ownerKeyRef.current = null
      visibleOwnerKeyRef.current = null
      void api.hide(current.identity).catch(() => undefined)
    },
    []
  )

  return state
}
