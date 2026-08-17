import type {
  CommunicationsDockAckRequest,
  CommunicationsDockAction,
  CommunicationsDockActivateLeafRequest,
  CommunicationsDockActivateTabRequest,
  CommunicationsDockCreateTabRequest,
  CommunicationsDockDiscordCommand,
  CommunicationsDockDiscordStateRequest,
  CommunicationsDockDetachRequest,
  CommunicationsDockIdentity,
  CommunicationsDockMoveAppRequest,
  CommunicationsDockMoveTabRequest,
  CommunicationsDockNavbarHeightRequest,
  CommunicationsDockOpenRequest,
  CommunicationsDockPresence,
  CommunicationsDockReadyRequest,
  CommunicationsDockReorderTabRequest,
  CommunicationsDockSetCollapsedRequest,
  CommunicationsDockSnapshot,
  CommunicationsDockSplitAppRequest,
  CommunicationsDockUpdateRatioRequest,
  CommunicationsDockUpdateSessionRequest
} from '../../shared/communications-dock'
import type { CommunicationIntegrationStatus } from '../../shared/communication-integrations'
import type {
  DiscordWebCompactModeChanged,
  DiscordWebFastResponseAttach,
  DiscordWebFastResponseSnapshot,
  DiscordWebFastResponseStateChanged,
  DiscordWebFastResponseVisibility
} from '../../shared/discord-web-fast-response'
import type { DiscordVoiceSnapshot } from '../../shared/discord-voice'
import type {
  FloatingCommsAction,
  FloatingCommsCloseAttachedRequest,
  FloatingCommsDetachRequest,
  FloatingCommsDisableRequest,
  FloatingCommsDiscordCommand,
  FloatingCommsGeometryRequest,
  FloatingCommsMeasureRequest,
  FloatingCommsOpenRequest,
  FloatingCommsOpenResult,
  FloatingCommsPresentationTarget,
  FloatingCommsSurfaceChanged,
  FloatingCommsSurfaceIdentity,
  FloatingCommsSurfacePresentation,
  FloatingCommsSurfaceVisibility,
  FloatingCommsUpdateRequest
} from '../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'
import type {
  SlackFastResponseAttach,
  SlackFastResponseBrowserRegistration,
  SlackFastResponseSnapshot,
  SlackFastResponseStateChanged,
  SlackFastResponseUnregisterBrowserSurfaceRequest,
  SlackFastResponseVisibility
} from '../../shared/slack-fast-response'
import type {
  WhatsAppFastResponseAttach,
  WhatsAppFastResponseBrowserRegistration,
  WhatsAppFastResponseSnapshot,
  WhatsAppFastResponseStateChanged,
  WhatsAppFastResponseUnregisterBrowserSurfaceRequest,
  WhatsAppFastResponseVisibility
} from '../../shared/whatsapp-fast-response'
import type { BrowserSessionProfile } from '../../shared/browser-workspace-types'

export type WhatsAppFastResponseApi = {
  registerBrowserSurface: (
    request: WhatsAppFastResponseBrowserRegistration
  ) => Promise<{ registrationToken: string }>
  unregisterBrowserSurface: (
    request: WhatsAppFastResponseUnregisterBrowserSurfaceRequest
  ) => Promise<void>
  attach: (request: WhatsAppFastResponseAttach) => Promise<WhatsAppFastResponseSnapshot>
  updateBounds: (request: WhatsAppFastResponseAttach) => Promise<WhatsAppFastResponseSnapshot>
  show: (request: WhatsAppFastResponseVisibility) => Promise<WhatsAppFastResponseSnapshot>
  hide: (request: WhatsAppFastResponseVisibility) => Promise<WhatsAppFastResponseSnapshot>
  collapse: (request: WhatsAppFastResponseVisibility) => Promise<WhatsAppFastResponseSnapshot>
  onStateChanged: (callback: (state: WhatsAppFastResponseStateChanged) => void) => () => void
  onAttentionChanged: (callback: (attention: { hasUnread: boolean }) => void) => () => void
}

export type SlackFastResponseApi = {
  registerBrowserSurface: (
    request: SlackFastResponseBrowserRegistration
  ) => Promise<{ registrationToken: string }>
  unregisterBrowserSurface: (
    request: SlackFastResponseUnregisterBrowserSurfaceRequest
  ) => Promise<void>
  attach: (request: SlackFastResponseAttach) => Promise<SlackFastResponseSnapshot>
  updateBounds: (request: SlackFastResponseAttach) => Promise<SlackFastResponseSnapshot>
  show: (request: SlackFastResponseVisibility) => Promise<SlackFastResponseSnapshot>
  hide: (request: SlackFastResponseVisibility) => Promise<SlackFastResponseSnapshot>
  onStateChanged: (callback: (state: SlackFastResponseStateChanged) => void) => () => void
}

