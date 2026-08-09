import type {
  CommunicationIntegrationStatus,
  CommunicationProviderId
} from './communication-integrations'
import type { DiscordVoiceSnapshot } from './discord-voice'
import type { FloatingWorkspaceAppId } from './floating-workspace-apps'

export type FloatingCommsAnchorRect = {
  x: number
  y: number
  width: number
  height: number
}

export type FloatingCommsOpenRequest = {
  appId: FloatingWorkspaceAppId
  anchor: FloatingCommsAnchorRect
  height: number
}

export type FloatingCommsOpenResult = { mode: 'window' | 'dom' }

export type FloatingCommsSurfaceState = {
  appId: FloatingWorkspaceAppId
  discord: DiscordVoiceSnapshot
  integrations: readonly CommunicationIntegrationStatus[]
  overlayOpen: boolean
  visible: boolean
}

export type FloatingCommsAction =
  | { type: 'open-app'; appId: FloatingWorkspaceAppId }
  | { type: 'open-settings'; provider: CommunicationProviderId }

export type FloatingCommsDiscordCommand =
  | { method: 'reconnect' }
  | { method: 'set-self-mute'; muted: boolean }
  | { method: 'set-self-deaf'; deafened: boolean }
  | { method: 'leave-call' }
  | { method: 'set-overlay-open'; open: boolean }
