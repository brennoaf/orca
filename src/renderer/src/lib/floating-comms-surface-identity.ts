import type { FloatingCommsSurfaceIdentity } from '../../../shared/floating-comms-surface'

export function isReopenedAttachedSurface(
  current: FloatingCommsSurfaceIdentity | null,
  next: FloatingCommsSurfaceIdentity
): boolean {
  return (
    current?.appId === next.appId &&
    current.mode === 'attached-native' &&
    next.mode === 'attached-native'
  )
}
