import { ipcMain } from 'electron'
import { z } from 'zod'
import type {
  FloatingCommsAction,
  FloatingCommsDiscordCommand,
  FloatingCommsOpenRequest,
  FloatingCommsSurfaceState
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
  createOrFocusDiscordVoiceWindow,
  getDiscordVoiceOverlayState
} from '../window/discord-voice-window'
import {
  closeFloatingCommsSurface,
  getFloatingCommsSurfaceAppId,
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
    anchor: FloatingCommsAnchor,
    height: z.number().finite().positive().max(420)
  })
  .strict()
const FloatingCommsDiscordCommandSchema: z.ZodType<FloatingCommsDiscordCommand> =
  z.discriminatedUnion('method', [
    z.object({ method: z.literal('reconnect') }).strict(),
    z.object({ method: z.literal('set-self-mute'), muted: z.boolean() }).strict(),
    z.object({ method: z.literal('set-self-deaf'), deafened: z.boolean() }).strict(),
    z.object({ method: z.literal('leave-call') }).strict(),
    z.object({ method: z.literal('set-overlay-open'), open: z.boolean() }).strict()
  ])
const FloatingCommsActionSchema: z.ZodType<FloatingCommsAction> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open-app'), appId: FloatingCommsAppId }).strict(),
  z
    .object({
      type: z.literal('open-settings'),
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
  ipcMain.handle('floatingComms:close', (event) => {
    if (!isTrustedUIRenderer(event.sender) && !isFloatingCommsSurfaceRenderer(event.sender)) {
      throw new Error('floating_comms_close_denied')
    }
    closeFloatingCommsSurface()
  })
  ipcMain.handle('floatingComms:measure', (event, height: unknown) => {
    const measuredHeight = z.number().finite().positive().max(420).safeParse(height)
    if (!isFloatingCommsSurfaceRenderer(event.sender) || !measuredHeight.success) {
      throw new Error('floating_comms_measure_denied')
    }
    resizeFloatingCommsSurface(measuredHeight.data)
  })
  ipcMain.handle('floatingComms:getState', async (event): Promise<FloatingCommsSurfaceState> => {
    if (!isFloatingCommsSurfaceRenderer(event.sender)) {
      throw new Error('floating_comms_state_denied')
    }
    const appId = getFloatingCommsSurfaceAppId()
    if (!appId) {
      throw new Error('floating_comms_state_unavailable')
    }
    return {
      appId,
      discord: getDiscordVoiceSnapshot(),
      integrations: await getCommunicationIntegrationStatuses(),
      overlayOpen: getDiscordVoiceOverlayState().open,
      visible: isFloatingCommsSurfaceVisible()
    }
  })
  ipcMain.handle('floatingComms:discordCommand', async (event, value: unknown) => {
    const command = FloatingCommsDiscordCommandSchema.safeParse(value)
    if (!isFloatingCommsSurfaceRenderer(event.sender) || !command.success) {
      throw new Error('floating_comms_command_denied')
    }
    await runDiscordCommand(command.data)
    return getDiscordVoiceSnapshot()
  })
  ipcMain.handle('floatingComms:action', (event, value: unknown) => {
    const action = FloatingCommsActionSchema.safeParse(value)
    if (!isFloatingCommsSurfaceRenderer(event.sender) || !action.success) {
      throw new Error('floating_comms_action_denied')
    }
    sendToTrustedUIRenderer('floatingComms:action', action.data)
    closeFloatingCommsSurface()
  })
}
