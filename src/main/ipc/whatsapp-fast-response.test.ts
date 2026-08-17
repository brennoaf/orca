import { EventEmitter } from 'node:events'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (event: { sender: unknown }, value: unknown) => unknown>()
  const owner = {
    isDestroyed: () => false,
    once: vi.fn(),
    removeListener: vi.fn(),
    webContents: { once: vi.fn(), removeListener: vi.fn() }
  }
  const host = {
    attach: vi.fn(),
    attachBrowser: vi.fn(),
    update: vi.fn(),
    releaseBrowser: vi.fn(),
    shutdown: vi.fn()
  }
  const dockController = {
    isSender: vi.fn(),
    getSnapshotForSender: vi.fn()
  }
  const surfaceController = { isAttachedSender: vi.fn() }
  return {
    handlers,
    owner,
    host,
    dockController,
    surfaceController,
    trusted: vi.fn(() => true),
    fromWebContents: vi.fn((_sender: unknown) => owner)
  }
})

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
  ipcMain: {
    handle: (channel: string, handler: (event: { sender: unknown }, value: unknown) => unknown) =>
      mocks.handlers.set(channel, handler)
  }
}))
vi.mock('./ui', () => ({ isTrustedUIRenderer: mocks.trusted }))
vi.mock('../window/communications-dock-controller', () => ({
  communicationsDockController: mocks.dockController
}))
vi.mock('../window/floating-comms-surface-controller', () => ({
  floatingCommsSurfaceController: mocks.surfaceController
}))
vi.mock('../whatsapp-fast-response/compact-host', () => ({
  WhatsAppFastResponseHost: class {
    attach = mocks.host.attach
    attachBrowser = mocks.host.attachBrowser
    update = mocks.host.update
    releaseBrowser = mocks.host.releaseBrowser
    shutdown = mocks.host.shutdown
  }
}))
vi.mock('./notifications', () => ({ dispatchMainNotification: vi.fn() }))

import {
  registerWhatsAppFastResponseHandlers,
  shutdownWhatsAppFastResponseHost
} from './whatsapp-fast-response'

const sender = { id: 17 }
const registration = {
  appId: 'whatsapp-web',
  browserTabId: 'tab',
  browserPageId: 'page',
  workspaceId: 'workspace',
  revision: 1
}
const browserIdentity = { ...registration, target: 'browser' as const }
const dockRequest = {
  appId: 'whatsapp-web' as const,
  target: 'dock' as const,
  generation: 4,
  revision: 7,
  tabId: 'split-tab',
  activeLeafAppId: 'whatsapp-web' as const,
  rectCss: { x: 0, y: 0, width: 300, height: 400 },
  rendererZoomFactor: 1
}
const splitDockSnapshot = {
  generation: 4,
  revision: 7,
  visible: true,
  sessions: {},
  layout: {
    version: 1 as const,
    bounds: { x: 0, y: 0, width: 600, height: 700 },
    tabs: [
      {
        id: 'split-tab',
        layout: {
          type: 'split' as const,
          direction: 'horizontal' as const,
          ratio: 0.5,
          first: { type: 'leaf' as const, appId: 'whatsapp-web' as const },
          second: { type: 'leaf' as const, appId: 'slack' as const }
        },
        activeLeafAppId: 'slack' as const
      },
      {
        id: 'discord-tab',
        layout: { type: 'leaf' as const, appId: 'discord' as const },
        activeLeafAppId: 'discord' as const
      }
    ],
    activeTabId: 'split-tab',
    collapsed: false
  }
}

