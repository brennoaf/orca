import { ipcMain } from 'electron'
import type { z } from 'zod'
import type { Store } from '../persistence'
import {
  WhatsAppFastResponseAttachSchema,
  WhatsAppFastResponseVisibilitySchema
} from '../../shared/whatsapp-fast-response'
import { communicationsDockController } from '../window/communications-dock-controller'
import { floatingCommsSurfaceController } from '../window/floating-comms-surface-controller'
import { WhatsAppFastResponseHost } from '../whatsapp-fast-response/compact-host'

let host: WhatsAppFastResponseHost | null = null

function requireSender(
  sender: Electron.WebContents,
  request:
    | z.infer<typeof WhatsAppFastResponseAttachSchema>
    | z.infer<typeof WhatsAppFastResponseVisibilitySchema>
): void {
  const allowed =
    request.target === 'attached'
      ? floatingCommsSurfaceController.isAttachedSender(sender, request)
      : isCurrentDockSender(sender, request)
  if (!allowed) {
    throw new Error('whatsapp_fast_response_sender_denied')
  }
}

function isCurrentDockSender(
  sender: Electron.WebContents,
  request:
    | Extract<z.infer<typeof WhatsAppFastResponseAttachSchema>, { target: 'dock' }>
    | Extract<z.infer<typeof WhatsAppFastResponseVisibilitySchema>, { target: 'dock' }>
): boolean {
  if (!communicationsDockController.isSender(sender, request)) {
    return false
  }
  const snapshot = communicationsDockController.getSnapshotForSender(sender)
  const tab = snapshot.layout.tabs.find((candidate) => candidate.id === request.tabId)
  return snapshot.layout.activeTabId === request.tabId && tab?.activeLeafAppId === 'whatsapp-web'
}

export function registerWhatsAppFastResponseHandlers(store: Store): void {
  host ??= new WhatsAppFastResponseHost(store)
  ipcMain.handle('whatsappFastResponse:attach', (event, value: unknown) => {
    const request = WhatsAppFastResponseAttachSchema.safeParse(value)
    if (!request.success) {
      throw new Error('whatsapp_fast_response_attach_denied')
    }
    requireSender(event.sender, request.data)
    return host!.attach(event.sender, request.data)
  })
  ipcMain.handle('whatsappFastResponse:updateBounds', (event, value: unknown) => {
    const request = WhatsAppFastResponseAttachSchema.safeParse(value)
    if (!request.success) {
      throw new Error('whatsapp_fast_response_bounds_denied')
    }
    requireSender(event.sender, request.data)
    return host!.update(event.sender, request.data)
  })
  for (const [channel, operation] of [
    ['whatsappFastResponse:show', 'show'],
    ['whatsappFastResponse:hide', 'hide'],
    ['whatsappFastResponse:collapse', 'collapse']
  ] as const) {
    ipcMain.handle(channel, (event, value: unknown) => {
      const request = WhatsAppFastResponseVisibilitySchema.safeParse(value)
      if (!request.success) {
        throw new Error('whatsapp_fast_response_visibility_denied')
      }
      requireSender(event.sender, request.data)
      return host![operation](event.sender, request.data)
    })
  }
}

export function shutdownWhatsAppFastResponseHost(): void {
  host?.shutdown()
  host = null
}
