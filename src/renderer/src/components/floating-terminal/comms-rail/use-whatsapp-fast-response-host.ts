import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { WhatsAppFastResponseSnapshot } from '../../../../../shared/whatsapp-fast-response'
import { clearWhatsAppFastResponseViewportHidden } from './whatsapp-fast-response-viewport-state'
import {
  whatsappFastResponseIdentityKey,
  whatsappFastResponseSnapshotState,
  type WhatsAppFastResponseHostBinding,
  type WhatsAppFastResponseHostState
} from './whatsapp-fast-response-host-state'
import { useWhatsAppFastResponseViewportSync } from './use-whatsapp-fast-response-viewport-sync'

export type { WhatsAppFastResponseHostBinding, WhatsAppFastResponseHostState }

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
  const viewportHiddenOwnerKeyRef = useRef<string | null>(null)
  const recoveryBindingKeyRef = useRef<string | null>(null)
  const recoveredOwnerKeyRef = useRef<string | null>(null)
  const bindingRef = useRef(binding)
  const elementRef = useRef(element)
  bindingRef.current = binding
  elementRef.current = element

  useEffect(() => {
    const nextKey = binding ? whatsappFastResponseIdentityKey(binding.identity) : null
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
        setState(whatsappFastResponseSnapshotState(snapshot))
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
      whatsappFastResponseIdentityKey(currentBinding.identity) !== ownerKey
    ) {
      return
    }
    setState({ kind: 'error', recoverable: true })
  }, [])
  useWhatsAppFastResponseViewportSync({
    binding,
    element,
    recoveryEpoch,
    bindingRef,
    elementRef,
    sequenceRef,
    ownerKeyRef,
    geometryKeyRef,
    visibleRef,
    viewportHiddenOwnerKeyRef,
    applySnapshot,
    reportError
  })
  useEffect(() => {
    if (!binding) {
      setState({ kind: 'inactive' })
      return
    }
    const ownerKey = whatsappFastResponseIdentityKey(binding.identity)
    if (
      ownerKeyRef.current !== ownerKey ||
      binding.visible === visibleRef.current ||
      viewportHiddenOwnerKeyRef.current === ownerKey
    ) {
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
        const eventOwnerKey = whatsappFastResponseIdentityKey(event.identity)
        const currentOwnerKey = whatsappFastResponseIdentityKey(currentBinding.identity)
        if (currentOwnerKey !== eventOwnerKey) {
          return
        }
        ownerKeyRef.current = currentOwnerKey
        if (event.state === 'loading' || event.state === 'ready') {
          setState({ kind: event.state, contentMode: event.contentMode })
          return
        }
        if (event.state === 'crashed') {
          ownerKeyRef.current = null
          geometryKeyRef.current = null
          visibleRef.current = false
          if (viewportHiddenOwnerKeyRef.current === eventOwnerKey) {
            viewportHiddenOwnerKeyRef.current = null
          }
          if (event.identity.target === 'attached') {
            clearWhatsAppFastResponseViewportHidden(event.identity)
          }
          setState({ kind: 'crashed', recoverable: event.recoverable })
          if (event.recoverable && recoveredOwnerKeyRef.current !== eventOwnerKey) {
            recoveredOwnerKeyRef.current = eventOwnerKey
            setRecoveryEpoch((current) => current + 1)
          }
          return
        }
        setState({ kind: 'error', recoverable: event.recoverable })
      }),
    []
  )
  useEffect(
    () => () => {
      const currentBinding = bindingRef.current
      if (
        !currentBinding ||
        ownerKeyRef.current !== whatsappFastResponseIdentityKey(currentBinding.identity)
      ) {
        return
      }
      sequenceRef.current += 1
      ownerKeyRef.current = null
      geometryKeyRef.current = null
      visibleRef.current = false
      if (
        viewportHiddenOwnerKeyRef.current ===
        whatsappFastResponseIdentityKey(currentBinding.identity)
      ) {
        return
      }
      void window.api.whatsappFastResponse.hide(currentBinding.identity).catch(() => void 0)
    },
    []
  )
  return state
}
