import type { CommunicationProviderId } from './communication-integrations'
import type { DiscordVoiceSnapshot } from './discord-voice'
import type { FloatingWorkspaceAppId } from './floating-workspace-apps'

export const FLOATING_COMMS_SURFACE_MAX_HEIGHT = 420

export function clampFloatingCommsSurfaceHeight(height: number): number {
  const rounded = Number.isFinite(height) ? Math.round(height) : 1
  return Math.min(Math.max(rounded, 1), FLOATING_COMMS_SURFACE_MAX_HEIGHT)
}

export type FloatingCommsAnchorRect = {
  x: number
  y: number
  width: number
  height: number
}

export type FloatingCommsSurfaceIdentity = {
  appId: FloatingWorkspaceAppId
  requestId: number
}

export type FloatingCommsOpenRequest = FloatingCommsSurfaceIdentity & {
  anchor: FloatingCommsAnchorRect
  height: number
}

export type FloatingCommsOpenResult = { mode: 'window' | 'dom' }

export type FloatingCommsCloseRequest = {
  requestId: number
}

export type FloatingCommsMeasureRequest = FloatingCommsCloseRequest & {
  height: number
}

export type FloatingCommsSurfaceVisibility = FloatingCommsSurfaceIdentity & {
  visible: boolean
}

export type FloatingCommsSurfaceState = FloatingCommsSurfaceIdentity & {
  discord: DiscordVoiceSnapshot
  overlayOpen: boolean
  visible: boolean
}

export type FloatingCommsAction = FloatingCommsSurfaceIdentity &
  ({ type: 'open-app' } | { type: 'open-settings'; provider: CommunicationProviderId })

export type FloatingCommsDiscordCommand = { appId: 'discord'; requestId: number } & (
  | { method: 'reconnect' }
  | { method: 'set-self-mute'; muted: boolean }
  | { method: 'set-self-deaf'; deafened: boolean }
  | { method: 'leave-call' }
  | { method: 'set-overlay-open'; open: boolean }
)
