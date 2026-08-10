import { ipcMain } from 'electron'
import { z } from 'zod'
import type {
  CommunicationsDockAction,
  CommunicationsDockDiscordCommand,
  CommunicationsDockMoveAppRequest,
  CommunicationsDockSplitAppRequest,
  CommunicationsDockUpdateSessionRequest
} from '../../shared/communications-dock'
import {
  COMMUNICATIONS_DOCK_MAX_RATIO,
  COMMUNICATIONS_DOCK_MIN_RATIO,
  COMMUNICATIONS_DOCK_NAVBAR_MAX_HEIGHT,
  COMMUNICATIONS_DOCK_NAVBAR_MIN_HEIGHT
} from '../../shared/communications-dock'
import { FLOATING_COMMS_SESSION_DRAFT_MAX_LENGTH } from '../../shared/floating-comms-surface'
import {
  FLOATING_WORKSPACE_APPS,
  type FloatingWorkspaceAppId
} from '../../shared/floating-workspace-apps'
import { getCommunicationIntegrationStatuses } from '../messaging/communication-integration-registry'
import {
  getDiscordVoiceSnapshot,
  leaveDiscordVoiceCall,
  reconnectDiscordVoiceService,
  setDiscordVoiceSelfDeaf,
  setDiscordVoiceSelfMute
} from '../messaging/discord-voice-service'
import { communicationsDockController } from '../window/communications-dock-controller'
import {
  closeDiscordVoiceWindow,
  createOrFocusDiscordVoiceWindow
} from '../window/discord-voice-window'
import { isTrustedUIRenderer } from './ui'

const Positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const AppId = z.custom<FloatingWorkspaceAppId>(
  (value) => typeof value === 'string' && FLOATING_WORKSPACE_APPS.some((app) => app.id === value)
)
const Identity = { generation: Positive, revision: Positive }
const IdentitySchema = z.object(Identity).strict()
const AppSchema = z.object({ appId: AppId }).strict()
const VersionedApp = { ...Identity, appId: AppId }
const TabId = z.string().min(1).max(128)
const Side = z.enum(['left', 'right', 'up', 'down'])
const MoveSchema: z.ZodType<CommunicationsDockMoveAppRequest | CommunicationsDockSplitAppRequest> =
  z
    .object({
      ...VersionedApp,
      targetTabId: TabId,
      targetAppId: AppId,
      side: Side
    })
    .strict()
const SessionSchema = z.discriminatedUnion('appId', [
  z
    .object({
      appId: z.literal('whatsapp-web'),
      selectedConversationId: z.number().finite().nullable(),
      draft: z.string().max(FLOATING_COMMS_SESSION_DRAFT_MAX_LENGTH)
    })
    .strict(),
  z.object({ appId: z.literal('slack') }).strict(),
  z.object({ appId: z.literal('discord') }).strict()
])
const SessionRequestSchema: z.ZodType<CommunicationsDockUpdateSessionRequest> = z
  .object({
    ...Identity,
    sessionState: SessionSchema
  })
  .strict()
const DetachSchema = z.object({ appId: AppId, sessionState: SessionSchema }).strict()
const DiscordIdentity = { ...Identity, appId: z.literal('discord') }
const DiscordSchema: z.ZodType<CommunicationsDockDiscordCommand> = z.discriminatedUnion('method', [
  z.object({ ...DiscordIdentity, method: z.literal('reconnect') }).strict(),
  z.object({ ...DiscordIdentity, method: z.literal('set-self-mute'), muted: z.boolean() }).strict(),
  z
    .object({ ...DiscordIdentity, method: z.literal('set-self-deaf'), deafened: z.boolean() })
    .strict(),
  z.object({ ...DiscordIdentity, method: z.literal('leave-call') }).strict(),
  z
    .object({ ...DiscordIdentity, method: z.literal('set-overlay-open'), open: z.boolean() })
    .strict()
])
const ActionSchema: z.ZodType<CommunicationsDockAction> = z.discriminatedUnion('type', [
  z.object({ ...VersionedApp, type: z.literal('open-app') }).strict(),
  z
    .object({
      ...VersionedApp,
      type: z.literal('open-settings'),
      provider: z.enum(['discord', 'slack', 'z-api'])
    })
    .strict()
])

function parse<T>(schema: z.ZodType<T>, value: unknown, error: string): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw new Error(error)
  }
  return result.data
}

function trusted(sender: Electron.WebContents): void {
  if (!isTrustedUIRenderer(sender)) {
    throw new Error('communications_dock_owner_denied')
  }
}

async function runDiscord(command: CommunicationsDockDiscordCommand): Promise<void> {
  if (command.method === 'reconnect') {
    reconnectDiscordVoiceService()
  } else if (command.method === 'set-self-mute') {
    await setDiscordVoiceSelfMute(command.muted)
  } else if (command.method === 'set-self-deaf') {
    await setDiscordVoiceSelfDeaf(command.deafened)
  } else if (command.method === 'leave-call') {
    await leaveDiscordVoiceCall()
  } else if (command.open) {
    createOrFocusDiscordVoiceWindow()
  } else {
    closeDiscordVoiceWindow()
  }
}

