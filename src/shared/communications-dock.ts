import type { CommunicationProviderId } from './communication-integrations'
import type { DiscordVoiceSnapshot } from './discord-voice'
import type {
  FloatingCommsSessionState,
  FloatingCommsSurfaceIdentity
} from './floating-comms-surface'
import type { FloatingWorkspaceAppId } from './floating-workspace-apps'

export const COMMUNICATIONS_DOCK_LAYOUT_VERSION = 1
export const COMMUNICATIONS_DOCK_MIN_RATIO = 0.15
export const COMMUNICATIONS_DOCK_MAX_RATIO = 0.85
export const COMMUNICATIONS_DOCK_MAX_APPS = 3
export const COMMUNICATIONS_DOCK_NAVBAR_MIN_HEIGHT = 28
export const COMMUNICATIONS_DOCK_NAVBAR_MAX_HEIGHT = 96

export type CommunicationsDockIdentity = {
  generation: number
  revision: number
}

export type CommunicationsDockBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type CommunicationsDockLayoutNode =
  | { type: 'leaf'; appId: FloatingWorkspaceAppId }
  | {
      type: 'split'
      direction: 'horizontal' | 'vertical'
      ratio: number
      first: CommunicationsDockLayoutNode
      second: CommunicationsDockLayoutNode
    }

export type CommunicationsDockTab = {
  id: string
  layout: CommunicationsDockLayoutNode
  activeLeafAppId: FloatingWorkspaceAppId
}

export type CommunicationsDockLayout = {
  version: 1
  bounds: CommunicationsDockBounds
  tabs: readonly CommunicationsDockTab[]
  activeTabId: string
  collapsed: boolean
}

export type CommunicationsDockSnapshot = CommunicationsDockIdentity & {
  layout: CommunicationsDockLayout
  sessions: Partial<Record<FloatingWorkspaceAppId, FloatingCommsSessionState>>
  visible: boolean
}

export type CommunicationsDockPresence = {
  exists: boolean
  visible: boolean
  location: 'panel' | 'dock'
  activeAppId?: FloatingWorkspaceAppId
}

export type CommunicationsDockPresentation = {
  appId: FloatingWorkspaceAppId
  dock: CommunicationsDockIdentity | null
  location: 'panel' | 'dock' | 'closed'
  tabId: string | null
  active: boolean
  visible: boolean
  sessionState: FloatingCommsSessionState
}

export type CommunicationsDockOpenRequest = { appId: FloatingWorkspaceAppId }
export type CommunicationsDockDetachRequest = {
  appId: FloatingWorkspaceAppId
  identity: FloatingCommsSurfaceIdentity
  sessionState: FloatingCommsSessionState
  sessions?: Partial<Record<FloatingWorkspaceAppId, FloatingCommsSessionState>>
}
export type CommunicationsDockVersionedRequest = CommunicationsDockIdentity
export type CommunicationsDockReadyRequest = { generation: number }
export type CommunicationsDockAckRequest = CommunicationsDockIdentity
export type CommunicationsDockActivateTabRequest = CommunicationsDockIdentity & { tabId: string }
export type CommunicationsDockActivateLeafRequest = CommunicationsDockIdentity & {
  tabId: string
  appId: FloatingWorkspaceAppId
}
export type CommunicationsDockReorderTabRequest = CommunicationsDockIdentity & {
  tabId: string
  index: number
}
export type CommunicationsDockMoveAppRequest = CommunicationsDockIdentity & {
  appId: FloatingWorkspaceAppId
  targetTabId: string
  targetAppId: FloatingWorkspaceAppId
  side: 'left' | 'right' | 'up' | 'down'
}
export type CommunicationsDockSplitAppRequest = CommunicationsDockIdentity & {
  appId: FloatingWorkspaceAppId
  targetTabId: string
  targetAppId: FloatingWorkspaceAppId
  side: 'left' | 'right' | 'up' | 'down'
}
export type CommunicationsDockMoveTabRequest = CommunicationsDockIdentity & {
  sourceTabId: string
  targetTabId: string
  targetAppId: FloatingWorkspaceAppId
  side: 'left' | 'right' | 'up' | 'down'
}
export type CommunicationsDockCreateTabRequest = CommunicationsDockIdentity & {
  sourceTabId: string
  appId: FloatingWorkspaceAppId
  index: number
}
export type CommunicationsDockUpdateRatioRequest = CommunicationsDockIdentity & {
  tabId: string
  path: readonly ('first' | 'second')[]
  ratio: number
}
export type CommunicationsDockSetCollapsedRequest = CommunicationsDockIdentity & {
  collapsed: boolean
}
export type CommunicationsDockNavbarHeightRequest = CommunicationsDockIdentity & {
  height: number
}
export type CommunicationsDockUpdateSessionRequest = CommunicationsDockIdentity & {
  sessionState: FloatingCommsSessionState
}
export type CommunicationsDockAction = CommunicationsDockIdentity &
  (
    | { type: 'open-app'; appId: FloatingWorkspaceAppId }
    | {
        type: 'open-settings'
        appId: FloatingWorkspaceAppId
        provider: CommunicationProviderId
      }
  )
export type CommunicationsDockDiscordCommand = CommunicationsDockIdentity & { appId: 'discord' } & (
    | { method: 'reconnect' }
    | { method: 'set-self-mute'; muted: boolean }
    | { method: 'set-self-deaf'; deafened: boolean }
    | { method: 'leave-call' }
    | { method: 'select-voice-channel'; channelId: string }
    | { method: 'set-overlay-open'; open: boolean }
  )
export type CommunicationsDockDiscordStateRequest = CommunicationsDockIdentity & {
  appId: 'discord'
}

export type CommunicationsDockState = CommunicationsDockSnapshot & {
  discord: DiscordVoiceSnapshot
}

export function listCommunicationsDockApps(
  node: CommunicationsDockLayoutNode
): FloatingWorkspaceAppId[] {
  return node.type === 'leaf'
    ? [node.appId]
    : [...listCommunicationsDockApps(node.first), ...listCommunicationsDockApps(node.second)]
}

export function clampCommunicationsDockRatio(ratio: number): number {
  return Math.min(Math.max(ratio, COMMUNICATIONS_DOCK_MIN_RATIO), COMMUNICATIONS_DOCK_MAX_RATIO)
}
