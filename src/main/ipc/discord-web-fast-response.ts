import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import {
  DiscordWebFastResponseAttachSchema,
  DiscordWebCompactIntentSchema,
  DiscordWebFastResponseVisibilitySchema,
  DiscordWebVoiceSelectionSchema
} from '../../shared/discord-web-fast-response'
import { listCommunicationsDockApps } from '../../shared/communications-dock'
import { DiscordWebFastResponseHost } from '../discord-web-fast-response/compact-host'
import { communicationsDockController } from '../window/communications-dock-controller'
import { floatingCommsSurfaceController } from '../window/floating-comms-surface-controller'
import { resolveDiscordWebFastResponseProfile } from '../discord-web-fast-response/compact-host-session'
import { isTrustedUIRenderer } from './ui'

let host: DiscordWebFastResponseHost | null = null
let voiceSelectionHandlerRegistered = false
let compactIntentHandlerRegistered = false

function handleVoiceSelection(event: Electron.IpcMainEvent, value: unknown): void {
  const selection = DiscordWebVoiceSelectionSchema.safeParse(value)
  if (!selection.success || !host) {
    return
  }
  void host.selectVoiceChannel(event.sender, selection.data).catch(() => undefined)
}

function handleCompactIntent(event: Electron.IpcMainEvent, value: unknown): void {
  const intent = DiscordWebCompactIntentSchema.safeParse(value)
  if (!intent.success || !host) {
    return
  }
  void host.handleCompactIntent(event.sender, intent.data).catch(() => undefined)
}

function isCurrentDockSender(
  sender: Electron.WebContents,
  request: Extract<
    ReturnType<typeof DiscordWebFastResponseVisibilitySchema.parse>,
    { target: 'dock' }
  >
): boolean {
  if (!communicationsDockController.isSender(sender, request)) {
    return false
  }
  const snapshot = communicationsDockController.getSnapshotForSender(sender)
  const tab = snapshot.layout.tabs.find((candidate) => candidate.id === request.tabId)
  return Boolean(
    snapshot.visible &&
    !snapshot.layout.collapsed &&
    snapshot.layout.activeTabId === request.tabId &&
    tab &&
    listCommunicationsDockApps(tab.layout).includes('discord')
  )
}

function requireSender(
  sender: Electron.WebContents,
  request: ReturnType<typeof DiscordWebFastResponseVisibilitySchema.parse>
): void {
  const allowed =
    request.target === 'attached'
      ? floatingCommsSurfaceController.isAttachedSender(sender, request)
      : isCurrentDockSender(sender, request)
  if (!allowed) {
    throw new Error('discord_web_fast_response_sender_denied')
  }
}

export function registerDiscordWebFastResponseHandlers(store: Store): void {
  host ??= new DiscordWebFastResponseHost(store)
  if (!voiceSelectionHandlerRegistered) {
    ipcMain.on('discordWebFastResponse:selectVoiceChannel', handleVoiceSelection)
    voiceSelectionHandlerRegistered = true
  }
  if (!compactIntentHandlerRegistered) {
    ipcMain.on('discordWebFastResponse:compactIntent', handleCompactIntent)
    compactIntentHandlerRegistered = true
  }
  ipcMain.handle('discordWebFastResponse:resolveSessionProfile', (event) => {
    if (!isTrustedUIRenderer(event.sender)) {
      throw new Error('discord_web_fast_response_profile_sender_denied')
    }
    return resolveDiscordWebFastResponseProfile(store)
  })
  for (const [channel, operation] of [
    ['attach', 'attach'],
    ['updateBounds', 'update']
  ] as const) {
    ipcMain.handle(`discordWebFastResponse:${channel}`, (event, value: unknown) => {
      const request = DiscordWebFastResponseAttachSchema.safeParse(value)
      if (!request.success) {
        throw new Error('discord_web_fast_response_request_denied')
      }
      requireSender(event.sender, request.data)
      return host![operation](event.sender, request.data)
    })
  }
  for (const operation of ['show', 'hide'] as const) {
    ipcMain.handle(`discordWebFastResponse:${operation}`, (event, value: unknown) => {
      const request = DiscordWebFastResponseVisibilitySchema.safeParse(value)
      if (!request.success) {
        throw new Error('discord_web_fast_response_request_denied')
      }
      requireSender(event.sender, request.data)
      return host![operation](event.sender, request.data)
    })
  }
}

export function getDiscordWebFastResponseHost(): DiscordWebFastResponseHost {
  if (!host) {
    throw new Error('discord_web_fast_response_unavailable')
  }
  return host
}

export function shutdownDiscordWebFastResponseHost(): void {
  host?.shutdown()
  host = null
  if (voiceSelectionHandlerRegistered) {
    ipcMain.removeListener('discordWebFastResponse:selectVoiceChannel', handleVoiceSelection)
    voiceSelectionHandlerRegistered = false
  }
  if (compactIntentHandlerRegistered) {
    ipcMain.removeListener('discordWebFastResponse:compactIntent', handleCompactIntent)
    compactIntentHandlerRegistered = false
  }
}
