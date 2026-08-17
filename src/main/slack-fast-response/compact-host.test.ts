import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const windows = new Map<number, Record<string, unknown>>()
  const webContents = {
    getURL: vi.fn(() => 'https://app.slack.com/workspace-signin'),
    isDestroyed: vi.fn(() => false),
    setWindowOpenHandler: vi.fn(),
    on: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    executeJavaScriptInIsolatedWorld: vi.fn(
      (_worldId: number, scripts: readonly { code: string }[]) =>
        Promise.resolve(scripts[0]?.code === 'document.readyState' ? 'complete' : true)
    ),
    insertCSS: vi.fn(() => Promise.resolve('css-key')),
    removeInsertedCSS: vi.fn(() => Promise.resolve()),
    close: vi.fn()
  }
  return {
    windows,
    webContents,
    view: { setBounds: vi.fn(), setVisible: vi.fn(), webContents },
    WebContentsView: vi.fn(function () {
      return mocks.view
    }),
    resolveKnownPartition: vi.fn(() => 'persist:slack'),
    createProfile: vi.fn(() => ({ id: 'profile-slack', partition: 'persist:slack' }))
  }
})

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: (sender: { id: number }) => mocks.windows.get(sender.id) ?? null
  },
  WebContentsView: mocks.WebContentsView
}))
vi.mock('../browser/browser-session-registry', () => ({
  browserSessionRegistry: {
    resolveKnownPartition: mocks.resolveKnownPartition,
    createProfile: mocks.createProfile
  }
}))

import { SlackFastResponseHost } from './compact-host'

const sender = { id: 1, isDestroyed: () => false, send: vi.fn() }
const store = { getUI: vi.fn(() => ({ floatingWorkspaceApps: {} })), updateUI: vi.fn() }
const attached = {
  appId: 'slack' as const,
  target: 'attached' as const,
  requestId: 1,
  surfaceId: 1,
  mode: 'attached-native' as const,
  rectCss: { x: 1, y: 2, width: 300, height: 400 },
  rendererZoomFactor: 1
}

function createWindow() {
  return {
    isDestroyed: () => false,
    once: vi.fn(),
    removeListener: vi.fn(),
    getContentBounds: () => ({ x: 0, y: 0, width: 500, height: 600 }),
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }
  }
}