export type DiscordWebFastResponseApi = {
  resolveSessionProfile: () => Promise<BrowserSessionProfile>
  attach: (request: DiscordWebFastResponseAttach) => Promise<DiscordWebFastResponseSnapshot>
  updateBounds: (request: DiscordWebFastResponseAttach) => Promise<DiscordWebFastResponseSnapshot>
  show: (request: DiscordWebFastResponseVisibility) => Promise<DiscordWebFastResponseSnapshot>
  hide: (request: DiscordWebFastResponseVisibility) => Promise<DiscordWebFastResponseSnapshot>
  onStateChanged: (callback: (state: DiscordWebFastResponseStateChanged) => void) => () => void
  onCompactModeChanged: (callback: (state: DiscordWebCompactModeChanged) => void) => () => void
}

export type FloatingCommsApi = {
  open: (request: FloatingCommsOpenRequest) => Promise<FloatingCommsOpenResult>
  update: (request: FloatingCommsUpdateRequest) => Promise<FloatingCommsOpenResult>
  closeAttached: (request: FloatingCommsCloseAttachedRequest) => Promise<void>
  detach: (request: FloatingCommsDetachRequest) => Promise<CommunicationsDockSnapshot>
  disable: (request: FloatingCommsDisableRequest) => Promise<void>
  listPresentations: () => Promise<FloatingCommsSurfacePresentation[]>
  getPresentation: (
    target: FloatingCommsPresentationTarget
  ) => Promise<FloatingCommsSurfacePresentation | null>
  measure: (request: FloatingCommsMeasureRequest) => Promise<void>
  resize: (request: FloatingCommsMeasureRequest) => Promise<void>
  getState: () => Promise<FloatingCommsSurfacePresentation | null>
  getIntegrationStatuses: () => Promise<readonly CommunicationIntegrationStatus[]>
  discordCommand: (command: FloatingCommsDiscordCommand) => Promise<DiscordVoiceSnapshot>
  action: (action: FloatingCommsAction) => Promise<void>
  onStateChanged: (callback: (identity: FloatingCommsSurfaceIdentity) => void) => () => void
  onSurfaceChanged: (callback: (change: FloatingCommsSurfaceChanged) => void) => () => void
  onVisibilityChanged: (
    callback: (visibility: FloatingCommsSurfaceVisibility) => void
  ) => () => void
  onFallback: (callback: (identity: FloatingCommsSurfaceIdentity) => void) => () => void
  onGeometryRequested: (callback: (request: FloatingCommsGeometryRequest) => void) => () => void
  onAction: (callback: (action: FloatingCommsAction) => void) => () => void
}

export type FloatingCommsDockApi = {
  openOrFocus: (request: CommunicationsDockOpenRequest) => Promise<CommunicationsDockSnapshot>
  detach: (request: CommunicationsDockDetachRequest) => Promise<CommunicationsDockSnapshot>
  ready: (request: CommunicationsDockReadyRequest) => Promise<CommunicationsDockSnapshot>
  ack: (request: CommunicationsDockAckRequest) => Promise<void>
  getSnapshot: () => Promise<CommunicationsDockSnapshot>
  getPresence: () => Promise<CommunicationsDockPresence>
  activateTab: (
    request: CommunicationsDockActivateTabRequest
  ) => Promise<CommunicationsDockSnapshot>
  activateLeaf: (
    request: CommunicationsDockActivateLeafRequest
  ) => Promise<CommunicationsDockSnapshot>
  moveApp: (request: CommunicationsDockMoveAppRequest) => Promise<CommunicationsDockSnapshot>
  splitApp: (request: CommunicationsDockSplitAppRequest) => Promise<CommunicationsDockSnapshot>
  moveTab: (request: CommunicationsDockMoveTabRequest) => Promise<CommunicationsDockSnapshot>
  createTab: (request: CommunicationsDockCreateTabRequest) => Promise<CommunicationsDockSnapshot>
  reorderTab: (request: CommunicationsDockReorderTabRequest) => Promise<CommunicationsDockSnapshot>
  updateRatio: (
    request: CommunicationsDockUpdateRatioRequest
  ) => Promise<CommunicationsDockSnapshot>
  setCollapsed: (
    request: CommunicationsDockSetCollapsedRequest
  ) => Promise<CommunicationsDockSnapshot>
  setNavbarHeight: (
    request: CommunicationsDockNavbarHeightRequest
  ) => Promise<CommunicationsDockSnapshot>
  updateSession: (
    request: CommunicationsDockUpdateSessionRequest
  ) => Promise<CommunicationsDockSnapshot>
  reattachDock: (request: CommunicationsDockIdentity) => Promise<void>
  getIntegrationStatuses: () => Promise<readonly CommunicationIntegrationStatus[]>
  discordCommand: (command: CommunicationsDockDiscordCommand) => Promise<DiscordVoiceSnapshot>
  getDiscordState: (request: CommunicationsDockDiscordStateRequest) => Promise<DiscordVoiceSnapshot>
  action: (action: CommunicationsDockAction) => Promise<void>
  onSnapshotChanged: (callback: (snapshot: CommunicationsDockSnapshot) => void) => () => void
  onPresenceChanged: (callback: (presence: CommunicationsDockPresence) => void) => () => void
  onAction: (callback: (action: CommunicationsDockAction) => void) => () => void
  onReattached: (
    callback: (event: {
      appId: FloatingWorkspaceAppId
      sessions: CommunicationsDockSnapshot['sessions']
    }) => void
  ) => () => void
}
