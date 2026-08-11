import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type {
  WhatsAppFastResponseAttach,
  WhatsAppFastResponseSnapshot,
  WhatsAppFastResponseVisibility
} from '../../../../../shared/whatsapp-fast-response'

export type WhatsAppFastResponseHostBinding = {
  identity: WhatsAppFastResponseVisibility
  visible: boolean
  collapsed?: boolean
}

export type WhatsAppFastResponseHostState =
  | { kind: 'inactive' }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'crashed'; recoverable: boolean }
  | { kind: 'error'; recoverable: boolean }

function identityKey(identity: WhatsAppFastResponseVisibility): string {
  return identity.target === 'attached'
    ? `attached:${identity.requestId}:${identity.surfaceId}:${identity.mode}`
    : `dock:${identity.generation}:${identity.revision}:${identity.tabId}`
}

function snapshotState(snapshot: WhatsAppFastResponseSnapshot): WhatsAppFastResponseHostState {
  if (snapshot.crashed) {
    return { kind: 'crashed', recoverable: true }
  }
  return snapshot.loaded ? { kind: 'ready' } : { kind: 'loading' }
}

function geometryKey(request: WhatsAppFastResponseAttach): string {
  const { x, y, width, height } = request.rectCss
  return `${identityKey(request)}:${x}:${y}:${width}:${height}:${request.rendererZoomFactor}`
}

function rendererZoomFactor(): number {
  return Math.pow(1.2, window.api.ui.getZoomLevel())
}

