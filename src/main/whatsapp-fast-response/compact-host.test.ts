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
    executeJavaScriptInIsolatedWorld: vi.fn<() => Promise<unknown>>(() => Promise.resolve('qr')),
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
vi.mock('../ipc/ui', () => ({ sendToTrustedUIRenderer: vi.fn() }))

import { WhatsAppFastResponseHost } from './compact-host'

const sender = { id: 1, isDestroyed: () => false, send: vi.fn() }
const store = {
  getUI: vi.fn(() => ({ floatingWorkspaceApps: {} })),
  updateUI: vi.fn(),
  onUIChanged: vi.fn<(listener: (ui: { floatingWorkspaceApps: unknown }) => void) => () => void>(
    () => () => {}
  )
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
  it('keeps ready state when hidden after load', async () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    finish?.()
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true, crashed: false }))
    host.hide(sender as never, visibility)
    expect(sender.send.mock.calls.map(([, state]) => state.state)).toEqual(['loading', 'ready'])
    expect(host.snapshot()).toMatchObject({ loaded: true, crashed: false, visible: false })
  })
  it('uses the hidden polling cadence after its owner closes', async () => {
    vi.useFakeTimers()
    try {
      const host = new WhatsAppFastResponseHost(store as never)
      host.attach(sender as never, request)
      const finish = mocks.webContents.on.mock.calls.find(
        ([event]) => event === 'did-finish-load'
      )?.[1]
      finish?.()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(0)
      mocks.webContents.executeJavaScriptInIsolatedWorld.mockClear()
      const closed = mocks.windows
        .get(sender.id)!
        .once.mock.calls.find((call) => call[0] === 'closed')?.[1]
      if (typeof closed !== 'function') {
        throw new Error('owner closed listener missing')
      }
      closed()

      await vi.advanceTimersByTimeAsync(2000)
      expect(mocks.webContents.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(5000)
      expect(mocks.webContents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
  it('keeps initial unread attention silent through a main-frame reload', async () => {
    vi.useFakeTimers()
    try {
      mocks.webContents.executeJavaScriptInIsolatedWorld
        .mockResolvedValueOnce('qr')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce('qr')
        .mockResolvedValueOnce(true)
      const onUnread = vi.fn()
      const host = new WhatsAppFastResponseHost(store as never, onUnread)
      host.attach(sender as never, request)
      const finish = mocks.webContents.on.mock.calls.find(
        ([event]) => event === 'did-finish-load'
      )?.[1]
      const start = mocks.webContents.on.mock.calls.find(
        ([event]) => event === 'did-start-navigation'
      )?.[1]
      finish?.()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(2000)
      expect(onUnread).not.toHaveBeenCalled()

      start?.({}, 'https://web.whatsapp.com/', false, true)
      finish?.()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(2000)

      expect(host.snapshot().attention).toEqual({ hasUnread: true })
      expect(onUnread).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
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
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    start?.({}, 'https://web.whatsapp.com/', false, true)
    await vi.waitFor(() =>
      expect(mocks.webContents.removeInsertedCSS).toHaveBeenCalledWith('css-key')
    )
    finish?.()
    await vi.waitFor(() => expect(mocks.webContents.insertCSS).toHaveBeenCalledTimes(2))
  })
  it('reapplies the adapter when archived chats preference changes without reloading the guest', async () => {
    let listener: ((ui: { floatingWorkspaceApps: unknown }) => void) | undefined
    store.onUIChanged.mockImplementationOnce(
      (next: (ui: { floatingWorkspaceApps: unknown }) => void) => {
        listener = next
        return () => {}
      }
    )
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    finish?.()
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true }))
    listener?.({ floatingWorkspaceApps: { 'whatsapp-web': { hideArchivedChats: true } } })
    await vi.waitFor(() => expect(mocks.webContents.insertCSS).toHaveBeenCalledTimes(2))
    expect(mocks.webContents.loadURL).toHaveBeenCalledTimes(1)
    expect(mocks.WebContentsView).toHaveBeenCalledTimes(1)
    expect(mocks.webContents.removeInsertedCSS).toHaveBeenCalledWith('css-key')
  })
  it('keeps an in-flight adapter application through subframe navigation', async () => {
    let resolveCss: ((value: string) => void) | undefined
    mocks.webContents.insertCSS.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          resolveCss = resolve
        })
    )
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    const start = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-start-navigation'
    )?.[1]
    finish?.()
    start?.({}, 'https://web.whatsapp.com/frame', false, false)
    resolveCss?.('css-key')
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true }))
    expect(mocks.webContents.removeInsertedCSS).not.toHaveBeenCalled()
    expect(sender.send.mock.calls.map(([, state]) => state.state)).toEqual(['loading', 'ready'])
  })
})
