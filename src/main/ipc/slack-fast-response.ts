import { BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import type { Store } from '../persistence'
import {
  SlackFastResponseAttachSchema,
  SlackFastResponseBrowserRegistrationSchema,
  SlackFastResponseUnregisterBrowserSurfaceRequestSchema,
  SlackFastResponseVisibilitySchema,
  type SlackFastResponseBrowserRegistration,
  type SlackFastResponseUnregisterBrowserSurfaceRequest
} from '../../shared/slack-fast-response'
import { listCommunicationsDockApps } from '../../shared/communications-dock'
import { SlackFastResponseHost } from '../slack-fast-response/compact-host'
import { communicationsDockController } from '../window/communications-dock-controller'
import { floatingCommsSurfaceController } from '../window/floating-comms-surface-controller'
import { isTrustedUIRenderer } from './ui'

let host: SlackFastResponseHost | null = null
type Registration = SlackFastResponseBrowserRegistration & {
  registrationToken: string
  sender: Electron.WebContents
  owner: BrowserWindow
  destroyed: () => void
}
const registrations = new Map<string, Registration>()

function matches(
  registration: Registration,
  request: SlackFastResponseUnregisterBrowserSurfaceRequest
): boolean {
  return (
    registration.appId === request.appId &&
    registration.browserTabId === request.browserTabId &&
    registration.browserPageId === request.browserPageId &&
    registration.workspaceId === request.workspaceId &&
    registration.revision === request.revision
  )
}

function removeRegistration(token: string): void {
  const registration = registrations.get(token)
  if (!registration) {
    return
  }
  host?.release(registration.sender, { ...registration, target: 'browser' })
  registration.owner.webContents.removeListener('destroyed', registration.destroyed)
  registrations.delete(token)
}

function registerBrowserSurface(
  sender: Electron.WebContents,
  request: SlackFastResponseBrowserRegistration
): { registrationToken: string } {
  if (!isTrustedUIRenderer(sender)) {
    throw new Error('slack_fast_response_browser_registration_denied')
  }
  const owner = BrowserWindow.fromWebContents(sender)
  if (!owner || owner.isDestroyed()) {
    throw new Error('slack_fast_response_browser_registration_denied')
  }
  for (const [token, registration] of registrations) {
    if (registration.sender.id === sender.id || registration.owner === owner) {
      removeRegistration(token)
    }
  }
  const registrationToken = randomUUID()
  const destroyed = () => removeRegistration(registrationToken)
  registrations.set(registrationToken, { ...request, registrationToken, sender, owner, destroyed })
  owner.webContents.once('destroyed', destroyed)
  return { registrationToken }
}

function requireSender(
  sender: Electron.WebContents,
  request: ReturnType<typeof SlackFastResponseVisibilitySchema.parse>
): void {
  const allowed =
    request.target === 'attached'
      ? floatingCommsSurfaceController.isAttachedSender(sender, request)
      : request.target === 'dock'
        ? isCurrentDockSender(sender, request)
        : Boolean(
            registrations.get(request.registrationToken)?.sender.id === sender.id &&
            matches(registrations.get(request.registrationToken)!, request)
          )
  if (!allowed) {
    throw new Error('slack_fast_response_sender_denied')
  }
}

function isCurrentDockSender(
  sender: Electron.WebContents,
  request: Extract<ReturnType<typeof SlackFastResponseVisibilitySchema.parse>, { target: 'dock' }>
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
    listCommunicationsDockApps(tab.layout).includes('slack')
  )
}

export function registerSlackFastResponseHandlers(store: Store): void {
  host ??= new SlackFastResponseHost(store)
  ipcMain.handle('slackFastResponse:registerBrowserSurface', (event, value: unknown) => {
    const request = SlackFastResponseBrowserRegistrationSchema.safeParse(value)
    if (!request.success) {
      throw new Error('slack_fast_response_browser_registration_denied')
    }
    return registerBrowserSurface(event.sender, request.data)
  })
  ipcMain.handle('slackFastResponse:unregisterBrowserSurface', (event, value: unknown) => {
    const request = SlackFastResponseUnregisterBrowserSurfaceRequestSchema.safeParse(value)
    if (!request.success) {
      throw new Error('slack_fast_response_browser_registration_denied')
    }
    const registration = registrations.get(request.data.registrationToken)
    if (!registration) {
      return
    }
    if (registration.sender.id !== event.sender.id || !matches(registration, request.data)) {
      throw new Error('slack_fast_response_browser_registration_denied')
    }
    removeRegistration(request.data.registrationToken)
  })
  for (const [channel, operation] of [
    ['attach', 'attach'],
    ['updateBounds', 'update']
  ] as const) {
    ipcMain.handle(`slackFastResponse:${channel}`, (event, value: unknown) => {
      const request = SlackFastResponseAttachSchema.safeParse(value)
      if (!request.success) {
        throw new Error('slack_fast_response_request_denied')
      }
      requireSender(event.sender, request.data)
      return host![operation](event.sender, request.data)
    })
  }
  for (const operation of ['show', 'hide'] as const) {
    ipcMain.handle(`slackFastResponse:${operation}`, (event, value: unknown) => {
      const request = SlackFastResponseVisibilitySchema.safeParse(value)
      if (!request.success) {
        throw new Error('slack_fast_response_request_denied')
      }
      requireSender(event.sender, request.data)
      return host![operation](event.sender, request.data)
    })
  }
}

export function shutdownSlackFastResponseHost(): void {
  host?.shutdown()
  host = null
  for (const token of registrations.keys()) {
    removeRegistration(token)
  }
}
