import { ipcMain, BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type { z } from 'zod'
import type { Store } from '../persistence'
import {
  WhatsAppFastResponseAttachSchema,
  WhatsAppFastResponseBrowserRegistrationSchema,
  WhatsAppFastResponseUnregisterBrowserSurfaceRequestSchema,
  WhatsAppFastResponseVisibilitySchema
} from '../../shared/whatsapp-fast-response'
import type {
  WhatsAppFastResponseBrowserRegistration,
  WhatsAppFastResponseUnregisterBrowserSurfaceRequest
} from '../../shared/whatsapp-fast-response'
import { listCommunicationsDockApps } from '../../shared/communications-dock'
import { communicationsDockController } from '../window/communications-dock-controller'
import { floatingCommsSurfaceController } from '../window/floating-comms-surface-controller'
import { WhatsAppFastResponseHost } from '../whatsapp-fast-response/compact-host'
import { dispatchMainNotification } from './notifications'
import { isTrustedUIRenderer } from './ui'

let host: WhatsAppFastResponseHost | null = null
type BrowserRegistration = WhatsAppFastResponseBrowserRegistration & {
  registrationToken: string
  senderId: number
  sender: Electron.WebContents
  owner: BrowserWindow
  destroyed: () => void
}
type BrowserRegistrationIdentity = WhatsAppFastResponseUnregisterBrowserSurfaceRequest
const browserRegistrations = new Map<string, BrowserRegistration>()

function requireSender(
  sender: Electron.WebContents,
  request:
    | z.infer<typeof WhatsAppFastResponseAttachSchema>
    | z.infer<typeof WhatsAppFastResponseVisibilitySchema>
): void {
  const allowed =
    request.target === 'attached'
      ? floatingCommsSurfaceController.isAttachedSender(sender, request)
      : request.target === 'dock'
        ? isCurrentDockSender(sender, request)
        : isCurrentBrowserSender(sender, request)
  if (!allowed) {
    throw new Error('whatsapp_fast_response_sender_denied')
  }
}

function isCurrentBrowserSender(
  sender: Electron.WebContents,
  request: Extract<
    z.infer<typeof WhatsAppFastResponseAttachSchema | typeof WhatsAppFastResponseVisibilitySchema>,
    { target: 'browser' }
  >
): boolean {
  const registration = browserRegistrations.get(request.registrationToken)
  return Boolean(
    registration &&
    registration.senderId === sender.id &&
    matchesBrowserRegistrationIdentity(registration, request) &&
    !registration.owner.isDestroyed()
  )
}

function matchesBrowserRegistrationIdentity(
  registration: BrowserRegistration,
  request: BrowserRegistrationIdentity
): boolean {
  return (
    registration.appId === request.appId &&
    registration.browserTabId === request.browserTabId &&
    registration.browserPageId === request.browserPageId &&
    registration.workspaceId === request.workspaceId &&
    registration.revision === request.revision
  )
}

function removeBrowserRegistration(token: string): void {
  const registration = browserRegistrations.get(token)
  if (!registration) {
    return
  }
  host?.releaseBrowser(registration.sender, {
    appId: registration.appId,
    target: 'browser',
    browserTabId: registration.browserTabId,
    browserPageId: registration.browserPageId,
    workspaceId: registration.workspaceId,
    registrationToken: registration.registrationToken,
    revision: registration.revision
  })
  registration.owner.webContents.removeListener('destroyed', registration.destroyed)
  browserRegistrations.delete(token)
}

function isBrowserRegistrationCleanupSender(
  registration: BrowserRegistration,
  sender: Electron.WebContents
): boolean {
  return (
    registration.senderId === sender.id ||
    BrowserWindow.fromWebContents(sender) === registration.owner
  )
}

function removeBrowserRegistrationsForOwner(
  sender: Electron.WebContents,
  owner: BrowserWindow
): void {
  for (const [token, registration] of browserRegistrations) {
    if (
      registration.appId === 'whatsapp-web' &&
      (registration.senderId === sender.id || registration.owner === owner)
    ) {
      removeBrowserRegistration(token)
    }
  }
}

function registerBrowserSurface(
  sender: Electron.WebContents,
  request: WhatsAppFastResponseBrowserRegistration
): { registrationToken: string } {
  if (!isTrustedUIRenderer(sender)) {
    throw new Error('whatsapp_fast_response_browser_registration_denied')
  }
  const owner = BrowserWindow.fromWebContents(sender)
  if (!owner || owner.isDestroyed()) {
    throw new Error('whatsapp_fast_response_browser_registration_denied')
  }
  removeBrowserRegistrationsForOwner(sender, owner)
  const registrationToken = randomUUID()
  const destroyed = () => removeBrowserRegistration(registrationToken)
  browserRegistrations.set(registrationToken, {
    ...request,
    registrationToken,
    senderId: sender.id,
    sender,
    owner,
    destroyed
  })
  owner.webContents.once('destroyed', destroyed)
  return { registrationToken }
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
  return Boolean(
    snapshot.visible &&
    !snapshot.layout.collapsed &&
    snapshot.layout.activeTabId === request.tabId &&
    tab &&
    listCommunicationsDockApps(tab.layout).includes('whatsapp-web')
  )
}

export function registerWhatsAppFastResponseHandlers(store: Store): void {
  host ??= new WhatsAppFastResponseHost(
    store,
    () => {
      void dispatchMainNotification({
        source: 'communication-message',
        notificationId: 'whatsapp-web-unread'
      })
    },
    () =>
      floatingCommsSurfaceController.isAttachedAppFocusedVisible('whatsapp-web') ||
      communicationsDockController.isAppFocusedVisible(null, 'whatsapp-web')
  )
  ipcMain.handle('whatsappFastResponse:registerBrowserSurface', (event, value: unknown) => {
    const request = WhatsAppFastResponseBrowserRegistrationSchema.safeParse(value)
    if (!request.success) {
      throw new Error('whatsapp_fast_response_browser_registration_denied')
    }
    return registerBrowserSurface(event.sender, request.data)
  })
  ipcMain.handle('whatsappFastResponse:unregisterBrowserSurface', (event, value: unknown) => {
    const request = WhatsAppFastResponseUnregisterBrowserSurfaceRequestSchema.safeParse(value)
    if (!request.success) {
      throw new Error('whatsapp_fast_response_browser_registration_denied')
    }
    const registration = browserRegistrations.get(request.data.registrationToken)
    if (!registration) {
      return
    }
    if (
      !isBrowserRegistrationCleanupSender(registration, event.sender) ||
      !matchesBrowserRegistrationIdentity(registration, request.data)
    ) {
      throw new Error('whatsapp_fast_response_browser_registration_denied')
    }
    removeBrowserRegistration(request.data.registrationToken)
  })
  ipcMain.handle('whatsappFastResponse:attach', (event, value: unknown) => {
    const request = WhatsAppFastResponseAttachSchema.safeParse(value)
    if (!request.success) {
      throw new Error('whatsapp_fast_response_attach_denied')
    }
    requireSender(event.sender, request.data)
    return request.data.target === 'browser'
      ? host!.attachBrowser(event.sender, request.data)
      : host!.attach(event.sender, request.data)
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
  for (const token of browserRegistrations.keys()) {
    removeBrowserRegistration(token)
  }
}
