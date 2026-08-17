import type { FloatingCommsSurfaceIdentity } from '../../../../../shared/floating-comms-surface'
import {
  clearWhatsAppFastResponseViewportHidden,
  isWhatsAppFastResponseViewportHidden
} from './whatsapp-fast-response-viewport-state'

export async function closeFloatingCommsAttachedSurface(
  identity: FloatingCommsSurfaceIdentity
): Promise<void> {
  let hideError: unknown
  if (
    identity.appId === 'whatsapp-web' &&
    identity.mode === 'attached-dom' &&
    !isWhatsAppFastResponseViewportHidden(identity)
  ) {
    try {
      await window.api.whatsappFastResponse.hide({
        target: 'attached',
        appId: 'whatsapp-web',
        requestId: identity.requestId,
        surfaceId: identity.surfaceId,
        mode: identity.mode
      })
    } catch (error) {
      hideError = error
    }
  }
  if (identity.appId === 'slack' && identity.mode === 'attached-dom') {
    try {
      await window.api.slackFastResponse.hide({
        target: 'attached',
        appId: 'slack',
        requestId: identity.requestId,
        surfaceId: identity.surfaceId,
        mode: identity.mode
      })
    } catch (error) {
      hideError = error
    }
  }
  if (
    identity.appId === 'discord' &&
    identity.mode === 'attached-dom' &&
    window.api.discordWebFastResponse
  ) {
    try {
      await window.api.discordWebFastResponse.hide({
        target: 'attached',
        appId: 'discord',
        requestId: identity.requestId,
        surfaceId: identity.surfaceId,
        mode: identity.mode
      })
    } catch (error) {
      hideError = error
    }
  }
  let closeError: unknown
  try {
    await window.api.floatingComms.closeAttached(identity)
  } catch (error) {
    closeError = error
  } finally {
    if (identity.appId === 'whatsapp-web' && identity.mode === 'attached-dom') {
      clearWhatsAppFastResponseViewportHidden(identity)
    }
  }
  if (hideError !== undefined) {
    throw hideError
  }
  if (closeError !== undefined) {
    throw closeError
  }
}
