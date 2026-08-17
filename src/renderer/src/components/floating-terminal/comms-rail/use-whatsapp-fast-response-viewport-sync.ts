import { useLayoutEffect } from 'react'
import type { MutableRefObject } from 'react'
import type {
  WhatsAppFastResponseAttach,
  WhatsAppFastResponseSnapshot
} from '../../../../../shared/whatsapp-fast-response'
import {
  clearWhatsAppFastResponseViewportHidden,
  markWhatsAppFastResponseViewportHidden
} from './whatsapp-fast-response-viewport-state'
import {
  whatsappFastResponseGeometryKey,
  whatsappFastResponseIdentityKey,
  type WhatsAppFastResponseHostBinding
} from './whatsapp-fast-response-host-state'

type ViewportSyncOptions = {
  binding?: WhatsAppFastResponseHostBinding
  element: HTMLDivElement | null
  recoveryEpoch: number
  bindingRef: MutableRefObject<WhatsAppFastResponseHostBinding | undefined>
  elementRef: MutableRefObject<HTMLDivElement | null>
  sequenceRef: MutableRefObject<number>
  ownerKeyRef: MutableRefObject<string | null>
  geometryKeyRef: MutableRefObject<string | null>
  visibleRef: MutableRefObject<boolean>
  viewportHiddenOwnerKeyRef: MutableRefObject<string | null>
  applySnapshot: (sequence: number, snapshot: WhatsAppFastResponseSnapshot) => void
  reportError: (sequence: number, ownerKey: string) => void
}

function readLatestBinding(
  bindingRef: MutableRefObject<WhatsAppFastResponseHostBinding | undefined>
): WhatsAppFastResponseHostBinding | undefined {
  return bindingRef.current
}

function rendererZoomFactor(): number {
  return Math.pow(1.2, window.api.ui.getZoomLevel())
}

function intersectsOwnerViewport(element: HTMLElement, rect: DOMRect): boolean {
  const ownerWindow = element.ownerDocument.defaultView
  return (
    ownerWindow !== null &&
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < ownerWindow.innerWidth &&
    rect.top < ownerWindow.innerHeight
  )
}

