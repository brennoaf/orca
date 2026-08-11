import { beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('../ipc/ui', () => ({ sendToTrustedUIRenderer: vi.fn() }))

import { WhatsAppFastResponseHost } from './compact-host'

const sender = { id: 1, isDestroyed: () => false, send: vi.fn() }
const store = {
  getUI: vi.fn(() => ({ floatingWorkspaceApps: {} })),
  updateUI: vi.fn(),
  onUIChanged: vi.fn(() => () => {})
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

describe('WhatsAppFastResponseHost navigation', () => {
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
  it('reconciles one finished main-frame revision after a stale application resolves', async () => {
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
    await vi.waitFor(() => expect(mocks.webContents.insertCSS).toHaveBeenCalledTimes(1))
    start?.({}, 'https://web.whatsapp.com/', false, true)
    finish?.()
    resolveCss?.('stale-css-key')
    await vi.waitFor(() =>
      expect(mocks.webContents.removeInsertedCSS).toHaveBeenCalledWith('stale-css-key')
    )
    await vi.waitFor(() => expect(mocks.webContents.insertCSS).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true }))
    expect(sender.send.mock.calls.map(([, state]) => state.state)).toEqual(['loading', 'ready'])
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mocks.webContents.insertCSS).toHaveBeenCalledTimes(2)
  })
  it('keeps a ready adapter through same-document main-frame navigation', async () => {
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
    mocks.webContents.removeInsertedCSS.mockClear()
    start?.({}, 'https://web.whatsapp.com/#state', true, true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(host.snapshot()).toMatchObject({ loaded: true })
    expect(mocks.webContents.removeInsertedCSS).not.toHaveBeenCalled()
    expect(mocks.webContents.insertCSS).toHaveBeenCalledTimes(1)
  })
  it('ignores a subframe load failure', async () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const fail = mocks.webContents.on.mock.calls.find(([event]) => event === 'did-fail-load')?.[1]
    fail?.({}, -2, 'failed', 'https://web.whatsapp.com/frame', false)
    await vi.waitFor(() => expect(sender.send.mock.calls.at(-1)?.[1].state).toBe('ready'))
  })
  it('keeps loading through a cancelled main-frame navigation until its replacement is ready', async () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const start = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-start-navigation'
    )?.[1]
    const fail = mocks.webContents.on.mock.calls.find(([event]) => event === 'did-fail-load')?.[1]
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    start?.({}, 'https://web.whatsapp.com/redirect', false, true)
    fail?.({}, -3, 'ERR_ABORTED', 'https://web.whatsapp.com/redirect', true)
    expect(sender.send.mock.calls.map(([, state]) => state.state)).toEqual(['loading'])
    finish?.()
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true }))
    expect(sender.send.mock.calls.map(([, state]) => state.state)).toEqual(['loading', 'ready'])
  })
  it('publishes a recoverable error for a real main-frame load failure', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const fail = mocks.webContents.on.mock.calls.find(([event]) => event === 'did-fail-load')?.[1]
    fail?.({}, -2, 'ERR_FAILED', 'https://web.whatsapp.com/', true)
    expect(host.snapshot()).toMatchObject({ loaded: false, crashed: false })
    expect(sender.send.mock.calls.at(-1)?.[1]).toMatchObject({ state: 'error', recoverable: true })
  })
  it('ignores an initial load rejection after a newer main-frame navigation', async () => {
    let rejectLoad: ((reason?: unknown) => void) | undefined
    mocks.webContents.loadURL.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectLoad = reject
        })
    )
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const start = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-start-navigation'
    )?.[1]
    start?.({}, 'https://web.whatsapp.com/', false, true)
    start?.({}, 'https://web.whatsapp.com/chats', false, true)
    rejectLoad?.(new Error('stale'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sender.send.mock.calls.map(([, state]) => state.state)).toEqual(['loading'])
  })
  it('ignores a cancelled initial load rejection after a newer main-frame navigation', async () => {
    let rejectLoad: ((reason?: unknown) => void) | undefined
    mocks.webContents.loadURL.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectLoad = reject
        })
    )
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const start = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-start-navigation'
    )?.[1]
    start?.({}, 'https://web.whatsapp.com/redirect', false, true)
    start?.({}, 'https://web.whatsapp.com/chats', false, true)
    rejectLoad?.(Object.assign(new Error('ERR_ABORTED (-3)'), { code: 'ERR_ABORTED', errno: -3 }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(sender.send.mock.calls.map(([, state]) => state.state)).toEqual(['loading'])
  })
  it('ignores an initial load fulfillment after a newer main-frame navigation', async () => {
    let resolveLoad: (() => void) | undefined
    mocks.webContents.loadURL.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveLoad = resolve
        })
    )
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const start = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-start-navigation'
    )?.[1]
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    start?.({}, 'https://web.whatsapp.com/', false, true)
    start?.({}, 'https://web.whatsapp.com/chats', false, true)
    resolveLoad?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mocks.webContents.insertCSS).not.toHaveBeenCalled()
    finish?.()
    await vi.waitFor(() => expect(mocks.webContents.insertCSS).toHaveBeenCalledTimes(1))
  })
  it('waits for a new finish before retrying an adapter failure', async () => {
    mocks.webContents.insertCSS.mockRejectedValueOnce(new Error('adapter failed'))
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    finish?.()
    await vi.waitFor(() => expect(sender.send.mock.calls.at(-1)?.[1].state).toBe('error'))
    host.attach(sender as never, request)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mocks.webContents.insertCSS).toHaveBeenCalledTimes(1)
    finish?.()
    await vi.waitFor(() => expect(mocks.webContents.insertCSS).toHaveBeenCalledTimes(2))
  })
  it('reconciles the initial load when finish-load is late', async () => {
    let resolveLoad: (() => void) | undefined
    mocks.webContents.loadURL.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveLoad = resolve
        })
    )
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    expect(mocks.webContents.insertCSS).not.toHaveBeenCalled()
    resolveLoad?.()
    await vi.waitFor(() => expect(mocks.webContents.insertCSS).toHaveBeenCalledTimes(1))
    await vi.waitFor(() =>
      expect(mocks.webContents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledTimes(1)
    )
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true }))
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    finish?.()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mocks.webContents.insertCSS).toHaveBeenCalledTimes(1)
    expect(sender.send.mock.calls.map(([, state]) => state.state)).toEqual(['loading', 'ready'])
  })
})
