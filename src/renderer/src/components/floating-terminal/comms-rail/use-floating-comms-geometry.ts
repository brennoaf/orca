import { useEffect, useRef, type RefObject } from 'react'
import type {
  FloatingCommsGeometryRequest,
  FloatingCommsOpenRequest,
  FloatingCommsSurfaceIdentity,
  FloatingCommsUpdateRequest
} from '../../../../../shared/floating-comms-surface'
import { FLOATING_COMMS_SURFACE_DEFAULT_HEIGHT } from '../../../../../shared/floating-comms-surface'
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
    height: FLOATING_COMMS_SURFACE_DEFAULT_HEIGHT
  }
}

function createFloatingCommsUpdateRequest(
  request: FloatingCommsGeometryRequest,
  element: HTMLElement,
  workspaceElement: HTMLElement
): FloatingCommsUpdateRequest {
  return {
    ...createFloatingCommsOpenRequest(request.appId, element, workspaceElement, request.requestId),
    surfaceId: request.surfaceId,
    mode: request.mode,
    geometryRequestId: request.geometryRequestId
  }
}

export function useFloatingCommsGeometry({
  panelRef,
  buttonRefs,
  attachedIdentityRef,
  close
}: {
  panelRef: RefObject<HTMLDivElement | null>
  buttonRefs: CurrentRef<Map<FloatingWorkspaceAppId, HTMLButtonElement>>
  attachedIdentityRef: CurrentRef<FloatingCommsSurfaceIdentity | null>
  close: () => void
}): void {
  const geometryFrameRef = useRef<number | null>(null)

  useEffect(() => {
    const surface = window.api.floatingComms
    if (!surface) {
      return
    }
    const release = surface.onGeometryRequested((request: FloatingCommsGeometryRequest) => {
      const current = attachedIdentityRef.current
      if (!current || current.surfaceId !== request.surfaceId || current.mode !== request.mode) {
        return
      }
      if (geometryFrameRef.current !== null) {
        cancelAnimationFrame(geometryFrameRef.current)
      }
      geometryFrameRef.current = requestAnimationFrame(() => {
        geometryFrameRef.current = null
        const latest = attachedIdentityRef.current
        if (!latest || latest.surfaceId !== request.surfaceId || latest.mode !== request.mode) {
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
          .catch((error: unknown) => {
            console.error('[floating-comms] update failed:', error)
            if (attachedIdentityRef.current?.surfaceId === request.surfaceId) {
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
  }, [attachedIdentityRef, buttonRefs, close, panelRef])
}
