import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type {
  FloatingCommsGeometryRequest,
  FloatingCommsOpenRequest,
  FloatingCommsUpdateRequest
} from '../../../../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../../../../shared/floating-workspace-apps'

type CurrentRef<T> = {
  current: T
}

export function createFloatingCommsOpenRequest(
  appId: FloatingWorkspaceAppId,
  element: HTMLElement,
  workspaceElement: HTMLElement,
  requestId: number
): FloatingCommsOpenRequest {
  const rect = element.getBoundingClientRect()
  const workspaceRect = workspaceElement.getBoundingClientRect()
  return {
    appId,
    requestId,
    anchor: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    workspace: {
      x: workspaceRect.x,
      y: workspaceRect.y,
      width: workspaceRect.width,
      height: workspaceRect.height
    },
    height: 420
  }
}

function createFloatingCommsUpdateRequest(
  request: FloatingCommsGeometryRequest,
  element: HTMLElement,
  workspaceElement: HTMLElement
): FloatingCommsUpdateRequest {
  return {
    ...createFloatingCommsOpenRequest(request.appId, element, workspaceElement, request.requestId),
    geometryRequestId: request.geometryRequestId
  }
}

export function useFloatingCommsGeometry({
  panelRef,
  buttonRefs,
  openAppIdRef,
  requestSequenceRef,
  close,
  setDomFallback
}: {
  panelRef: RefObject<HTMLDivElement | null>
  buttonRefs: CurrentRef<Map<FloatingWorkspaceAppId, HTMLButtonElement>>
  openAppIdRef: CurrentRef<FloatingWorkspaceAppId | null>
  requestSequenceRef: CurrentRef<number>
  close: () => void
  setDomFallback: Dispatch<SetStateAction<boolean>>
}): void {
  const geometryFrameRef = useRef<number | null>(null)

  useEffect(() => {
    const surface = window.api.floatingComms
    if (!surface) {
      return
    }
    const release = surface.onGeometryRequested((request: FloatingCommsGeometryRequest) => {
      if (
        openAppIdRef.current !== request.appId ||
        requestSequenceRef.current !== request.requestId
      ) {
        return
      }
      if (geometryFrameRef.current !== null) {
        cancelAnimationFrame(geometryFrameRef.current)
      }
      geometryFrameRef.current = requestAnimationFrame(() => {
        geometryFrameRef.current = null
        if (
          openAppIdRef.current !== request.appId ||
          requestSequenceRef.current !== request.requestId
        ) {
          return
        }
        const button = buttonRefs.current.get(request.appId)
        const workspaceElement = panelRef.current
        if (!button || !workspaceElement) {
          close()
          return
        }
        void surface
          .update(createFloatingCommsUpdateRequest(request, button, workspaceElement))
          .then((result) => {
            if (
              result?.mode === 'dom' &&
              openAppIdRef.current === request.appId &&
              requestSequenceRef.current === request.requestId
            ) {
              setDomFallback(true)
            }
          })
          .catch((error: unknown) => {
            console.error('[floating-comms] update failed:', error)
            if (
              openAppIdRef.current === request.appId &&
              requestSequenceRef.current === request.requestId
            ) {
              close()
            }
          })
      })
    })
    return () => {
      release()
      if (geometryFrameRef.current !== null) {
        cancelAnimationFrame(geometryFrameRef.current)
        geometryFrameRef.current = null
      }
    }
  }, [buttonRefs, close, openAppIdRef, panelRef, requestSequenceRef, setDomFallback])
}