describe('registerWhatsAppFastResponseHandlers browser surface', () => {
  beforeEach(() => {
    shutdownWhatsAppFastResponseHost()
    mocks.handlers.clear()
    mocks.host.releaseBrowser.mockReset()
    mocks.host.attach.mockReset()
    mocks.host.attachBrowser.mockReset()
    mocks.host.update.mockReset()
    mocks.dockController.isSender.mockReset().mockReturnValue(true)
    mocks.dockController.getSnapshotForSender.mockReset().mockReturnValue(splitDockSnapshot)
    mocks.surfaceController.isAttachedSender.mockReset().mockReturnValue(false)
    mocks.owner.once.mockReset()
    mocks.owner.removeListener.mockReset()
    mocks.owner.webContents.once.mockReset()
    mocks.owner.webContents.removeListener.mockReset()
    mocks.trusted.mockReturnValue(true)
    mocks.fromWebContents.mockReturnValue(mocks.owner)
    registerWhatsAppFastResponseHandlers({} as never)
  })

  it('binds a registration token to its exact sender and identity', () => {
    const register = mocks.handlers.get('whatsappFastResponse:registerBrowserSurface')!
    const result = register({ sender }, registration) as { registrationToken: string }
    const unregister = mocks.handlers.get('whatsappFastResponse:unregisterBrowserSurface')!
    mocks.fromWebContents.mockReturnValue(null as never)
    expect(() =>
      unregister(
        { sender: { id: 18 } },
        { ...browserIdentity, registrationToken: result.registrationToken }
      )
    ).toThrow('whatsapp_fast_response_browser_registration_denied')
    expect(() =>
      unregister(
        { sender },
        { ...browserIdentity, revision: 2, registrationToken: result.registrationToken }
      )
    ).toThrow('whatsapp_fast_response_browser_registration_denied')
    unregister({ sender }, { ...browserIdentity, registrationToken: result.registrationToken })
    expect(mocks.host.releaseBrowser).toHaveBeenCalledOnce()
    expect(mocks.host.releaseBrowser).toHaveBeenCalledWith(sender, {
      ...registration,
      registrationToken: result.registrationToken,
      target: 'browser'
    })
  })

  it('makes stale unregister idempotent after replacing the same browser identity', () => {
    const register = mocks.handlers.get('whatsappFastResponse:registerBrowserSurface')!
    const unregister = mocks.handlers.get('whatsappFastResponse:unregisterBrowserSurface')!
    const first = register({ sender }, registration) as { registrationToken: string }
    const second = register({ sender }, registration) as { registrationToken: string }
    expect(mocks.owner.webContents.removeListener).toHaveBeenCalledWith(
      'destroyed',
      expect.any(Function)
    )
    expect(mocks.host.releaseBrowser).toHaveBeenCalledOnce()

    unregister({ sender }, { ...browserIdentity, registrationToken: first.registrationToken })
    expect(mocks.host.releaseBrowser).toHaveBeenCalledOnce()

    unregister({ sender }, { ...browserIdentity, registrationToken: second.registrationToken })
    expect(mocks.host.releaseBrowser).toHaveBeenCalledTimes(2)
    expect(mocks.host.releaseBrowser).toHaveBeenLastCalledWith(sender, {
      ...registration,
      registrationToken: second.registrationToken,
      target: 'browser'
    })
  })

  it('preserves registrations owned by a different browser window', () => {
    const otherSender = { id: 18 }
    const otherOwner = {
      isDestroyed: () => false,
      once: vi.fn(),
      removeListener: vi.fn(),
      webContents: { once: vi.fn(), removeListener: vi.fn() }
    }
    mocks.fromWebContents.mockImplementation((candidate) =>
      candidate === sender ? mocks.owner : otherOwner
    )
    const register = mocks.handlers.get('whatsappFastResponse:registerBrowserSurface')!
    const unregister = mocks.handlers.get('whatsappFastResponse:unregisterBrowserSurface')!
    const first = register({ sender }, registration) as { registrationToken: string }
    const second = register({ sender: otherSender }, registration) as { registrationToken: string }

    expect(mocks.host.releaseBrowser).not.toHaveBeenCalled()
    expect(() =>
      unregister({ sender }, { ...browserIdentity, registrationToken: second.registrationToken })
    ).toThrow('whatsapp_fast_response_browser_registration_denied')
    unregister({ sender }, { ...browserIdentity, registrationToken: first.registrationToken })
    unregister(
      { sender: otherSender },
      { ...browserIdentity, registrationToken: second.registrationToken }
    )
    expect(mocks.host.releaseBrowser).toHaveBeenCalledTimes(2)
  })

  it('sweeps an earlier renderer generation owned by the same browser window', () => {
    const reloadedSender = { id: 18 }
    mocks.fromWebContents.mockReturnValue(mocks.owner)
    const register = mocks.handlers.get('whatsappFastResponse:registerBrowserSurface')!
    const unregister = mocks.handlers.get('whatsappFastResponse:unregisterBrowserSurface')!
    const first = register({ sender }, registration) as { registrationToken: string }
    const reloadedRegistration = { ...registration, browserPageId: 'reloaded-page', revision: 2 }
    const second = register({ sender: reloadedSender }, reloadedRegistration) as {
      registrationToken: string
    }

    expect(mocks.host.releaseBrowser).toHaveBeenCalledOnce()
    unregister(
      { sender: reloadedSender },
      { ...browserIdentity, registrationToken: first.registrationToken }
    )
    expect(mocks.host.releaseBrowser).toHaveBeenCalledOnce()
    unregister(
      { sender: reloadedSender },
      { ...reloadedRegistration, target: 'browser', registrationToken: second.registrationToken }
    )
    expect(mocks.host.releaseBrowser).toHaveBeenCalledTimes(2)
  })

  it('allows exact cleanup from a later renderer generation in the same browser window', () => {
    const reloadedSender = { id: 18 }
    mocks.fromWebContents.mockReturnValue(mocks.owner)
    const register = mocks.handlers.get('whatsappFastResponse:registerBrowserSurface')!
    const unregister = mocks.handlers.get('whatsappFastResponse:unregisterBrowserSurface')!
    const result = register({ sender }, registration) as { registrationToken: string }

    unregister(
      { sender: reloadedSender },
      { ...browserIdentity, registrationToken: result.registrationToken }
    )
    expect(mocks.host.releaseBrowser).toHaveBeenCalledOnce()
  })

  it('rejects an invalid unregister payload', () => {
    const unregister = mocks.handlers.get('whatsappFastResponse:unregisterBrowserSurface')!
    expect(() =>
      unregister({ sender }, { ...browserIdentity, registrationToken: 'not-a-uuid' })
    ).toThrow('whatsapp_fast_response_browser_registration_denied')
  })

  it('rejects unregister payloads without the browser target', () => {
    const unregister = mocks.handlers.get('whatsappFastResponse:unregisterBrowserSurface')!
    const registrationToken = 'b6bf3471-5fd1-4f70-9ed8-42ebd88609f3'
    expect(() => unregister({ sender }, { ...registration, registrationToken })).toThrow(
      'whatsapp_fast_response_browser_registration_denied'
    )
    expect(() =>
      unregister({ sender }, { ...registration, target: 'dock', registrationToken })
    ).toThrow('whatsapp_fast_response_browser_registration_denied')
  })

  it('keeps one destroyed listener and does not add a closed listener', () => {
    const owner = new EventEmitter() as EventEmitter & {
      isDestroyed: () => boolean
      webContents: EventEmitter
    }
    owner.isDestroyed = () => false
    owner.webContents = new EventEmitter()
    for (let index = 0; index < 9; index += 1) {
      owner.on('closed', () => undefined)
    }
    mocks.fromWebContents.mockReturnValue(owner as never)
    const register = mocks.handlers.get('whatsappFastResponse:registerBrowserSurface')!
    const attach = mocks.handlers.get('whatsappFastResponse:attach')!
    let result = register({ sender }, registration) as { registrationToken: string }
    for (let index = 2; index <= 12; index += 1) {
      result = register(
        { sender },
        { ...registration, browserPageId: `page-${index}`, revision: index }
      ) as { registrationToken: string }
    }
    const request = {
      ...registration,
      browserPageId: 'page-12',
      revision: 12,
      target: 'browser' as const,
      registrationToken: result.registrationToken,
      rectCss: { x: 0, y: 0, width: 300, height: 400 },
      rendererZoomFactor: 1
    }

    expect(owner.listenerCount('closed')).toBe(9)
    expect(owner.webContents.listenerCount('destroyed')).toBe(1)
    expect(mocks.host.releaseBrowser).toHaveBeenCalledTimes(11)
    attach({ sender }, request)
    expect(owner.listenerCount('closed')).toBe(9)
    expect(owner.webContents.listenerCount('destroyed')).toBe(1)

    owner.webContents.emit('destroyed')
    owner.emit('closed')
    expect(mocks.host.releaseBrowser).toHaveBeenCalledTimes(12)
    expect(owner.listenerCount('closed')).toBe(9)
    expect(owner.webContents.listenerCount('destroyed')).toBe(0)
  })

  it('releases the active owner once when its web contents is destroyed', () => {
    const register = mocks.handlers.get('whatsappFastResponse:registerBrowserSurface')!
    const unregister = mocks.handlers.get('whatsappFastResponse:unregisterBrowserSurface')!
    const first = register({ sender }, registration) as { registrationToken: string }
    const destroyed = mocks.owner.webContents.once.mock.calls.findLast(
      ([event]) => event === 'destroyed'
    )?.[1]
    if (typeof destroyed !== 'function') {
      throw new Error('destroyed listener missing')
    }
    destroyed()
    destroyed()
    expect(mocks.host.releaseBrowser).toHaveBeenCalledOnce()
    unregister({ sender }, { ...browserIdentity, registrationToken: first.registrationToken })
    expect(mocks.host.releaseBrowser).toHaveBeenCalledOnce()
  })

  it('rejects stale browser visibility and bounds after a token replacement', () => {
    const register = mocks.handlers.get('whatsappFastResponse:registerBrowserSurface')!
    const old = register({ sender }, registration) as { registrationToken: string }
    register({ sender }, registration)
    const identity = {
      ...registration,
      target: 'browser' as const,
      registrationToken: old.registrationToken
    }
    const hide = mocks.handlers.get('whatsappFastResponse:hide')!
    const update = mocks.handlers.get('whatsappFastResponse:updateBounds')!
    expect(() => hide({ sender }, identity)).toThrow('whatsapp_fast_response_sender_denied')
    expect(() =>
      update(
        { sender },
        { ...identity, rectCss: { x: 0, y: 0, width: 1, height: 1 }, rendererZoomFactor: 1 }
      )
    ).toThrow('whatsapp_fast_response_sender_denied')
  })

  it('authorizes WhatsApp in a split active tab even when Slack is the active leaf', () => {
    const attach = mocks.handlers.get('whatsappFastResponse:attach')!
    const update = mocks.handlers.get('whatsappFastResponse:updateBounds')!

    attach({ sender }, dockRequest)
    update({ sender }, dockRequest)

    expect(mocks.host.attach).toHaveBeenCalledWith(sender, dockRequest)
    expect(mocks.host.update).toHaveBeenCalledWith(sender, dockRequest)
  })

  it('rejects dock requests without visible WhatsApp ownership', () => {
    const attach = mocks.handlers.get('whatsappFastResponse:attach')!
    const expectDenied = (): void => {
      expect(() => attach({ sender }, dockRequest)).toThrow('whatsapp_fast_response_sender_denied')
    }

    mocks.dockController.getSnapshotForSender.mockReturnValue({
      ...splitDockSnapshot,
      layout: { ...splitDockSnapshot.layout, activeTabId: 'discord-tab' }
    })
    expectDenied()
    mocks.dockController.getSnapshotForSender.mockReturnValue({
      ...splitDockSnapshot,
      layout: {
        ...splitDockSnapshot.layout,
        tabs: [splitDockSnapshot.layout.tabs[1]],
        activeTabId: 'discord-tab'
      }
    })
    expectDenied()
    mocks.dockController.getSnapshotForSender.mockReturnValue({
      ...splitDockSnapshot,
      layout: { ...splitDockSnapshot.layout, collapsed: true }
    })
    expectDenied()
    mocks.dockController.getSnapshotForSender.mockReturnValue({
      ...splitDockSnapshot,
      visible: false
    })
    expectDenied()
    mocks.dockController.isSender.mockReturnValue(false)
    expectDenied()

    expect(mocks.host.attach).not.toHaveBeenCalled()
  })
})

afterAll(() => shutdownWhatsAppFastResponseHost())
