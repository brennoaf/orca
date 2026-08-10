import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import { z } from 'zod'
import type {
  FloatingCommsAction,
  FloatingCommsCloseAttachedRequest,
  FloatingCommsDetachRequest,
  FloatingCommsDiscordCommand,
  FloatingCommsMeasureRequest,
  FloatingCommsMinimizeDetachedRequest,
  FloatingCommsOpenRequest,
  FloatingCommsUpdateRequest
} from '../../shared/floating-comms-surface'
import {
  FLOATING_COMMS_SESSION_DRAFT_MAX_LENGTH,
  FLOATING_COMMS_SURFACE_MAX_HEIGHT
} from '../../shared/floating-comms-surface'
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
import {
  closeDiscordVoiceWindow,
  createOrFocusDiscordVoiceWindow
} from '../window/discord-voice-window'
import { floatingCommsSurfaceController } from '../window/floating-comms-surface-controller'
import { communicationsDockController } from '../window/communications-dock-controller'
import { isTrustedUIRenderer } from './ui'

function isAppId(value: unknown): value is FloatingWorkspaceAppId {
  return typeof value === 'string' && FLOATING_WORKSPACE_APPS.some((app) => app.id === value)
}

const PositiveSafeInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const FloatingCommsAppId = z.custom<FloatingWorkspaceAppId>(isAppId)
const FloatingCommsMode = z.enum(['attached-native', 'attached-dom', 'detached'])
const FloatingCommsIdentityFields = {
  appId: FloatingCommsAppId,
  requestId: PositiveSafeInteger,
  surfaceId: PositiveSafeInteger,
  mode: FloatingCommsMode
}
const FloatingCommsIdentitySchema = z.object(FloatingCommsIdentityFields).strict()
const FloatingCommsAnchor = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive()
  })
  .strict()
const FloatingCommsOpenRequestSchema: z.ZodType<FloatingCommsOpenRequest> = z
  .object({
    appId: FloatingCommsAppId,
    requestId: PositiveSafeInteger,
    anchor: FloatingCommsAnchor,
    workspace: FloatingCommsAnchor,
    height: z.number().finite().positive().max(FLOATING_COMMS_SURFACE_MAX_HEIGHT)
  })
  .strict()
const FloatingCommsUpdateRequestSchema: z.ZodType<FloatingCommsUpdateRequest> = z
  .object({
    ...FloatingCommsIdentityFields,
    anchor: FloatingCommsAnchor,
    workspace: FloatingCommsAnchor,
    height: z.number().finite().positive().max(FLOATING_COMMS_SURFACE_MAX_HEIGHT),
    geometryRequestId: PositiveSafeInteger.nullable()
  })
  .strict()
const FloatingCommsCloseAttachedRequestSchema: z.ZodType<FloatingCommsCloseAttachedRequest> =
  FloatingCommsIdentitySchema
const FloatingCommsMeasureRequestSchema: z.ZodType<FloatingCommsMeasureRequest> = z
  .object({
    ...FloatingCommsIdentityFields,
    height: z.number().finite().positive().max(FLOATING_COMMS_SURFACE_MAX_HEIGHT)
  })
  .strict()
const FloatingCommsSessionStateSchema = z.discriminatedUnion('appId', [
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
const FloatingCommsDetachRequestSchema: z.ZodType<FloatingCommsDetachRequest> = z
  .object({
    ...FloatingCommsIdentityFields,
    sessionState: FloatingCommsSessionStateSchema
  })
  .strict()
  .refine((request) => request.appId === request.sessionState.appId)
const FloatingCommsMinimizeDetachedRequestSchema: z.ZodType<FloatingCommsMinimizeDetachedRequest> =
  FloatingCommsDetachRequestSchema
const FloatingCommsAppRequestSchema = z.object({ appId: FloatingCommsAppId }).strict()
const FloatingCommsDiscordCommandIdentity = {
  appId: z.literal('discord'),
  requestId: PositiveSafeInteger,
  surfaceId: PositiveSafeInteger,
  mode: FloatingCommsMode
}
const FloatingCommsDiscordCommandSchema: z.ZodType<FloatingCommsDiscordCommand> =
  z.discriminatedUnion('method', [
    z.object({ ...FloatingCommsDiscordCommandIdentity, method: z.literal('reconnect') }).strict(),
    z
      .object({
        ...FloatingCommsDiscordCommandIdentity,
        method: z.literal('set-self-mute'),
        muted: z.boolean()
      })
      .strict(),
    z
      .object({
        ...FloatingCommsDiscordCommandIdentity,
        method: z.literal('set-self-deaf'),
        deafened: z.boolean()
      })
      .strict(),
    z.object({ ...FloatingCommsDiscordCommandIdentity, method: z.literal('leave-call') }).strict(),
    z
      .object({
        ...FloatingCommsDiscordCommandIdentity,
        method: z.literal('set-overlay-open'),
        open: z.boolean()
      })
      .strict()
  ])
const FloatingCommsActionSchema: z.ZodType<FloatingCommsAction> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open-app'), ...FloatingCommsIdentityFields }).strict(),
  z
    .object({
      type: z.literal('open-settings'),
      ...FloatingCommsIdentityFields,
      provider: z.enum(['discord', 'slack'])
    })
    .strict()
])

