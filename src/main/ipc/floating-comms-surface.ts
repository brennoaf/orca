import { ipcMain } from 'electron'
import { z } from 'zod'
import type {
  FloatingCommsAction,
  FloatingCommsCloseRequest,
  FloatingCommsDiscordCommand,
  FloatingCommsMeasureRequest,
  FloatingCommsOpenRequest,
  FloatingCommsSurfaceState
} from '../../shared/floating-comms-surface'
import { FLOATING_COMMS_SURFACE_MAX_HEIGHT } from '../../shared/floating-comms-surface'
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
  createOrFocusDiscordVoiceWindow,
  getDiscordVoiceOverlayState
} from '../window/discord-voice-window'
import {
  closeFloatingCommsSurface,
  getFloatingCommsSurfaceIdentity,
  isFloatingCommsSurfaceRenderer,
  isFloatingCommsSurfaceVisible,
  openFloatingCommsSurface,
  resizeFloatingCommsSurface,
  shouldUseFloatingCommsDomFallback,
  updateFloatingCommsSurface
} from '../window/floating-comms-surface-window'
import { isTrustedUIRenderer, sendToTrustedUIRenderer } from './ui'

function isAppId(value: unknown): value is FloatingWorkspaceAppId {
  return typeof value === 'string' && FLOATING_WORKSPACE_APPS.some((app) => app.id === value)
}

const FloatingCommsAppId = z.custom<FloatingWorkspaceAppId>(isAppId)
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
    requestId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    anchor: FloatingCommsAnchor,
    height: z.number().finite().positive().max(FLOATING_COMMS_SURFACE_MAX_HEIGHT)
  })
  .strict()
const FloatingCommsCloseRequestSchema: z.ZodType<FloatingCommsCloseRequest> = z
  .object({ requestId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) })
  .strict()
const FloatingCommsMeasureRequestSchema: z.ZodType<FloatingCommsMeasureRequest> = z
  .object({
    requestId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    height: z.number().finite().positive().max(FLOATING_COMMS_SURFACE_MAX_HEIGHT)
  })
  .strict()
const FloatingCommsDiscordCommandIdentity = {
  appId: z.literal('discord'),
  requestId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
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
  z
    .object({
      type: z.literal('open-app'),
      appId: FloatingCommsAppId,
      requestId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
    })
    .strict(),
  z
    .object({
      type: z.literal('open-settings'),
      appId: FloatingCommsAppId,
      requestId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      provider: z.enum(['discord', 'slack', 'z-api'])
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

export function registerFloatingCommsSurfaceHandlers(): void {
  ipcMain.handle('floatingComms:open', (event, value: unknown) => {
    const request = FloatingCommsOpenRequestSchema.safeParse(value)
    if (!isTrustedUIRenderer(event.sender) || !request.success) {
      throw new Error('floating_comms_open_denied')
    }
    if (shouldUseFloatingCommsDomFallback()) {
      return { mode: 'dom' as const }
    }
    return { mode: openFloatingCommsSurface(request.data) ? ('window' as const) : ('dom' as const) }
  })
  ipcMain.handle('floatingComms:update', (event, value: unknown) => {
    const request = FloatingCommsOpenRequestSchema.safeParse(value)
    if (!isTrustedUIRenderer(event.sender) || !request.success) {
      throw new Error('floating_comms_update_denied')
    }
    const usesWindow = updateFloatingCommsSurface(request.data)
    return usesWindow === null
      ? null
      : { mode: usesWindow ? ('window' as const) : ('dom' as const) }
  })
  ipcMain.handle('floatingComms:close', (event, value: unknown) => {
    const request = FloatingCommsCloseRequestSchema.safeParse(value)
    const trustedRenderer = isTrustedUIRenderer(event.sender)
    const admittedRequest = request.success || (trustedRenderer && value === undefined)
    if ((!trustedRenderer && !isFloatingCommsSurfaceRenderer(event.sender)) || !admittedRequest) {
      throw new Error('floating_comms_close_denied')
    }
    closeFloatingCommsSurface(request.success ? request.data.requestId : undefined)
  })
  ipcMain.handle('floatingComms:measure', (event, value: unknown) => {
    const request = FloatingCommsMeasureRequestSchema.safeParse(value)
    if (!isFloatingCommsSurfaceRenderer(event.sender) || !request.success) {
      throw new Error('floating_comms_measure_denied')
    }
    resizeFloatingCommsSurface(request.data.requestId, request.data.height)
  })
  ipcMain.handle('floatingComms:getState', (event): FloatingCommsSurfaceState => {
    if (!isFloatingCommsSurfaceRenderer(event.sender)) {
      throw new Error('floating_comms_state_denied')
    }
    const surfaceIdentity = getFloatingCommsSurfaceIdentity()
    if (!surfaceIdentity) {
      throw new Error('floating_comms_state_unavailable')
    }
    return {
      ...surfaceIdentity,
      discord: getDiscordVoiceSnapshot(),
      overlayOpen: getDiscordVoiceOverlayState().open,
      visible: isFloatingCommsSurfaceVisible()
    }
  })
  ipcMain.handle('floatingComms:getIntegrationStatuses', async (event) => {
    if (!isFloatingCommsSurfaceRenderer(event.sender)) {
      throw new Error('floating_comms_integration_statuses_denied')
    }
    return getCommunicationIntegrationStatuses()
  })
  ipcMain.handle('floatingComms:discordCommand', async (event, value: unknown) => {
    const command = FloatingCommsDiscordCommandSchema.safeParse(value)
    if (!isFloatingCommsSurfaceRenderer(event.sender) || !command.success) {
      throw new Error('floating_comms_command_denied')
    }
    const surfaceIdentity = getFloatingCommsSurfaceIdentity()
    if (
      !surfaceIdentity ||
      !isFloatingCommsSurfaceVisible() ||
      surfaceIdentity.appId !== command.data.appId ||
      surfaceIdentity.requestId !== command.data.requestId
    ) {
      throw new Error('floating_comms_command_stale')
    }
    await runDiscordCommand(command.data)
    return getDiscordVoiceSnapshot()
  })
  ipcMain.handle('floatingComms:action', (event, value: unknown) => {
    const action = FloatingCommsActionSchema.safeParse(value)
    if (!isFloatingCommsSurfaceRenderer(event.sender) || !action.success) {
      throw new Error('floating_comms_action_denied')
    }
    const surfaceIdentity = getFloatingCommsSurfaceIdentity()
    if (
      !surfaceIdentity ||
      surfaceIdentity.appId !== action.data.appId ||
      surfaceIdentity.requestId !== action.data.requestId
    ) {
      return
    }
    sendToTrustedUIRenderer('floatingComms:action', action.data)
    closeFloatingCommsSurface(action.data.requestId)
  })
}
