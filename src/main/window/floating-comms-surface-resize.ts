import type { BrowserWindow } from 'electron'
import {
  clampFloatingCommsSurfaceHeight,
  type FloatingCommsOpenRequest,
  type FloatingCommsSurfaceIdentity
} from '../../shared/floating-comms-surface'
import type { createFloatingCommsAttachedGeometry } from './floating-comms-attached-geometry'

type FloatingCommsSurfaceResizeCallbacks = {
  geometry: ReturnType<typeof createFloatingCommsAttachedGeometry>
  identity: () => FloatingCommsSurfaceIdentity | null
  isMeasured: () => boolean
  loaded: () => boolean
  matchesIdentity: (identity: FloatingCommsSurfaceIdentity) => boolean
  owner: () => BrowserWindow | null
  request: () => FloatingCommsOpenRequest | null
  setMeasured: (measured: boolean) => void
  setRequest: (request: FloatingCommsOpenRequest) => void
  setVisible: (identity: FloatingCommsSurfaceIdentity | null) => void
  window: () => BrowserWindow | null
}

export function createFloatingCommsSurfaceResizeCoordinator(
  callbacks: FloatingCommsSurfaceResizeCallbacks
): { resize: (requestIdentity: FloatingCommsSurfaceIdentity | number, height: number) => void } {
  return {
    resize(requestIdentity, height): void {
      const request = callbacks.request()
      const admittedIdentity =
        typeof requestIdentity === 'number'
          ? callbacks.identity()?.requestId === requestIdentity
          : callbacks.matchesIdentity(requestIdentity)
      if (!request || !admittedIdentity) {
        return
      }
      callbacks.setRequest({ ...request, height: clampFloatingCommsSurfaceHeight(height) })
      const window = callbacks.window()
      const firstMeasurement = Boolean(
        !callbacks.isMeasured() && callbacks.loaded() && window && !window.isDestroyed()
      )
      if (firstMeasurement) {
        callbacks.setMeasured(true)
      }
      if (callbacks.geometry.awaiting()) {
        if (firstMeasurement) {
          const identity = callbacks.identity()
          if (identity) {
            callbacks.geometry.recordFirstMeasurement(identity)
          }
        }
        return
      }
      const owner = callbacks.owner()
      if (!owner || callbacks.geometry.reposition(owner) !== true) {
        return
      }
      if (firstMeasurement && window && !window.isDestroyed()) {
        const identity = callbacks.identity()
        callbacks.setVisible(identity)
        if (window.isVisible()) {
          window.webContents.send('floatingComms:visibilityChanged', {
            ...identity,
            visible: true
          })
        } else {
          window.show()
        }
        window.focus()
      }
    }
  }
}