export function useWhatsAppFastResponseHost({
  binding,
  element
}: {
  binding?: WhatsAppFastResponseHostBinding
  element: HTMLDivElement | null
}): WhatsAppFastResponseHostState {
  const [state, setState] = useState<WhatsAppFastResponseHostState>({ kind: 'inactive' })
  const [recoveryEpoch, setRecoveryEpoch] = useState(0)
  const sequenceRef = useRef(0)
  const mountedRef = useRef(false)
  const ownerKeyRef = useRef<string | null>(null)
  const geometryKeyRef = useRef<string | null>(null)
  const visibleRef = useRef(false)
  const recoveryBindingKeyRef = useRef<string | null>(null)
  const recoveredOwnerKeyRef = useRef<string | null>(null)
  const bindingRef = useRef(binding)
  const elementRef = useRef(element)
  bindingRef.current = binding
  elementRef.current = element

  useEffect(() => {
    const nextKey = binding ? identityKey(binding.identity) : null
    if (recoveryBindingKeyRef.current === nextKey) {
      return
    }
    recoveryBindingKeyRef.current = nextKey
    recoveredOwnerKeyRef.current = null
  }, [binding])

  useLayoutEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const applySnapshot = useCallback(
    (sequence: number, snapshot: WhatsAppFastResponseSnapshot): void => {
      if (mountedRef.current && sequence === sequenceRef.current) {
        setState(snapshotState(snapshot))
      }
    },
    []
  )

  const reportError = useCallback((sequence: number, ownerKey: string): void => {
    const currentBinding = bindingRef.current
    if (
      !mountedRef.current ||
      sequence !== sequenceRef.current ||
      !currentBinding ||
      identityKey(currentBinding.identity) !== ownerKey
    ) {
      return
    }
    setState({
      kind: 'error',
      recoverable: true
    })
  }, [])

  useLayoutEffect(() => {
    const currentBinding = bindingRef.current
    const currentElement = elementRef.current
    if (!currentBinding || !currentElement || !currentBinding.visible) {
      return
    }
    const sequence = ++sequenceRef.current
    const ownerKey = identityKey(currentBinding.identity)
    let disposed = false
    let frame: number | null = null

    const publish = (): void => {
      const rect = currentElement.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        return
      }
      const request: WhatsAppFastResponseAttach = {
        ...currentBinding.identity,
        rectCss: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        rendererZoomFactor: rendererZoomFactor()
      }
      const nextGeometryKey = geometryKey(request)
      const attach = ownerKeyRef.current !== ownerKey
      if (!attach && geometryKeyRef.current === nextGeometryKey) {
        return
      }
      const operation = attach
        ? window.api.whatsappFastResponse.attach(request)
        : window.api.whatsappFastResponse.updateBounds(request)
      void operation.then(
        (snapshot) => {
          if (disposed || sequence !== sequenceRef.current) {
            if (attach) {
              void window.api.whatsappFastResponse.hide(currentBinding.identity).catch(() => void 0)
            }
            return
          }
          ownerKeyRef.current = ownerKey
          geometryKeyRef.current = nextGeometryKey
          visibleRef.current = true
          applySnapshot(sequence, snapshot)
        },
        () => reportError(sequence, ownerKey)
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
    const observer = new ResizeObserver(schedulePublish)
    observer.observe(currentElement)
    window.addEventListener('resize', schedulePublish)
    window.addEventListener('scroll', schedulePublish, true)
    window.visualViewport?.addEventListener('resize', schedulePublish)
    window.visualViewport?.addEventListener('scroll', schedulePublish)
    return () => {
      disposed = true
      sequenceRef.current += 1
      observer.disconnect()
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
      window.removeEventListener('resize', schedulePublish)
      window.removeEventListener('scroll', schedulePublish, true)
      window.visualViewport?.removeEventListener('resize', schedulePublish)
      window.visualViewport?.removeEventListener('scroll', schedulePublish)
    }
  }, [applySnapshot, binding, element, recoveryEpoch, reportError])

  useEffect(() => {
    if (!binding) {
      setState({ kind: 'inactive' })
      return
    }
    const ownerKey = identityKey(binding.identity)
    if (ownerKeyRef.current !== ownerKey || binding.visible === visibleRef.current) {
      return
    }
    const sequence = ++sequenceRef.current
    const operation = binding.visible
      ? window.api.whatsappFastResponse.show(binding.identity)
      : binding.collapsed
        ? window.api.whatsappFastResponse.collapse(binding.identity)
        : window.api.whatsappFastResponse.hide(binding.identity)
    void operation.then(
      (snapshot) => {
        if (sequence === sequenceRef.current) {
          visibleRef.current = binding.visible
        }
        applySnapshot(sequence, snapshot)
      },
      () => {
        if (binding.visible) {
          reportError(sequence, ownerKey)
        }
      }
    )
  }, [applySnapshot, binding, reportError])

  useEffect(
    () =>
      window.api.whatsappFastResponse.onStateChanged((event) => {
        const currentBinding = bindingRef.current
        if (!currentBinding) {
          return
        }
        const eventOwnerKey = identityKey(event.identity)
        const currentOwnerKey = identityKey(currentBinding.identity)
        if (currentOwnerKey !== eventOwnerKey) {
          return
        }
        ownerKeyRef.current = currentOwnerKey
        if (event.state === 'loading' || event.state === 'ready') {
          setState({ kind: event.state })
          return
        }
        if (event.state === 'crashed') {
          ownerKeyRef.current = null
          geometryKeyRef.current = null
          visibleRef.current = false
          setState({ kind: 'crashed', recoverable: event.recoverable })
          if (event.recoverable && recoveredOwnerKeyRef.current !== eventOwnerKey) {
            recoveredOwnerKeyRef.current = eventOwnerKey
            setRecoveryEpoch((current) => current + 1)
          }
          return
        }
        setState({
          kind: 'error',
          recoverable: event.recoverable
        })
      }),
    []
  )

  useEffect(
    () => () => {
      const currentBinding = bindingRef.current
      if (!currentBinding || ownerKeyRef.current !== identityKey(currentBinding.identity)) {
        return
      }
      sequenceRef.current += 1
      ownerKeyRef.current = null
      geometryKeyRef.current = null
      visibleRef.current = false
      void window.api.whatsappFastResponse.hide(currentBinding.identity).catch(() => void 0)
    },
    []
  )

  return state
}