describe('SlackFastResponseHost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.windows.clear()
    mocks.windows.set(sender.id, createWindow())
  })

  it('reuses one view through queued reattachment without another load', async () => {
    const host = new SlackFastResponseHost(store as never)
    const firstWindow = mocks.windows.get(sender.id) as ReturnType<typeof createWindow>
    const dockSender = { id: 2, isDestroyed: () => false, send: vi.fn() }
    const dockWindow = createWindow()
    mocks.windows.set(dockSender.id, dockWindow)

    await Promise.all([
      host.attach(sender as never, attached),
      host.attach(dockSender as never, {
        appId: 'slack',
        target: 'dock',
        generation: 2,
        revision: 3,
        tabId: 'tab',
        activeLeafAppId: 'slack',
        rectCss: attached.rectCss,
        rendererZoomFactor: 1
      })
    ])

    expect(mocks.WebContentsView).toHaveBeenCalledOnce()
    expect(mocks.webContents.loadURL).toHaveBeenCalledOnce()
    expect(firstWindow.contentView.removeChildView).toHaveBeenCalledWith(mocks.view)
    expect(dockWindow.contentView.addChildView).toHaveBeenCalledWith(mocks.view)
    expect(host.snapshot()).toMatchObject({ attached: true, visible: true })
  })

  it('reconciles a ready login document when its load completed before attachment', async () => {
    const host = new SlackFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ loaded: true, contentMode: 'login' })
    )
  })

  it('detaches a destroyed owner and closes the guest only during shutdown', async () => {
    const host = new SlackFastResponseHost(store as never)
    const window = mocks.windows.get(sender.id) as ReturnType<typeof createWindow>
    await host.attach(sender as never, attached)
    const closed = (window.once as ReturnType<typeof vi.fn>).mock.calls.find(
      ([event]) => event === 'closed'
    )?.[1]
    if (typeof closed !== 'function') {
      throw new Error('owner closed listener missing')
    }
    closed()
    expect(host.snapshot()).toMatchObject({ attached: false, visible: false })
    expect(mocks.webContents.close).not.toHaveBeenCalled()

    host.shutdown()
    await vi.waitFor(() => expect(mocks.webContents.close).toHaveBeenCalledOnce())
    expect(host.snapshot()).toMatchObject({ attached: false, visible: false, loaded: false })
  })

  it('rejects stale owner updates and ignores an outdated load completion after shutdown', async () => {
    const host = new SlackFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    expect(() =>
      host.show({ id: 2 } as never, {
        appId: 'slack',
        target: 'attached',
        requestId: 1,
        surfaceId: 1,
        mode: 'attached-native'
      })
    ).toThrow('slack_fast_response_stale')

    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    host.shutdown()
    finish?.()
    await Promise.resolve()
    expect(host.snapshot()).toMatchObject({ loaded: false, contentMode: 'loading' })
  })

  it('removes stale CSS after a navigation supersedes an adapter application', async () => {
    const host = new SlackFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ loaded: true, contentMode: 'login' })
    )
    mocks.webContents.getURL.mockReturnValue('https://app.slack.com/client/T/C')
    mocks.webContents.insertCSS
      .mockResolvedValueOnce('stale-css')
      .mockResolvedValueOnce('current-css')
    const pending: ((mode: string) => void)[] = []
    mocks.webContents.executeJavaScriptInIsolatedWorld.mockImplementation(
      (_worldId: number, scripts: readonly { code: string }[]) => {
        if (scripts[0]?.code === 'document.readyState') {
          return Promise.resolve('complete')
        }
        return new Promise<string>((resolve) => pending.push(resolve))
      }
    )
    const internals = host as unknown as { finishLoad(view: typeof mocks.view): Promise<void> }
    const first = internals.finishLoad(mocks.view)
    await Promise.resolve()
    const navigation = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-start-navigation'
    )?.[1]
    navigation?.({}, 'https://app.slack.com/client/T/C', false, true)
    const second = internals.finishLoad(mocks.view)
    pending.shift()?.('conversation')
    await Promise.resolve()
    pending.shift()?.('conversation')
    await Promise.all([first, second])
    expect(mocks.webContents.removeInsertedCSS).toHaveBeenCalledWith('stale-css')
    expect(host.snapshot()).toMatchObject({ loaded: true, contentMode: 'compact' })
  })

  it('retries a hydrated unsupported document on update while visible', async () => {
    mocks.webContents.getURL.mockReturnValue('https://app.slack.com/workspace-signin')
    mocks.webContents.executeJavaScriptInIsolatedWorld.mockImplementation(
      (_worldId: number, scripts: readonly { code: string }[]) =>
        Promise.resolve(scripts[0]?.code === 'document.readyState' ? 'complete' : true)
    )
    const host = new SlackFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ loaded: true, contentMode: 'login' })
    )
    Object.assign(host, { loaded: true, contentMode: 'unsupported' })
    mocks.webContents.getURL.mockReturnValue('https://app.slack.com/client/T/C')
    mocks.webContents.executeJavaScriptInIsolatedWorld.mockImplementation(
      (_worldId: number, scripts: readonly { code: string }[]) =>
        Promise.resolve(scripts[0]?.code === 'document.readyState' ? 'complete' : 'conversation')
    )

    expect(host.update(sender as never, attached)).toMatchObject({ loaded: false, visible: true })
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(true)
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ loaded: true, contentMode: 'compact', visible: true })
    )
  })

  it('keeps a dismissed owner hidden through a stale update and reopens through attach', async () => {
    const host = new SlackFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    expect(host.hide(sender as never, attached)).toMatchObject({ visible: false })

    expect(host.update(sender as never, attached)).toMatchObject({ visible: false })
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(false)

    await host.attach(sender as never, { ...attached, requestId: 2, surfaceId: 2 })
    expect(host.snapshot()).toMatchObject({ attached: true, visible: true })
    expect(mocks.WebContentsView).toHaveBeenCalledOnce()
    expect(mocks.webContents.loadURL).toHaveBeenCalledOnce()
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(true)
  })
})
