import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mocks, request, resetCompactHostFixture, sender, store } from './compact-host-test-fixture'

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

describe('WhatsAppFastResponseHost adapter', () => {
  beforeEach(() => {
    resetCompactHostFixture()
  })
  it('waits for browser navigation to finish before adapting a returning compact owner', async () => {
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

    start?.({}, 'https://web.whatsapp.com/', false, true)
    host.attach(sender as never, { ...request, requestId: 2, surfaceId: 2 })

    expect(host.snapshot()).toMatchObject({ contentMode: 'loading', loaded: false })
    expect(mocks.webContents.insertCSS).toHaveBeenCalledOnce()
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(false)

    finish?.()
    await vi.waitFor(() => expect(mocks.webContents.insertCSS).toHaveBeenCalledTimes(2))
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ contentMode: 'qr', loaded: true, visible: true })
    )
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
  it('keeps the guest hidden until the adapter is applied', async () => {
    const host = new WhatsAppFastResponseHost(store as never)
    const ownerWindow = mocks.windows.get(sender.id)!
    host.attach(sender as never, request)
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(false)
    expect(ownerWindow.contentView.addChildView).toHaveBeenCalledWith(mocks.view)
    expect(mocks.view.setVisible.mock.invocationCallOrder[0]).toBeLessThan(
      ownerWindow.contentView.addChildView.mock.invocationCallOrder[0]!
    )
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    finish?.()
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true }))
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(true)
    expect(
      mocks.webContents.executeJavaScriptInIsolatedWorld.mock.invocationCallOrder[0]
    ).toBeLessThan(mocks.view.setVisible.mock.invocationCallOrder.at(-1)!)
  })
  it('keeps a failed adapter guest hidden and publishes a recoverable error', async () => {
    mocks.webContents.executeJavaScriptInIsolatedWorld.mockRejectedValueOnce(
      new Error('adapter failed')
    )
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    finish?.()
    await vi.waitFor(() =>
      expect(sender.send.mock.calls.map(([, state]) => state.state)).toEqual(['loading', 'error'])
    )
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(false)
    expect(mocks.webContents.close).not.toHaveBeenCalled()
    host.attach(sender as never, request)
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true }))
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(true)
    expect(mocks.WebContentsView).toHaveBeenCalledTimes(1)
    expect(mocks.webContents.loadURL).toHaveBeenCalledTimes(1)
    expect(sender.send.mock.calls.map(([, state]) => state.state)).toEqual([
      'loading',
      'error',
      'loading',
      'ready'
    ])
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
