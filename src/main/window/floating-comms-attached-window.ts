import type { FloatingCommsSurfaceIdentity } from '../../shared/floating-comms-surface'
import { takeFloatingCommsSurfaceWindow } from './floating-comms-surface-window'

export function destroyAttachedFloatingCommsWindow(identity: FloatingCommsSurfaceIdentity): void {
  if (identity.mode !== 'attached-native') {
    return
  }
  const window = takeFloatingCommsSurfaceWindow(identity)
  if (window && !window.isDestroyed()) {
    window.destroy()
  }
}
