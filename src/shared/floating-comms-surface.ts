import type { CommunicationProviderId } from './communication-integrations'
import type { DiscordVoiceSnapshot } from './discord-voice'
import type { FloatingWorkspaceAppId } from './floating-workspace-apps'

export const FLOATING_COMMS_SURFACE_MAX_HEIGHT = 420
export const FLOATING_COMMS_SESSION_DRAFT_MAX_LENGTH = 4_096

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

export type FloatingCommsSurfaceMode = 'attached-native' | 'attached-dom' | 'detached'

export type FloatingCommsRequestIdentity = {
  appId: FloatingWorkspaceAppId
  requestId: number
}

export type FloatingCommsSurfaceIdentity = FloatingCommsRequestIdentity & {
  surfaceId: number
  mode: FloatingCommsSurfaceMode
}

export type FloatingCommsOpenRequest = FloatingCommsRequestIdentity & {
  anchor: FloatingCommsAnchorRect
  workspace: FloatingCommsAnchorRect
  height: number
}

export type FloatingCommsUpdateRequest = FloatingCommsSurfaceIdentity & {
  anchor: FloatingCommsAnchorRect
  workspace: FloatingCommsAnchorRect
  height: number
  geometryRequestId: number | null
}

export type FloatingCommsGeometryRequest = FloatingCommsSurfaceIdentity & {
  geometryRequestId: number
}

export type FloatingCommsOpenResult = {
  identity: FloatingCommsSurfaceIdentity
}

export type FloatingCommsCloseAttachedRequest = FloatingCommsSurfaceIdentity

export type FloatingCommsMeasureRequest = FloatingCommsSurfaceIdentity & {
  height: number
}

export type FloatingCommsSurfaceVisibility = FloatingCommsSurfaceIdentity & {
  visible: boolean
}

export type FloatingCommsWhatsAppSessionState = {
  appId: 'whatsapp-web'
  selectedConversationId: number | null
  draft: string
}

export type FloatingCommsSessionState =
  | FloatingCommsWhatsAppSessionState
  | { appId: 'slack' }
  | { appId: 'discord' }

export type FloatingCommsDetachRequest = FloatingCommsSurfaceIdentity & {
  sessionState: FloatingCommsSessionState
}

export type FloatingCommsMinimizeDetachedRequest = FloatingCommsDetachRequest

export type FloatingCommsFocusDetachedRequest = {
  appId: FloatingWorkspaceAppId
}

export type FloatingCommsCloseDetachedRequest = FloatingCommsFocusDetachedRequest

export type FloatingCommsDisableRequest = FloatingCommsFocusDetachedRequest

export type FloatingCommsPresentationTarget = FloatingCommsFocusDetachedRequest

export type FloatingCommsSurfaceChangedReason =
  | 'opened'
  | 'fallback'
  | 'detached'
  | 'minimized'
  | 'closed'
  | 'disabled'
  | 'crashed'

export type FloatingCommsSurfaceChanged = {
  appId: FloatingWorkspaceAppId
  previous: FloatingCommsSurfaceIdentity | null
  current: FloatingCommsSurfaceIdentity | null
  reason: FloatingCommsSurfaceChangedReason
  sessionState: FloatingCommsSessionState | null
}

export type FloatingCommsSurfacePresentation = FloatingCommsSurfaceIdentity & {
  discord: DiscordVoiceSnapshot
  overlayOpen: boolean
  sessionState: FloatingCommsSessionState
  visible: boolean
}

export type FloatingCommsAction = FloatingCommsSurfaceIdentity &
  ({ type: 'open-app' } | { type: 'open-settings'; provider: CommunicationProviderId })

export type FloatingCommsDiscordCommand = Omit<FloatingCommsSurfaceIdentity, 'appId'> & {
  appId: 'discord'
} & (
    | { method: 'reconnect' }
    | { method: 'set-self-mute'; muted: boolean }
    | { method: 'set-self-deaf'; deafened: boolean }
    | { method: 'leave-call' }
    | { method: 'set-overlay-open'; open: boolean }
  )