export function useWhatsAppFastResponseViewportSync({
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
}: ViewportSyncOptions): void {
  useLayoutEffect(() => {
    const currentBinding = bindingRef.current
    const currentElement = elementRef.current
    if (!currentBinding || !currentElement || !currentBinding.visible) {
      return
    }
    const sequence = ++sequenceRef.current
    const ownerKey = whatsappFastResponseIdentityKey(currentBinding.identity)
    let disposed = false
    let frame: number | null = null
    let viewportDesiredVisible = true
    let viewportActuallyHidden = viewportHiddenOwnerKeyRef.current === ownerKey
    let viewportReconcileQueued = false
    let viewportOperation = Promise.resolve()
    const markViewportHidden = (): void => {
      if (currentBinding.identity.target === 'attached') {
        markWhatsAppFastResponseViewportHidden(currentBinding.identity)
      }
    }
    const clearViewportHidden = (): void => {
      if (currentBinding.identity.target === 'attached') {
        clearWhatsAppFastResponseViewportHidden(currentBinding.identity)
      }
    }
    const isCurrent = (): boolean => {
      const latestBinding = readLatestBinding(bindingRef)
      return (
        !disposed &&
        sequence === sequenceRef.current &&
        latestBinding !== undefined &&
        whatsappFastResponseIdentityKey(latestBinding.identity) === ownerKey
      )
    }
    const currentRequest = (): WhatsAppFastResponseAttach | null => {
      const rect = currentElement.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0 || !intersectsOwnerViewport(currentElement, rect)) {
        return null
      }
      return {
        ...currentBinding.identity,
        rectCss: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        rendererZoomFactor: rendererZoomFactor()
      }
    }
    const queueViewportReconcile = (): void => {
      if (disposed || viewportReconcileQueued) {
        return
      }
      viewportReconcileQueued = true
      viewportOperation = viewportOperation.then(async () => {
        while (isCurrent() && viewportDesiredVisible === viewportActuallyHidden) {
          if (!viewportDesiredVisible) {
            viewportHiddenOwnerKeyRef.current = ownerKey
            markViewportHidden()
            let snapshot: WhatsAppFastResponseSnapshot
            try {
              snapshot = await window.api.whatsappFastResponse.hide(currentBinding.identity)
            } catch {
              if (viewportHiddenOwnerKeyRef.current === ownerKey) {
                viewportHiddenOwnerKeyRef.current = null
              }
              clearViewportHidden()
              if (viewportDesiredVisible) {
                reportError(sequence, ownerKey)
              }
              return
            }
            if (!isCurrent()) {
              return
            }
            viewportActuallyHidden = true
            visibleRef.current = false
            applySnapshot(sequence, snapshot)
            continue
          }
          const request = currentRequest()
          if (!request) {
            viewportDesiredVisible = false
            continue
          }
          const nextGeometryKey = whatsappFastResponseGeometryKey(request)
          const attach = ownerKeyRef.current !== ownerKey
          let snapshot: WhatsAppFastResponseSnapshot
          try {
            snapshot = attach
              ? await window.api.whatsappFastResponse.attach(request)
              : await window.api.whatsappFastResponse.updateBounds(request)
          } catch {
            reportError(sequence, ownerKey)
            return
          }
          if (!isCurrent()) {
            return
          }
          ownerKeyRef.current = ownerKey
          geometryKeyRef.current = nextGeometryKey
          if (attach) {
            viewportActuallyHidden = false
            visibleRef.current = true
            if (viewportHiddenOwnerKeyRef.current === ownerKey) {
              viewportHiddenOwnerKeyRef.current = null
            }
            clearViewportHidden()
            applySnapshot(sequence, snapshot)
            continue
          }
          const latestRequest = currentRequest()
          if (!viewportDesiredVisible || !latestRequest) {
            viewportDesiredVisible = false
            continue
          }
          if (whatsappFastResponseGeometryKey(latestRequest) !== nextGeometryKey) {
            continue
          }
          try {
            snapshot = await window.api.whatsappFastResponse.show(currentBinding.identity)
          } catch {
            reportError(sequence, ownerKey)
            return
          }
          if (!isCurrent()) {
            return
          }
          viewportActuallyHidden = false
          visibleRef.current = true
          if (viewportHiddenOwnerKeyRef.current === ownerKey) {
            viewportHiddenOwnerKeyRef.current = null
          }
          clearViewportHidden()
          applySnapshot(sequence, snapshot)
        }
      })
      void viewportOperation.then(() => {
        viewportReconcileQueued = false
      })
    }
    const publish = (): void => {
      if (disposed) {
        return
      }
      const request = currentRequest()
      if (!request) {
        viewportDesiredVisible = false
        if (ownerKeyRef.current === ownerKey) {
          queueViewportReconcile()
        }
        return
      }
      viewportDesiredVisible = true
      if (
        viewportReconcileQueued ||
        viewportActuallyHidden ||
        viewportHiddenOwnerKeyRef.current === ownerKey
      ) {
        queueViewportReconcile()
        return
      }
      const nextGeometryKey = whatsappFastResponseGeometryKey(request)
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
            return
          }
          ownerKeyRef.current = ownerKey
          geometryKeyRef.current = nextGeometryKey
          visibleRef.current = true
          applySnapshot(sequence, snapshot)
          if (!viewportDesiredVisible) {
            queueViewportReconcile()
          }
        },
        () => reportError(sequence, ownerKey)
      )
    }
    const schedulePublish = (): void => {
      if (disposed) {
        return
      }
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
    const intersectionObserver = new IntersectionObserver(schedulePublish, { root: null })
    intersectionObserver.observe(currentElement)
    window.addEventListener('resize', schedulePublish)
    window.addEventListener('scroll', schedulePublish, true)
    window.visualViewport?.addEventListener('resize', schedulePublish)
    window.visualViewport?.addEventListener('scroll', schedulePublish)
    return () => {
      disposed = true
      sequenceRef.current += 1
      observer.disconnect()
      intersectionObserver.disconnect()
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
      window.removeEventListener('resize', schedulePublish)
      window.removeEventListener('scroll', schedulePublish, true)
      window.visualViewport?.removeEventListener('resize', schedulePublish)
      window.visualViewport?.removeEventListener('scroll', schedulePublish)
      const latestBinding = readLatestBinding(bindingRef)
      if (
        viewportHiddenOwnerKeyRef.current === ownerKey &&
        currentBinding.identity.target === 'attached' &&
        (!latestBinding || whatsappFastResponseIdentityKey(latestBinding.identity) !== ownerKey)
      ) {
        clearWhatsAppFastResponseViewportHidden(currentBinding.identity)
      }
    }
  }, [
    applySnapshot,
    binding,
    bindingRef,
    element,
    elementRef,
    geometryKeyRef,
    ownerKeyRef,
    recoveryEpoch,
    reportError,
    sequenceRef,
    viewportHiddenOwnerKeyRef,
    visibleRef
  ])
}
