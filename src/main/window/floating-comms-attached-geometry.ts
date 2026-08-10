import type { BrowserWindow } from 'electron'
import type {
  FloatingCommsOpenRequest,
  FloatingCommsSurfaceIdentity
} from '../../shared/floating-comms-surface'
import {
  createFloatingCommsGeometryCoordinator,
  getFloatingCommsSurfacePlacement
} from './floating-comms-surface-geometry'

type AttachedGeometryState = {
  identity: FloatingCommsSurfaceIdentity
  loaded: boolean
  measured: boolean
  request: FloatingCommsOpenRequest
  visible: FloatingCommsSurfaceIdentity | null
  window: BrowserWindow
}

type AttachedGeometryHost = {
  current: () => AttachedGeometryState | null
  destroy: () => void
  fallback: (identity: FloatingCommsSurfaceIdentity) => void
  isCurrentOwner: (owner: BrowserWindow) => boolean
  setVisible: (identity: FloatingCommsSurfaceIdentity) => void
}

export function createFloatingCommsAttachedGeometry(host: AttachedGeometryHost): {
  accept: (geometryRequestId: number | null) => boolean
  awaiting: () => boolean
  begin: (owner: BrowserWindow) => void
  recordFirstMeasurement: (identity: FloatingCommsSurfaceIdentity) => void
  reposition: (owner: BrowserWindow, freshGeometry?: boolean) => boolean | null
  reset: () => void
} {
  const coordinator = createFloatingCommsGeometryCoordinator({
    isCurrent: (owner, identity) => {
      const current = host.current()
      return Boolean(
        current &&
        host.isCurrentOwner(owner) &&
        current.identity.appId === identity.appId &&
        current.identity.requestId === identity.requestId &&
        current.identity.surfaceId === identity.surfaceId &&
        current.identity.mode === identity.mode
      )
    },
    onTimeout: (identity) => host.fallback(identity)
  })

  const reposition = (owner: BrowserWindow, freshGeometry = false): boolean | null => {
    const current = host.current()
    if (!current) {
      return null
    }
    if (!host.isCurrentOwner(owner)) {
      host.destroy()
      return null
    }
    if (coordinator.isAwaiting() && !freshGeometry) {
      return null
    }
    const placement = getFloatingCommsSurfacePlacement(owner, current.request)
    if (!placement) {
      host.fallback(current.identity)
      return false
    }
    current.window.setBounds(placement, false)
    if (freshGeometry) {
      const { suspendedRequest, shouldFocus } = coordinator.complete()
      if (
        suspendedRequest &&
        current.identity.appId === suspendedRequest.appId &&
        current.identity.requestId === suspendedRequest.requestId &&
        current.identity.surfaceId === suspendedRequest.surfaceId &&
        current.identity.mode === suspendedRequest.mode &&
        current.loaded &&
        current.measured
      ) {
        host.setVisible(current.identity)
        if (shouldFocus) {
          current.window.show()
          current.window.focus()
        } else {
          current.window.showInactive()
        }
      }
    }
    return true
  }

  return {
    accept: (geometryRequestId) => coordinator.accept(geometryRequestId),
    awaiting: () => coordinator.isAwaiting(),
    begin: (owner) => {
      const current = host.current()
      if (!host.isCurrentOwner(owner)) {
        host.destroy()
      } else if (current) {
        coordinator.begin(owner, current.identity, current.window, current.visible)
      }
    },
    recordFirstMeasurement: (identity) => coordinator.recordFirstMeasurement(identity),
    reposition,
    reset: () => coordinator.reset()
  }
}