async function runDiscordCommand(command: FloatingCommsDiscordCommand): Promise<void> {
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

function getFloatingCommsOwner(sender: WebContents): BrowserWindow | null {
  if (!isTrustedUIRenderer(sender)) {
    return null
  }
  const owner = BrowserWindow.fromWebContents(sender)
  return owner && !owner.isDestroyed() ? owner : null
}

function requireTrustedOwner(sender: WebContents, error: string): BrowserWindow {
  const owner = getFloatingCommsOwner(sender)
  if (!owner) {
    throw new Error(error)
  }
  return owner
}

export function registerFloatingCommsSurfaceHandlers(): void {
  ipcMain.handle('floatingComms:open', (event, value: unknown) => {
    const request = FloatingCommsOpenRequestSchema.safeParse(value)
    if (!request.success) {
      throw new Error('floating_comms_open_denied')
    }
    return floatingCommsSurfaceController.open(
      requireTrustedOwner(event.sender, 'floating_comms_open_denied'),
      request.data
    )
  })
  ipcMain.handle('floatingComms:update', (event, value: unknown) => {
    const request = FloatingCommsUpdateRequestSchema.safeParse(value)
    if (!request.success) {
      throw new Error('floating_comms_update_denied')
    }
    return floatingCommsSurfaceController.update(
      requireTrustedOwner(event.sender, 'floating_comms_update_denied'),
      request.data
    )
  })
  ipcMain.handle('floatingComms:closeAttached', (event, value: unknown) => {
    const request = FloatingCommsCloseAttachedRequestSchema.safeParse(value)
    if (
      !request.success ||
      (!isTrustedUIRenderer(event.sender) &&
        !floatingCommsSurfaceController.isAttachedSender(event.sender, request.data))
    ) {
      throw new Error('floating_comms_close_denied')
    }
    floatingCommsSurfaceController.closeAttached(request.data)
  })
  ipcMain.handle('floatingComms:measure', (event, value: unknown) => {
    const request = FloatingCommsMeasureRequestSchema.safeParse(value)
    if (
      !request.success ||
      !floatingCommsSurfaceController.isAttachedSender(event.sender, request.data)
    ) {
      throw new Error('floating_comms_measure_denied')
    }
    floatingCommsSurfaceController.resize(request.data, request.data.height)
  })
  ipcMain.handle('floatingComms:detach', (event, value: unknown) => {
    const request = FloatingCommsDetachRequestSchema.safeParse(value)
    if (
      !request.success ||
      (!isTrustedUIRenderer(event.sender) &&
        !floatingCommsSurfaceController.isAttachedSender(event.sender, request.data))
    ) {
      throw new Error('floating_comms_detach_denied')
    }
    const sessionState = floatingCommsSurfaceController.takeAttachedForDock(request.data)
    return communicationsDockController.openOrFocus(request.data.appId, sessionState)
  })
  ipcMain.handle('floatingComms:minimizeDetached', (event, value: unknown) => {
    const request = FloatingCommsMinimizeDetachedRequestSchema.safeParse(value)
    if (
      !request.success ||
      !floatingCommsSurfaceController.isDetachedSender(event.sender, request.data)
    ) {
      throw new Error('floating_comms_minimize_denied')
    }
    floatingCommsSurfaceController.minimizeDetached(request.data)
  })
  ipcMain.handle('floatingComms:focusDetached', (event, value: unknown) => {
    const request = FloatingCommsAppRequestSchema.safeParse(value)
    if (!isTrustedUIRenderer(event.sender) || !request.success) {
      throw new Error('floating_comms_focus_denied')
    }
    return floatingCommsSurfaceController.focusDetached(request.data.appId)
  })
  ipcMain.handle('floatingComms:closeDetached', (event, value: unknown) => {
    const request = FloatingCommsAppRequestSchema.safeParse(value)
    if (!isTrustedUIRenderer(event.sender) || !request.success) {
      throw new Error('floating_comms_close_detached_denied')
    }
    floatingCommsSurfaceController.closeDetached(request.data.appId)
  })
  ipcMain.handle('floatingComms:disable', (event, value: unknown) => {
    const request = FloatingCommsAppRequestSchema.safeParse(value)
    if (!isTrustedUIRenderer(event.sender) || !request.success) {
      throw new Error('floating_comms_disable_denied')
    }
    floatingCommsSurfaceController.disable(request.data.appId)
  })
  ipcMain.handle('floatingComms:listPresentations', (event) => {
    requireTrustedOwner(event.sender, 'floating_comms_presentations_denied')
    return floatingCommsSurfaceController.listPresentations()
  })
  ipcMain.handle('floatingComms:getPresentation', (event, value: unknown) => {
    const request = FloatingCommsAppRequestSchema.safeParse(value)
    if (!isTrustedUIRenderer(event.sender) || !request.success) {
      throw new Error('floating_comms_presentation_denied')
    }
    return floatingCommsSurfaceController.getPresentation(request.data.appId)
  })
  ipcMain.handle('floatingComms:getState', (event) => {
    const state = floatingCommsSurfaceController.getStateForSender(event.sender)
    if (!state) {
      throw new Error('floating_comms_state_denied')
    }
    return state
  })
  ipcMain.handle('floatingComms:getIntegrationStatuses', async (event) => {
    if (!floatingCommsSurfaceController.getStateForSender(event.sender)) {
      throw new Error('floating_comms_integration_statuses_denied')
    }
    return getCommunicationIntegrationStatuses()
  })
  ipcMain.handle('floatingComms:discordCommand', async (event, value: unknown) => {
    const command = FloatingCommsDiscordCommandSchema.safeParse(value)
    if (!command.success) {
      throw new Error('floating_comms_command_denied')
    }
    floatingCommsSurfaceController.assertDiscordCommandSender(event.sender, command.data)
    await runDiscordCommand(command.data)
    return getDiscordVoiceSnapshot()
  })
  ipcMain.handle('floatingComms:action', (event, value: unknown) => {
    const action = FloatingCommsActionSchema.safeParse(value)
    if (!action.success) {
      throw new Error('floating_comms_action_denied')
    }
    floatingCommsSurfaceController.handleAction(event.sender, action.data)
  })
}
