import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mocks,
  request,
  resetCompactHostFixture,
  sender,
  store,
  visibility
} from './compact-host-test-fixture'

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: (sender: { id: number }) => mocks.windows.get(sender.id) ?? null,
    getAllWindows: () => [...mocks.windows.values()]
  },
  WebContentsView: mocks.WebContentsView
}))
vi.mock('../browser/browser-session-registry', () => ({
  browserSessionRegistry: {
    resolveKnownPartition: mocks.resolveKnownPartition,
    createProfile: mocks.createProfile
  }
}))
vi.mock('../ipc/ui', () => ({ sendToTrustedUIRenderer: vi.fn() }))

import { WhatsAppFastResponseHost } from './compact-host'

describe('WhatsAppFastResponseHost', () => {
  beforeEach(() => {
    resetCompactHostFixture()
  })
  it('keeps one guest through attached to dock reattachment without reload', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    const attachedWindow = mocks.windows.get(sender.id)!
    host.attach(sender as never, request)
    const dockSender = { id: 2, isDestroyed: () => false, send: vi.fn() }
    const dockWindow = {
      isDestroyed: () => false,
      once: vi.fn(),
      removeListener: vi.fn(),
      getContentBounds: () => ({ x: 0, y: 0, width: 500, height: 600 }),
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }
    }
    mocks.windows.set(dockSender.id, dockWindow)
    host.attach(dockSender as never, {
      appId: 'whatsapp-web',
      target: 'dock',
      generation: 2,
      revision: 3,
      tabId: 'tab',
      activeLeafAppId: 'whatsapp-web',
      rectCss: request.rectCss,
      rendererZoomFactor: 1
    })
    expect(mocks.WebContentsView).toHaveBeenCalledTimes(1)
    expect(mocks.webContents.loadURL).toHaveBeenCalledTimes(1)
    expect(mocks.view.setBounds).toHaveBeenLastCalledWith({ x: 1, y: 2, width: 300, height: 400 })
    expect(attachedWindow.contentView.removeChildView).toHaveBeenCalledWith(mocks.view)
    expect(dockWindow.contentView.addChildView).toHaveBeenCalledTimes(1)
    expect(attachedWindow.once).toHaveBeenCalledWith('closed', expect.any(Function))
    expect(dockWindow.once).toHaveBeenCalledWith('closed', expect.any(Function))
    expect(attachedWindow.contentView.removeChildView.mock.invocationCallOrder[0]).toBeLessThan(
      dockWindow.contentView.addChildView.mock.invocationCallOrder[0]!
    )
  })
  it('moves one guest to a registered browser owner after removing the compact adapter', async () => {
    const host = new WhatsAppFastResponseHost(store as never)
    const attachedWindow = mocks.windows.get(sender.id)!
    host.attach(sender as never, request)
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true }))
    const browserSender = { id: 2, isDestroyed: () => false, send: vi.fn() }
    const browserWindow = {
      isDestroyed: () => false,
      once: vi.fn(),
      removeListener: vi.fn(),
      getContentBounds: () => ({ x: 0, y: 0, width: 700, height: 600 }),
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }
    }
    mocks.windows.set(browserSender.id, browserWindow)
    await host.attachBrowser(browserSender as never, {
      appId: 'whatsapp-web',
      target: 'browser',
      browserTabId: 'browser-tab',
      browserPageId: 'browser-page',
      workspaceId: 'workspace',
      registrationToken: '5cf78e54-a9a8-4ef1-a817-c72ddb837465',
      revision: 1,
      rectCss: { x: 0, y: 0, width: 700, height: 600 },
      rendererZoomFactor: 1
    })
    expect(mocks.WebContentsView).toHaveBeenCalledOnce()
    expect(mocks.webContents.loadURL).toHaveBeenCalledOnce()
    expect(attachedWindow.contentView.removeChildView).toHaveBeenCalledWith(mocks.view)
    expect(mocks.webContents.executeJavaScriptInIsolatedWorld).toHaveBeenLastCalledWith(
      999,
      [{ code: 'window.__orcaWhatsAppFastResponseCleanup?.();' }],
      false
    )
    expect(mocks.webContents.removeInsertedCSS).toHaveBeenCalledWith('css-key')
    expect(browserWindow.contentView.addChildView).toHaveBeenCalledWith(mocks.view)
    expect(browserWindow.once).not.toHaveBeenCalledWith('closed', expect.any(Function))
    expect(mocks.webContents.removeInsertedCSS.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      browserWindow.contentView.addChildView.mock.invocationCallOrder[0]!
    )
    const start = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-start-navigation'
    )?.[1]
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    start?.({}, 'https://web.whatsapp.com/', false, true)
    expect(mocks.webContents.insertCSS).toHaveBeenCalledOnce()
    host.attach(sender as never, { ...request, requestId: 2, surfaceId: 2 })
    expect(mocks.webContents.insertCSS).toHaveBeenCalledOnce()
    finish?.()
    await vi.waitFor(() => expect(mocks.webContents.insertCSS).toHaveBeenCalledTimes(2))
    expect(mocks.WebContentsView).toHaveBeenCalledOnce()
    expect(mocks.webContents.loadURL).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(mocks.view.setVisible).toHaveBeenLastCalledWith(true))
  })
  it('cleans a destroyed owner while preserving the guest for reattachment', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    const attachedWindow = mocks.windows.get(sender.id)!
    host.attach(sender as never, request)
    const closed = attachedWindow.once.mock.calls.find((call) => call[0] === 'closed')?.[1]
    if (typeof closed !== 'function') {
      throw new Error('owner closed listener missing')
    }
    closed()
    expect(host.snapshot()).toMatchObject({ attached: false, visible: false })
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(false)
    expect(mocks.webContents.close).not.toHaveBeenCalled()
    host.attach(sender as never, request)
    expect(mocks.WebContentsView).toHaveBeenCalledTimes(1)
    expect(mocks.webContents.loadURL).toHaveBeenCalledTimes(1)
    host.hide(sender as never, visibility)
    host.attach(sender as never, request)
    expect(attachedWindow.removeListener).toHaveBeenCalledWith('closed', expect.any(Function))
  })
  it('does not add a main-window closed listener for an attached DOM owner', () => {
    const owner = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
      getContentBounds: () => ({ x: 0, y: 0, width: 500, height: 600 }),
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }
    })
    const host = new WhatsAppFastResponseHost(store as never)
    for (let index = 0; index < 9; index += 1) {
      owner.on('closed', () => undefined)
    }
    const release = vi.fn(() => host.shutdown())
    owner.on('closed', release)
    mocks.windows.set(sender.id, owner as never)

    host.attach(sender as never, { ...request, mode: 'attached-dom' })
    expect(owner.listenerCount('closed')).toBe(10)

    owner.emit('closed')
    expect(release).toHaveBeenCalledOnce()
    expect(owner.contentView.removeChildView).toHaveBeenCalledOnce()
    expect(mocks.webContents.close).toHaveBeenCalledOnce()
    expect(host.snapshot()).toMatchObject({ attached: false, visible: false })
  })
  it('hides, shows, collapses and rejects stale owners', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    host.hide(sender as never, visibility)
    host.show(sender as never, visibility)
    host.collapse(sender as never, visibility)
    expect(mocks.view.setVisible).toHaveBeenCalledWith(false)
    expect(() => host.show({ id: 2 } as never, visibility)).toThrow('whatsapp_fast_response_stale')
  })
  it('shows a browser owner without waiting for a compact adapter', async () => {
    const host = new WhatsAppFastResponseHost(store as never)
    const browserRequest = {
      appId: 'whatsapp-web' as const,
      target: 'browser' as const,
      browserTabId: 'browser-tab',
      browserPageId: 'browser-page',
      workspaceId: 'workspace',
      registrationToken: '5cf78e54-a9a8-4ef1-a817-c72ddb837465',
      revision: 1,
      rectCss: { x: 0, y: 0, width: 300, height: 400 },
      rendererZoomFactor: 1
    }
    await host.attachBrowser(sender as never, browserRequest)
    host.hide(sender as never, {
      appId: 'whatsapp-web',
      target: 'browser',
      browserTabId: browserRequest.browserTabId,
      browserPageId: browserRequest.browserPageId,
      workspaceId: browserRequest.workspaceId,
      registrationToken: browserRequest.registrationToken,
      revision: browserRequest.revision
    })
    host.show(sender as never, {
      appId: 'whatsapp-web',
      target: 'browser',
      browserTabId: browserRequest.browserTabId,
      browserPageId: browserRequest.browserPageId,
      workspaceId: browserRequest.workspaceId,
      registrationToken: browserRequest.registrationToken,
      revision: browserRequest.revision
    })
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(true)
  })
  it('keeps a browser owner visible through full-page navigation', async () => {
    const host = new WhatsAppFastResponseHost(store as never)
    await host.attachBrowser(sender as never, {
      appId: 'whatsapp-web',
      target: 'browser',
      browserTabId: 'browser-tab',
      browserPageId: 'browser-page',
      workspaceId: 'workspace',
      registrationToken: '5cf78e54-a9a8-4ef1-a817-c72ddb837465',
      revision: 1,
      rectCss: { x: 0, y: 0, width: 300, height: 400 },
      rendererZoomFactor: 1
    })
    const start = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-start-navigation'
    )?.[1]
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    mocks.view.setVisible.mockClear()

    start?.({}, 'https://web.whatsapp.com/', false, true)
    expect(host.snapshot()).toMatchObject({ contentMode: 'loading', loaded: false, visible: true })
    expect(mocks.view.setVisible).not.toHaveBeenCalled()

    finish?.()
    expect(host.snapshot()).toMatchObject({ contentMode: 'loading', loaded: true, visible: true })
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(true)
  })
  it('recovers a compact claim after a failed browser navigation', async () => {
    let resolveRetry: (() => void) | undefined
    mocks.webContents.loadURL.mockResolvedValueOnce(undefined).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve
        })
    )
    const host = new WhatsAppFastResponseHost(store as never)
    await host.attachBrowser(sender as never, {
      appId: 'whatsapp-web',
      target: 'browser',
      browserTabId: 'browser-tab',
      browserPageId: 'browser-page',
      workspaceId: 'workspace',
      registrationToken: '5cf78e54-a9a8-4ef1-a817-c72ddb837465',
      revision: 1,
      rectCss: { x: 0, y: 0, width: 300, height: 400 },
      rendererZoomFactor: 1
    })
    const start = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-start-navigation'
    )?.[1]
    const fail = mocks.webContents.on.mock.calls.find(([event]) => event === 'did-fail-load')?.[1]
    start?.({}, 'https://web.whatsapp.com/', false, true)
    fail?.({}, -2, 'ERR_FAILED', 'https://web.whatsapp.com/', true)
    expect(sender.send.mock.calls.at(-1)?.[1]).toMatchObject({
      contentMode: 'loading',
      state: 'error',
      recoverable: true
    })

    host.attach(sender as never, { ...request, requestId: 2, surfaceId: 2 })
    expect(host.snapshot()).toMatchObject({ contentMode: 'loading', loaded: false, visible: true })
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(false)
    expect(mocks.webContents.loadURL).toHaveBeenCalledTimes(2)

    resolveRetry?.()
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ contentMode: 'qr', loaded: true, visible: true })
    )
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(true)
  })
  it('retries a terminal aborted browser navigation on compact claim', async () => {
    let resolveRetry: (() => void) | undefined
    mocks.webContents.loadURL.mockResolvedValueOnce(undefined).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRetry = resolve
        })
    )
    const host = new WhatsAppFastResponseHost(store as never)
    await host.attachBrowser(sender as never, {
      appId: 'whatsapp-web',
      target: 'browser',
      browserTabId: 'browser-tab',
      browserPageId: 'browser-page',
      workspaceId: 'workspace',
      registrationToken: '5cf78e54-a9a8-4ef1-a817-c72ddb837465',
      revision: 1,
      rectCss: { x: 0, y: 0, width: 300, height: 400 },
      rendererZoomFactor: 1
    })
    const start = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-start-navigation'
    )?.[1]
    const fail = mocks.webContents.on.mock.calls.find(([event]) => event === 'did-fail-load')?.[1]
    start?.({}, 'https://web.whatsapp.com/', false, true)
    fail?.({}, -3, 'ERR_ABORTED', 'https://web.whatsapp.com/', true)

    host.attach(sender as never, { ...request, requestId: 2, surfaceId: 2 })

    expect(mocks.webContents.loadURL).toHaveBeenCalledTimes(2)
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(false)
    resolveRetry?.()
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ contentMode: 'qr', loaded: true, visible: true })
    )
  })
  it('does not retry an aborted navigation when its replacement finishes', async () => {
    const host = new WhatsAppFastResponseHost(store as never)
    await host.attachBrowser(sender as never, {
      appId: 'whatsapp-web',
      target: 'browser',
      browserTabId: 'browser-tab',
      browserPageId: 'browser-page',
      workspaceId: 'workspace',
      registrationToken: '5cf78e54-a9a8-4ef1-a817-c72ddb837465',
      revision: 1,
      rectCss: { x: 0, y: 0, width: 300, height: 400 },
      rendererZoomFactor: 1
    })
    const start = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-start-navigation'
    )?.[1]
    const fail = mocks.webContents.on.mock.calls.find(([event]) => event === 'did-fail-load')?.[1]
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    start?.({}, 'https://web.whatsapp.com/redirect', false, true)
    start?.({}, 'https://web.whatsapp.com/chats', false, true)
    fail?.({}, -3, 'ERR_ABORTED', 'https://web.whatsapp.com/redirect', true)
    finish?.()

    host.attach(sender as never, { ...request, requestId: 2, surfaceId: 2 })

    expect(mocks.webContents.loadURL).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true, visible: true }))
  })
  it('rejects a stale browser transition when a newer browser owner takes the guest', async () => {
    const host = new WhatsAppFastResponseHost(store as never)
    const browserRequest = {
      appId: 'whatsapp-web' as const,
      target: 'browser' as const,
      browserTabId: 'browser-tab',
      browserPageId: 'browser-page',
      workspaceId: 'workspace',
      registrationToken: '5cf78e54-a9a8-4ef1-a817-c72ddb837465',
      revision: 1,
      rectCss: { x: 0, y: 0, width: 300, height: 400 },
      rendererZoomFactor: 1
    }
    const first = host.attachBrowser(sender as never, browserRequest)
    const second = host.attachBrowser(sender as never, {
      ...browserRequest,
      registrationToken: 'f1712613-09f4-4af7-a4ee-ad1dc64aec3d',
      revision: 2
    })
    await expect(first).rejects.toThrow('whatsapp_fast_response_browser_transition_stale')
    await expect(second).resolves.toMatchObject({ visible: true })
    expect(mocks.WebContentsView).toHaveBeenCalledOnce()
    expect(mocks.webContents.loadURL).toHaveBeenCalledOnce()
  })
  it('does not clear a newer compact adapter after a browser transition becomes stale', async () => {
    let resolveCss: ((value: string) => void) | undefined
    let listener: ((ui: { floatingWorkspaceApps: unknown }) => void) | undefined
    store.onUIChanged.mockImplementationOnce(
      (next: (ui: { floatingWorkspaceApps: unknown }) => void) => {
        listener = next
        return () => {}
      }
    )
    mocks.webContents.insertCSS
      .mockResolvedValueOnce('initial-css')
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveCss = resolve
          })
      )
      .mockResolvedValueOnce('new-compact-css')
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    finish?.()
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true, visible: true }))
    listener?.({ floatingWorkspaceApps: { 'whatsapp-web': { hideArchivedChats: true } } })
    await vi.waitFor(() => expect(resolveCss).toBeTypeOf('function'))
    const browser = host.attachBrowser(sender as never, {
      appId: 'whatsapp-web',
      target: 'browser',
      browserTabId: 'browser-tab',
      browserPageId: 'browser-page',
      workspaceId: 'workspace',
      registrationToken: '5cf78e54-a9a8-4ef1-a817-c72ddb837465',
      revision: 1,
      rectCss: { x: 0, y: 0, width: 300, height: 400 },
      rendererZoomFactor: 1
    })
    host.attach(sender as never, { ...request, requestId: 2, surfaceId: 2 })
    resolveCss?.('stale-css')
    await expect(browser).rejects.toThrow('whatsapp_fast_response_browser_transition_stale')
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true, visible: true }))
    expect(mocks.webContents.removeInsertedCSS).not.toHaveBeenCalledWith('new-compact-css')
    expect(
      (
        mocks.webContents.executeJavaScriptInIsolatedWorld.mock.calls as unknown as [
          number,
          { code: string }[],
          boolean
        ][]
      ).some(([, worlds]) =>
        worlds.some(({ code }) => code === 'window.__orcaWhatsAppFastResponseCleanup?.();')
      )
    ).toBe(false)
  })
  it('keeps a newer compact adapter intact when ownership changes during browser cleanup', async () => {
    let resolveCleanup: (() => void) | undefined
    mocks.webContents.insertCSS
      .mockResolvedValueOnce('initial-css')
      .mockResolvedValueOnce('new-compact-css')
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    finish?.()
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true, visible: true }))
    mocks.webContents.executeJavaScriptInIsolatedWorld.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveCleanup = resolve
        })
    )
    const browser = host.attachBrowser(sender as never, {
      appId: 'whatsapp-web',
      target: 'browser',
      browserTabId: 'browser-tab',
      browserPageId: 'browser-page',
      workspaceId: 'workspace',
      registrationToken: '5cf78e54-a9a8-4ef1-a817-c72ddb837465',
      revision: 1,
      rectCss: { x: 0, y: 0, width: 300, height: 400 },
      rendererZoomFactor: 1
    })
    await vi.waitFor(() => expect(resolveCleanup).toBeTypeOf('function'))
    host.attach(sender as never, { ...request, requestId: 2, surfaceId: 2 })
    resolveCleanup?.()
    await expect(browser).rejects.toThrow('whatsapp_fast_response_browser_transition_stale')
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true, visible: true }))
    expect(mocks.webContents.removeInsertedCSS).not.toHaveBeenCalledWith('new-compact-css')
  })
  it.each(['script', 'css'] as const)(
    'keeps the browser owner hidden when compact cleanup %s fails',
    async (failure) => {
      const host = new WhatsAppFastResponseHost(store as never)
      host.attach(sender as never, request)
      const finish = mocks.webContents.on.mock.calls.find(
        ([event]) => event === 'did-finish-load'
      )?.[1]
      finish?.()
      await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true }))
      if (failure === 'script') {
        mocks.webContents.executeJavaScriptInIsolatedWorld.mockRejectedValueOnce(
          new Error('cleanup')
        )
      } else {
        mocks.webContents.removeInsertedCSS.mockRejectedValueOnce(new Error('css'))
      }
      await expect(
        host.attachBrowser(sender as never, {
          appId: 'whatsapp-web',
          target: 'browser',
          browserTabId: 'browser-tab',
          browserPageId: 'browser-page',
          workspaceId: 'workspace',
          registrationToken: '5cf78e54-a9a8-4ef1-a817-c72ddb837465',
          revision: 1,
          rectCss: { x: 0, y: 0, width: 300, height: 400 },
          rendererZoomFactor: 1
        })
      ).rejects.toThrow('whatsapp_fast_response_browser_cleanup_failed')
      expect(mocks.view.setVisible).toHaveBeenLastCalledWith(false)
      await expect(
        host.attachBrowser(sender as never, {
          appId: 'whatsapp-web',
          target: 'browser',
          browserTabId: 'browser-tab',
          browserPageId: 'browser-page',
          workspaceId: 'workspace',
          registrationToken: '5cf78e54-a9a8-4ef1-a817-c72ddb837465',
          revision: 1,
          rectCss: { x: 0, y: 0, width: 300, height: 400 },
          rendererZoomFactor: 1
        })
      ).resolves.toMatchObject({ visible: true })
      expect(mocks.webContents.removeInsertedCSS).toHaveBeenCalledWith('css-key')
    }
  )
  it('applies the compact adapter after a browser-first load without loading a second guest', async () => {
    const host = new WhatsAppFastResponseHost(store as never)
    const browserRequest = {
      appId: 'whatsapp-web' as const,
      target: 'browser' as const,
      browserTabId: 'browser-tab',
      browserPageId: 'browser-page',
      workspaceId: 'workspace',
      registrationToken: '5cf78e54-a9a8-4ef1-a817-c72ddb837465',
      revision: 1,
      rectCss: { x: 0, y: 0, width: 300, height: 400 },
      rendererZoomFactor: 1
    }
    await host.attachBrowser(sender as never, browserRequest)
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    finish?.()
    host.attach(sender as never, request)
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true, visible: true }))
    expect(mocks.WebContentsView).toHaveBeenCalledOnce()
    expect(mocks.webContents.loadURL).toHaveBeenCalledOnce()
  })
  it('converts CSS geometry once and clips it to the content bounds', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, {
      ...request,
      rectCss: { x: 10, y: 30, width: 300, height: 400 },
      rendererZoomFactor: 1.5
    })
    expect(mocks.view.setBounds).toHaveBeenLastCalledWith({ x: 15, y: 45, width: 450, height: 555 })
    host.update(sender as never, {
      ...request,
      rectCss: { x: -1, y: -2, width: 10, height: 10 }
    })
    expect(mocks.view.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 9, height: 8 })
    expect(() =>
      host.update(sender as never, {
        ...request,
        rectCss: { x: -20, y: 30, width: 10, height: 10 }
      })
    ).toThrow('whatsapp_fast_response_rect_denied')
  })
  it('hides a current owner for transient invalid geometry and restores it on the next valid update', async () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    finish?.()
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true, visible: true }))

    expect(() =>
      host.update(sender as never, {
        ...request,
        rectCss: { x: -20, y: 30, width: 10, height: 10 }
      })
    ).toThrow('whatsapp_fast_response_rect_denied')
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(false)
    expect(sender.send.mock.calls.at(-1)?.[1]).toMatchObject({ state: 'error' })

    host.update(sender as never, request)
    expect(mocks.view.setBounds).toHaveBeenLastCalledWith({ x: 1, y: 2, width: 300, height: 400 })
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(true)
    expect(sender.send.mock.calls.at(-1)?.[1]).toMatchObject({ state: 'ready' })
  })
  it('does not hide the current owner for invalid geometry from another identity', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const visibilityCalls = mocks.view.setVisible.mock.calls.length

    expect(() =>
      host.attach(sender as never, {
        ...request,
        requestId: 2,
        surfaceId: 2,
        rectCss: { x: -20, y: 30, width: 10, height: 10 }
      })
    ).toThrow('whatsapp_fast_response_rect_denied')

    expect(mocks.view.setVisible).toHaveBeenCalledTimes(visibilityCalls)
    expect(host.snapshot()).toMatchObject({ attached: true, visible: true })
  })
  it('restores a browser owner after transient invalid geometry', async () => {
    const host = new WhatsAppFastResponseHost(store as never)
    const browserRequest = {
      appId: 'whatsapp-web' as const,
      target: 'browser' as const,
      browserTabId: 'browser-tab',
      browserPageId: 'browser-page',
      workspaceId: 'workspace',
      registrationToken: '5cf78e54-a9a8-4ef1-a817-c72ddb837465',
      revision: 1,
      rectCss: { x: 0, y: 0, width: 300, height: 400 },
      rendererZoomFactor: 1
    }
    await host.attachBrowser(sender as never, browserRequest)

    expect(() =>
      host.update(sender as never, {
        ...browserRequest,
        rectCss: { x: -20, y: 30, width: 10, height: 10 }
      })
    ).toThrow('whatsapp_fast_response_rect_denied')
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(false)

    host.update(sender as never, browserRequest)
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(true)
  })
  it('rejects fully invalid geometry before creating or attaching the guest', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    expect(() =>
      host.attach(sender as never, {
        ...request,
        rectCss: { x: -20, y: 30, width: 10, height: 10 }
      })
    ).toThrow('whatsapp_fast_response_rect_denied')
    expect(mocks.WebContentsView).not.toHaveBeenCalled()
    expect(mocks.webContents.loadURL).not.toHaveBeenCalled()
    expect(mocks.windows.get(sender.id)?.contentView.addChildView).not.toHaveBeenCalled()
  })
  it('updates fractional one-pixel geometry to full integer bounds without replacing the guest', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    const compact = {
      ...request,
      rectCss: { x: 2 / 3, y: 37 + 1 / 3, width: 318 + 2 / 3, height: 1 }
    }
    host.attach(sender as never, compact)
    expect(mocks.view.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 37, width: 320, height: 2 })

    host.update(sender as never, {
      ...compact,
      rectCss: { ...compact.rectCss, height: 320 }
    })
    expect(mocks.view.setBounds).toHaveBeenLastCalledWith({
      x: 0,
      y: 37,
      width: 320,
      height: 321
    })
    expect(mocks.WebContentsView).toHaveBeenCalledOnce()
    expect(mocks.webContents.loadURL).toHaveBeenCalledOnce()

    expect(() =>
      host.update(sender as never, {
        ...compact,
        requestId: compact.requestId + 1,
        rectCss: { ...compact.rectCss, height: 200 }
      })
    ).toThrow('whatsapp_fast_response_stale')
    expect(mocks.view.setBounds).toHaveBeenCalledTimes(2)
  })
  it('rejects an unknown configured profile', () => {
    mocks.resolveKnownPartition.mockReturnValueOnce(null)
    store.getUI.mockReturnValue({
      floatingWorkspaceApps: {
        'whatsapp-web': { sessionProfileIdOverride: 'missing', dedicatedSessionProfileId: null }
      }
    })
    const host = new WhatsAppFastResponseHost(store as never)
    expect(() => host.attach(sender as never, request)).toThrow(
      'whatsapp_fast_response_profile_denied'
    )
  })
  it('closes the guest idempotently', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    host.shutdown()
    host.shutdown()
    expect(mocks.webContents.close).toHaveBeenCalledTimes(1)
  })
})
