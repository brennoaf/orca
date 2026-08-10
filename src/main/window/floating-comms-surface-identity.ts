import type { FloatingCommsSurfaceIdentity } from '../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'

export function sameFloatingCommsSurfaceIdentity(
  left: FloatingCommsSurfaceIdentity,
  right: FloatingCommsSurfaceIdentity
): boolean {
  return (
    left.appId === right.appId &&
    left.requestId === right.requestId &&
    left.surfaceId === right.surfaceId &&
    left.mode === right.mode
  )
}

export function createFloatingCommsSurfaceIdentity(
  request: { appId: FloatingWorkspaceAppId; requestId: number },
  mode: FloatingCommsSurfaceIdentity['mode'],
  nextSurfaceId: number
): FloatingCommsSurfaceIdentity {
  if (nextSurfaceId >= Number.MAX_SAFE_INTEGER) {
    throw new Error('floating_comms_surface_id_exhausted')
  }
  return {
    appId: request.appId,
    requestId: request.requestId,
    surfaceId: nextSurfaceId + 1,
    mode
  }
}
