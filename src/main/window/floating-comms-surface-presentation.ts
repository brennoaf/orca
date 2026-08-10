import type {
  FloatingCommsSessionState,
  FloatingCommsSurfaceChanged,
  FloatingCommsSurfaceChangedReason,
  FloatingCommsSurfaceIdentity,
  FloatingCommsSurfacePresentation
} from '../../shared/floating-comms-surface'
import { sendToTrustedUIRenderer, getTrustedUIRendererWindow } from '../ipc/ui'
import { getDiscordVoiceSnapshot } from '../messaging/discord-voice-service'
import { getDiscordVoiceOverlayState } from './discord-voice-window'

export function createFloatingCommsPresentation(
  identity: FloatingCommsSurfaceIdentity,
  sessionState: FloatingCommsSessionState,
  visible: boolean
): FloatingCommsSurfacePresentation {
  return {
    ...identity,
    discord: getDiscordVoiceSnapshot(),
    overlayOpen: getDiscordVoiceOverlayState().open,
    sessionState,
    visible
  }
}

export function emitFloatingCommsSurfaceChange(
  previous: FloatingCommsSurfaceIdentity | null,
  current: FloatingCommsSurfaceIdentity | null,
  reason: FloatingCommsSurfaceChangedReason,
  sessionState: FloatingCommsSessionState | null
): void {
  sendToTrustedUIRenderer(
    'floatingComms:surfaceChanged',
    createFloatingCommsSurfaceChange(previous, current, reason, sessionState)
  )
}

export function createFloatingCommsSurfaceChange(
  previous: FloatingCommsSurfaceIdentity | null,
  current: FloatingCommsSurfaceIdentity | null,
  reason: FloatingCommsSurfaceChangedReason,
  sessionState: FloatingCommsSessionState | null
): FloatingCommsSurfaceChanged {
  const appId = current?.appId ?? previous?.appId
  if (!appId) {
    throw new Error('floating_comms_change_identity_missing')
  }
  return { appId, previous, current, reason, sessionState }
}

export function restoreFloatingCommsMainWindow(): void {
  const window = getTrustedUIRendererWindow()
  if (!window || window.isDestroyed()) {
    throw new Error('floating_comms_main_window_unavailable')
  }
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
}
