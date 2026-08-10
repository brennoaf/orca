import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const windows = new Map<
    number,
    {
      isDestroyed: () => boolean
      once: ReturnType<typeof vi.fn>
      removeListener: ReturnType<typeof vi.fn>
      getContentBounds: () => { x: number; y: number; width: number; height: number }
      contentView: {
        addChildView: ReturnType<typeof vi.fn>
        removeChildView: ReturnType<typeof vi.fn>
      }
    }
  >()
  const webContents = {
    isDestroyed: vi.fn(() => false),
    setWindowOpenHandler: vi.fn(),
    on: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    insertCSS: vi.fn(() => Promise.resolve('css-key')),
    removeInsertedCSS: vi.fn(() => Promise.resolve()),
    executeJavaScript: vi.fn(() => Promise.resolve('qr')),
    executeJavaScriptInIsolatedWorld: vi.fn(() => Promise.resolve('qr')),
    close: vi.fn()
  }
  return {
    windows,
    webContents,
    view: { setBounds: vi.fn(), setVisible: vi.fn(), webContents },
    WebContentsView: vi.fn(function () {
      return mocks.view
    }),
    resolveKnownPartition: vi.fn<(id: string) => string | null>(() => 'persist:whatsapp'),
    createProfile: vi.fn(() => ({ id: 'profile-whatsapp', partition: 'persist:whatsapp' }))
  }
})

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

import { WhatsAppFastResponseHost } from './compact-host'

const sender = { id: 1, isDestroyed: () => false, send: vi.fn() }
const store = {
  getUI: vi.fn(() => ({ floatingWorkspaceApps: {} })),
  updateUI: vi.fn()
}
const request = {
  appId: 'whatsapp-web' as const,
  target: 'attached' as const,
  requestId: 1,
  surfaceId: 1,
  mode: 'attached-native' as const,
  rectCss: { x: 1, y: 2, width: 300, height: 400 },
  rendererZoomFactor: 1
}
const visibility = {
  appId: 'whatsapp-web' as const,
  target: 'attached' as const,
  requestId: 1,
  surfaceId: 1,
  mode: 'attached-native' as const
}

describe('WhatsAppFastResponseHost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.windows.clear()
    mocks.windows.set(sender.id, {
      isDestroyed: () => false,
      once: vi.fn(),
      removeListener: vi.fn(),
      getContentBounds: () => ({ x: 0, y: 0, width: 500, height: 600 }),
      contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }
    })
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
    expect(attachedWindow.contentView.removeChildView.mock.invocationCallOrder[0]).toBeLessThan(
      dockWindow.contentView.addChildView.mock.invocationCallOrder[0]!
    )
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
  it('hides, shows, collapses and rejects stale owners', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    host.hide(sender as never, visibility)
    host.show(sender as never, visibility)
    host.collapse(sender as never, visibility)
    expect(mocks.view.setVisible).toHaveBeenCalledWith(false)
    expect(() => host.show({ id: 2 } as never, visibility)).toThrow('whatsapp_fast_response_stale')
  })
  it('converts CSS geometry once and clips it to the content bounds', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, {
      ...request,
      rectCss: { x: 10, y: 30, width: 300, height: 400 },
      rendererZoomFactor: 1.5
    })
    expect(mocks.view.setBounds).toHaveBeenLastCalledWith({ x: 15, y: 45, width: 450, height: 555 })
    expect(() =>
      host.update(sender as never, { ...request, rectCss: { x: -1, y: 30, width: 10, height: 10 } })
    ).toThrow('whatsapp_fast_response_rect_denied')
  })
  it('rejects an unknown configured profile', () => {
    mocks.resolveKnownPartition.mockReturnValueOnce(null)
    store.getUI.mockReturnValueOnce({
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
  it('discards a crashed guest and reloads a replacement', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const crash = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'render-process-gone'
    )?.[1]
    crash?.()
    host.attach(sender as never, request)
    expect(mocks.WebContentsView).toHaveBeenCalledTimes(2)
    expect(mocks.webContents.loadURL).toHaveBeenCalledTimes(2)
  })
  it('publishes loading then crash only to the active owner', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const crash = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'render-process-gone'
    )?.[1]
    crash?.()
    expect(sender.send.mock.calls.map(([, state]) => state.state)).toEqual(['loading', 'crashed'])
    expect(sender.send.mock.calls[1]?.[1]).toMatchObject({ recoverable: true })
  })
  it('keeps loading state when hidden before ready', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    host.hide(sender as never, visibility)
    expect(sender.send.mock.calls.map(([, state]) => state.state)).toEqual(['loading'])
    expect(host.snapshot()).toMatchObject({ loaded: false, crashed: false, visible: false })
  })
  it('keeps ready state when hidden after load', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    finish?.()
    host.hide(sender as never, visibility)
    expect(sender.send.mock.calls.map(([, state]) => state.state)).toEqual(['loading', 'ready'])
    expect(host.snapshot()).toMatchObject({ loaded: true, crashed: false, visible: false })
  })
  it('injects the compact adapter only after its guest finishes loading and reapplies on reload', async () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    const start = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-start-navigation'
    )?.[1]
    finish?.()
    await vi.waitFor(() => expect(mocks.webContents.insertCSS).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 0))
    start?.()
    await vi.waitFor(() =>
      expect(mocks.webContents.removeInsertedCSS).toHaveBeenCalledWith('css-key')
    )
    finish?.()
    await vi.waitFor(() => expect(mocks.webContents.insertCSS).toHaveBeenCalledTimes(2))
  })
})
