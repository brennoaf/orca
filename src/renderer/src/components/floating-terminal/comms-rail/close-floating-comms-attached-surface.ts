import type { FloatingCommsSurfaceIdentity } from '../../../../../shared/floating-comms-surface'

export async function closeFloatingCommsAttachedSurface(
  identity: FloatingCommsSurfaceIdentity
): Promise<void> {
  if (identity.appId === 'whatsapp-web' && identity.mode === 'attached-native') {
    await window.api.whatsappFastResponse.hide({
      target: 'attached',
      appId: 'whatsapp-web',
      requestId: identity.requestId,
      surfaceId: identity.surfaceId,
      mode: identity.mode
    })
  }
  await window.api.floatingComms.closeAttached(identity)
}