export function registerCommunicationsDockHandlers(): void {
  ipcMain.handle('floatingCommsDock:openOrFocus', (event, value: unknown) => {
    trusted(event.sender)
    return communicationsDockController.openOrFocus(
      parse(AppSchema, value, 'communications_dock_open_denied').appId
    )
  })
  ipcMain.handle('floatingCommsDock:detach', (event, value: unknown) => {
    trusted(event.sender)
    const request = parse(DetachSchema, value, 'communications_dock_detach_denied')
    if (request.appId !== request.sessionState.appId) {
      throw new Error('communications_dock_session_app_mismatch')
    }
    return communicationsDockController.openOrFocus(request.appId, request.sessionState)
  })
  ipcMain.handle('floatingCommsDock:ready', (event, value: unknown) => {
    const request = parse(
      z.object({ generation: Positive }).strict(),
      value,
      'communications_dock_ready_denied'
    )
    return communicationsDockController.readyForSender(event.sender, request.generation)
  })
  ipcMain.handle('floatingCommsDock:ack', (event, value: unknown) =>
    communicationsDockController.acknowledge(
      event.sender,
      parse(IdentitySchema, value, 'communications_dock_ack_denied')
    )
  )
  ipcMain.handle('floatingCommsDock:getSnapshot', (event) =>
    communicationsDockController.getSnapshotForSender(event.sender)
  )
  ipcMain.handle('floatingCommsDock:getPresence', (event) => {
    trusted(event.sender)
    return communicationsDockController.getPresence()
  })
  ipcMain.handle('floatingCommsDock:activateTab', (event, value: unknown) =>
    communicationsDockController.layoutCommands.activateTab(
      event.sender,
      parse(
        z.object({ ...Identity, tabId: TabId }).strict(),
        value,
        'communications_dock_activate_tab_denied'
      )
    )
  )
  ipcMain.handle('floatingCommsDock:activateLeaf', (event, value: unknown) =>
    communicationsDockController.layoutCommands.activateLeaf(
      event.sender,
      parse(
        z.object({ ...VersionedApp, tabId: TabId }).strict(),
        value,
        'communications_dock_activate_leaf_denied'
      )
    )
  )
  ipcMain.handle('floatingCommsDock:moveApp', (event, value: unknown) =>
    communicationsDockController.layoutCommands.moveApp(
      event.sender,
      parse(MoveSchema, value, 'communications_dock_move_denied')
    )
  )
  ipcMain.handle('floatingCommsDock:splitApp', (event, value: unknown) =>
    communicationsDockController.layoutCommands.moveApp(
      event.sender,
      parse(MoveSchema, value, 'communications_dock_split_denied')
    )
  )
  ipcMain.handle('floatingCommsDock:reorderTab', (event, value: unknown) =>
    communicationsDockController.layoutCommands.reorderTab(
      event.sender,
      parse(
        z.object({ ...Identity, tabId: TabId, index: z.number().int().min(0).max(2) }).strict(),
        value,
        'communications_dock_reorder_denied'
      )
    )
  )
  ipcMain.handle('floatingCommsDock:updateRatio', (event, value: unknown) =>
    communicationsDockController.layoutCommands.updateRatio(
      event.sender,
      parse(
        z
          .object({
            ...Identity,
            tabId: TabId,
            path: z.array(z.enum(['first', 'second'])).max(2),
            ratio: z
              .number()
              .finite()
              .min(COMMUNICATIONS_DOCK_MIN_RATIO)
              .max(COMMUNICATIONS_DOCK_MAX_RATIO)
          })
          .strict(),
        value,
        'communications_dock_ratio_denied'
      )
    )
  )
  ipcMain.handle('floatingCommsDock:setCollapsed', (event, value: unknown) =>
    communicationsDockController.setCollapsed(
      event.sender,
      parse(
        z.object({ ...Identity, collapsed: z.boolean() }).strict(),
        value,
        'communications_dock_collapse_denied'
      )
    )
  )
  ipcMain.handle('floatingCommsDock:setNavbarHeight', (event, value: unknown) =>
    communicationsDockController.setNavbarHeight(
      event.sender,
      parse(
        z
          .object({
            ...Identity,
            height: z
              .number()
              .finite()
              .min(COMMUNICATIONS_DOCK_NAVBAR_MIN_HEIGHT)
              .max(COMMUNICATIONS_DOCK_NAVBAR_MAX_HEIGHT)
          })
          .strict(),
        value,
        'communications_dock_navbar_denied'
      )
    )
  )
  ipcMain.handle('floatingCommsDock:updateSession', (event, value: unknown) =>
    communicationsDockController.updateSession(
      event.sender,
      parse(SessionRequestSchema, value, 'communications_dock_session_denied')
    )
  )
  ipcMain.handle('floatingCommsDock:reattachDock', (event, value: unknown) =>
    communicationsDockController.reattach(
      event.sender,
      parse(IdentitySchema, value, 'communications_dock_reattach_denied')
    )
  )
  ipcMain.handle('floatingCommsDock:action', (event, value: unknown) =>
    communicationsDockController.handleAction(
      event.sender,
      parse(ActionSchema, value, 'communications_dock_action_denied')
    )
  )
  ipcMain.handle('floatingCommsDock:getIntegrationStatuses', async (event) => {
    if (!communicationsDockController.isSender(event.sender)) {
      throw new Error('communications_dock_status_denied')
    }
    return getCommunicationIntegrationStatuses()
  })
  ipcMain.handle('floatingCommsDock:discordCommand', async (event, value: unknown) => {
    const command = parse(DiscordSchema, value, 'communications_dock_discord_denied')
    if (!communicationsDockController.isSender(event.sender, command)) {
      throw new Error('communications_dock_stale')
    }
    await runDiscord(command)
    return getDiscordVoiceSnapshot()
  })
  ipcMain.handle('floatingCommsDock:getDiscordState', (event, value: unknown) => {
    const request = parse(
      z.object(DiscordIdentity).strict(),
      value,
      'communications_dock_discord_state_denied'
    )
    if (!communicationsDockController.isSender(event.sender, request)) {
      throw new Error('communications_dock_stale')
    }
    return getDiscordVoiceSnapshot()
  })
}
