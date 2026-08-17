import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const windows = new Map<number, Record<string, unknown>>()
  const webContents = {
    getURL: vi.fn(() => 'https://discord.com/app'),
    isDestroyed: vi.fn(() => false),
    setWindowOpenHandler: vi.fn(),
    on: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    canGoBack: vi.fn(() => true),
    goBack: vi.fn(),
    executeJavaScriptInIsolatedWorld: vi.fn(
      (_worldId: number, scripts: readonly { code: string }[]) =>
        Promise.resolve(
          scripts[0]?.code === 'document.readyState'
            ? 'complete'
            : scripts[0]?.code.includes('.navigate(')
              ? 'clicked'
              : 'installed'
        )
    ),
    send: vi.fn(),
    close: vi.fn()
  }
  return {
    windows,
    webContents,
    view: { setBounds: vi.fn(), setVisible: vi.fn(), webContents },
    WebContentsView: vi.fn(function () {
      return mocks.view
    }),
    acquireSandboxPreloadPath: vi.fn(() => ({
      path: `C:\\out\\sandbox-preload\\generations\\${'a'.repeat(64)}\\discord-web-fast-response-preload.js`,
      release: vi.fn()
    })),
    resolveKnownPartition: vi.fn(() => 'persist:discord'),
    createProfile: vi.fn(() => ({ id: 'profile-discord', partition: 'persist:discord' })),
    listProfiles: vi.fn(() => [
      {
        id: 'profile-discord',
        partition: 'persist:discord',
        scope: 'isolated',
        label: 'Discord',
        source: null
      }
    ]),
    voiceSnapshot: { connection: 'connected' as 'connected' | 'disconnected' },
    selectVoiceChannel: vi.fn(() => Promise.resolve()),
    recordSelectionFailure: vi.fn(),
    voiceListeners: new Set<() => void>()
  }
})

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: (sender: { id: number }) => mocks.windows.get(sender.id) ?? null
  },
  WebContentsView: mocks.WebContentsView
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('../sandbox-preload-path', () => ({
  acquireSandboxPreloadPath: mocks.acquireSandboxPreloadPath
}))
vi.mock('../browser/browser-session-registry', () => ({
  browserSessionRegistry: {
    resolveKnownPartition: mocks.resolveKnownPartition,
    createProfile: mocks.createProfile,
    listProfiles: mocks.listProfiles
  }
}))
vi.mock('../messaging/discord-voice-service', () => ({
  getDiscordVoiceSnapshot: () => mocks.voiceSnapshot,
  onDiscordVoiceSnapshotChanged: (listener: () => void) => {
    mocks.voiceListeners.add(listener)
    return () => mocks.voiceListeners.delete(listener)
  },
  recordDiscordVoiceSelectionFailure: mocks.recordSelectionFailure,
  selectDiscordVoiceChannel: mocks.selectVoiceChannel
}))

import { DiscordWebFastResponseHost } from './compact-host'
import type { DiscordWebCompactNavigation } from '../../shared/discord-web-fast-response'

const sender = { id: 1, isDestroyed: () => false, send: vi.fn() }
const store = { getUI: vi.fn(() => ({ floatingWorkspaceApps: {} })), updateUI: vi.fn() }
const attached = {
  appId: 'discord' as const,
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

function compactIntent(intent: DiscordWebCompactNavigation) {
  const availability = mocks.webContents.send.mock.calls.findLast(
    ([channel, state]) =>
      channel === 'discordWebFastResponse:compactAvailability' && state.available
  )?.[1]
  if (!availability) {
    throw new Error('compact intent availability was not published')
  }
  return { revision: availability.revision, intent }
}

function emitInPageNavigation(url: string): void {
  mocks.webContents.getURL.mockReturnValue(url)
  const handler = mocks.webContents.on.mock.calls.findLast(
    ([event]) => event === 'did-navigate-in-page'
  )?.[1] as ((event: object, url: string, isMainFrame: boolean) => void) | undefined
  if (!handler) {
    throw new Error('did-navigate-in-page handler was not registered')
  }
  handler({}, url, true)
}

describe('DiscordWebFastResponseHost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.webContents.getURL.mockReset()
    mocks.webContents.getURL.mockReturnValue('https://discord.com/app')
    mocks.webContents.executeJavaScriptInIsolatedWorld.mockReset()
    mocks.webContents.executeJavaScriptInIsolatedWorld.mockImplementation(
      (_worldId: number, scripts: readonly { code: string }[]) =>
        Promise.resolve(
          scripts[0]?.code === 'document.readyState'
            ? 'complete'
            : scripts[0]?.code.includes('.navigate(')
              ? 'clicked'
              : 'installed'
        )
    )
    mocks.webContents.canGoBack.mockReset()
    mocks.webContents.canGoBack.mockReturnValue(true)
    mocks.webContents.goBack.mockReset()
    mocks.windows.clear()
    mocks.voiceSnapshot = { connection: 'connected' }
    mocks.voiceListeners.clear()
    mocks.windows.set(sender.id, createWindow())
  })

  it('reuses one session while reparenting between owners', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    const attachedWindow = mocks.windows.get(sender.id) as ReturnType<typeof createWindow>
    const dockSender = { id: 2, isDestroyed: () => false, send: vi.fn() }
    const dockWindow = createWindow()
    mocks.windows.set(dockSender.id, dockWindow)

    await host.attach(sender as never, attached)
    await host.attach(dockSender as never, {
      appId: 'discord',
      target: 'dock',
      generation: 2,
      revision: 3,
      tabId: 'tab',
      activeLeafAppId: 'discord',
      rectCss: attached.rectCss,
      rendererZoomFactor: 1
    })

    expect(mocks.WebContentsView).toHaveBeenCalledOnce()
    expect(mocks.webContents.loadURL).toHaveBeenCalledOnce()
    expect(attachedWindow.contentView.removeChildView).toHaveBeenCalledWith(mocks.view)
    expect(dockWindow.contentView.addChildView).toHaveBeenCalledWith(mocks.view)
    expect(host.snapshot()).toMatchObject({ attached: true, visible: true })
  })

  it('authorizes only the current singleton sender and availability revision', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    const didFinishLoad = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    didFinishLoad?.()
    await vi.waitFor(() =>
      expect(mocks.webContents.send).toHaveBeenCalledWith(
        'discordWebFastResponse:voiceAvailability',
        expect.objectContaining({ available: true })
      )
    )
    const availability = mocks.webContents.send.mock.calls.findLast(
      ([channel]) => channel === 'discordWebFastResponse:voiceAvailability'
    )?.[1]
    if (!availability) {
      throw new Error('voice availability was not published')
    }

    await expect(
      host.selectVoiceChannel(mocks.webContents as never, {
        revision: availability.revision,
        channelId: '12345678901234567'
      })
    ).resolves.toBeUndefined()
    await expect(
      host.selectVoiceChannel({ id: 99 } as never, {
        revision: availability.revision,
        channelId: '12345678901234567'
      })
    ).rejects.toThrow('discord_web_voice_selection_denied')
    await expect(
      host.selectVoiceChannel(mocks.webContents as never, {
        revision: availability.revision - 1,
        channelId: '12345678901234567'
      })
    ).rejects.toThrow('discord_web_voice_selection_stale')
    expect(mocks.recordSelectionFailure).toHaveBeenCalledWith('12345678901234567')
  })

  it('disables selection before hide and when the local RPC disconnects', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    const didFinishLoad = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    didFinishLoad?.()
    await vi.waitFor(() =>
      expect(mocks.webContents.send).toHaveBeenCalledWith(
        'discordWebFastResponse:voiceAvailability',
        expect.objectContaining({ available: true })
      )
    )

    await host.hide(sender as never, attached)
    expect(mocks.webContents.send).toHaveBeenCalledWith(
      'discordWebFastResponse:voiceAvailability',
      expect.objectContaining({ available: false })
    )

    await host.show(sender as never, attached)
    mocks.voiceSnapshot = { connection: 'disconnected' }
    for (const listener of mocks.voiceListeners) {
      listener()
    }
    expect(mocks.webContents.send).toHaveBeenLastCalledWith(
      'discordWebFastResponse:voiceAvailability',
      expect.objectContaining({ available: false })
    )
  })

  it('keeps update bounds hidden until show is explicit', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await expect(host.hide(sender as never, attached)).resolves.toMatchObject({ visible: false })

    expect(
      host.update(sender as never, { ...attached, rectCss: { ...attached.rectCss, width: 320 } })
    ).toMatchObject({ visible: false })
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(false)

    await expect(host.show(sender as never, attached)).resolves.toMatchObject({ visible: true })
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(true)
  })

  it('rejects stale owners and destroys the guest only on shutdown', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    expect(() => host.show({ id: 2 } as never, attached)).toThrow('discord_web_fast_response_stale')
    host.shutdown()
    await vi.waitFor(() => expect(mocks.webContents.close).toHaveBeenCalledOnce())
    expect(host.snapshot()).toMatchObject({ attached: false, loaded: false, visible: false })
  })

  it('discards a crashed guest and loads one replacement on explicit reattach', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    const crashed = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'render-process-gone'
    )?.[1]
    crashed?.()
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ attached: false, crashed: true, visible: false })
    )

    await host.attach(sender as never, attached)
    expect(mocks.WebContentsView).toHaveBeenCalledTimes(2)
    expect(mocks.webContents.loadURL).toHaveBeenCalledTimes(2)
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true, crashed: false }))
  })

  it('drops a deferred ready-state completion after navigation starts', async () => {
    const deferred: { resolve?: (state: string) => void } = {}
    mocks.webContents.executeJavaScriptInIsolatedWorld.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          deferred.resolve = resolve
        })
    )
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await Promise.resolve()
    const navigation = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-start-navigation'
    )?.[1]
    navigation?.({}, 'https://discord.com/channels/@me', false, true)
    if (!deferred.resolve) {
      throw new Error('ready_state_probe_missing')
    }
    deferred.resolve('complete')
    await Promise.resolve()

    expect(host.snapshot()).toMatchObject({ loaded: false, contentMode: 'loading' })
  })

  it('cancels pending adapter hydration before hiding without publishing unsupported', async () => {
    let resolveAdapter: ((state: string) => void) | undefined
    mocks.webContents.executeJavaScriptInIsolatedWorld.mockImplementation(
      (_worldId: number, scripts: readonly { code: string }[]) => {
        const code = scripts[0]?.code
        if (code === 'document.readyState') {
          return Promise.resolve('complete')
        }
        if (code === 'window.__orcaDiscordFastResponseCleanup?.()') {
          resolveAdapter?.('unsupported')
          return Promise.resolve('unsupported')
        }
        if (code?.startsWith('window.__orcaDiscordFastResponse.setMode')) {
          return Promise.resolve('installed')
        }
        return new Promise<string>((resolve) => {
          resolveAdapter = resolve
        })
      }
    )
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await vi.waitFor(() => expect(resolveAdapter).toBeTypeOf('function'))
    sender.send.mockClear()

    await expect(host.hide(sender as never, attached)).resolves.toMatchObject({
      loaded: false,
      visible: false
    })

    expect(mocks.webContents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(
      999,
      [{ code: 'window.__orcaDiscordFastResponseCleanup?.()' }],
      false
    )
    expect(
      sender.send.mock.calls.filter(
        ([channel, state]) =>
          channel === 'discordWebFastResponse:stateChanged' && state.state === 'unsupported'
      )
    ).toHaveLength(0)
  })

  it('cancels pending adapter hydration when main-frame navigation starts', async () => {
    let resolveAdapter: ((state: string) => void) | undefined
    mocks.webContents.executeJavaScriptInIsolatedWorld.mockImplementation(
      (_worldId: number, scripts: readonly { code: string }[]) => {
        const code = scripts[0]?.code
        if (code === 'document.readyState') {
          return Promise.resolve('complete')
        }
        if (code === 'window.__orcaDiscordFastResponseCleanup?.()') {
          resolveAdapter?.('unsupported')
          return Promise.resolve('unsupported')
        }
        if (code?.startsWith('window.__orcaDiscordFastResponse.setMode')) {
          return Promise.resolve('installed')
        }
        return new Promise<string>((resolve) => {
          resolveAdapter = resolve
        })
      }
    )
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await vi.waitFor(() => expect(resolveAdapter).toBeTypeOf('function'))
    sender.send.mockClear()
    const navigation = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-start-navigation'
    )?.[1]

    navigation?.({}, 'https://discord.com/channels/@me', false, true)

    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ loaded: false, contentMode: 'loading' })
    )
    expect(mocks.webContents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(
      999,
      [{ code: 'window.__orcaDiscordFastResponseCleanup?.()' }],
      false
    )
    expect(
      sender.send.mock.calls.filter(
        ([channel, state]) =>
          channel === 'discordWebFastResponse:stateChanged' && state.state === 'unsupported'
      )
    ).toHaveLength(0)
  })

  it('keeps the host authoritative through server, channel, dedicated and back transitions', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ loaded: true, contentMode: 'ready' })
    )

    expect(host.getCompactMode()).toEqual({ kind: 'manager', tab: 'servers' })
    expect(mocks.webContents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(
      999,
      expect.arrayContaining([
        expect.objectContaining({ code: expect.stringContaining('orcaDiscordFastResponse') })
      ]),
      false
    )
    await expect(
      host.handleCompactIntent(
        mocks.webContents as never,
        compactIntent({
          kind: 'select-server',
          serverId: '12345678901234567',
          serverName: 'EGB'
        })
      )
    ).resolves.toBe('installed')
    expect(host.getCompactMode()).toEqual({
      kind: 'server-channels',
      serverId: '12345678901234567',
      serverName: 'EGB'
    })

    await expect(
      host.handleCompactIntent(
        mocks.webContents as never,
        compactIntent({
          kind: 'open-text-channel',
          serverId: '12345678901234567',
          serverName: 'EGB',
          channelId: '22345678901234567',
          channelName: 'roadmap'
        })
      )
    ).resolves.toBe('installed')
    expect(host.getCompactMode()).toEqual({
      kind: 'dedicated',
      source: {
        kind: 'server-channel',
        serverId: '12345678901234567',
        serverName: 'EGB',
        channelId: '22345678901234567',
        channelName: 'roadmap'
      }
    })
    expect(mocks.webContents.executeJavaScriptInIsolatedWorld).toHaveBeenLastCalledWith(
      999,
      [{ code: expect.stringContaining('"kind":"dedicated"') }],
      false
    )

    await host.handleCompactIntent(mocks.webContents as never, compactIntent({ kind: 'back' }))
    expect(host.getCompactMode()).toEqual({
      kind: 'server-channels',
      serverId: '12345678901234567',
      serverName: 'EGB'
    })
    await host.handleCompactIntent(mocks.webContents as never, compactIntent({ kind: 'back' }))
    expect(host.getCompactMode()).toEqual({ kind: 'manager', tab: 'servers' })
    expect(sender.send).toHaveBeenCalledWith('discordWebFastResponse:compactModeChanged', {
      canClose: false,
      mode: { kind: 'manager', tab: 'servers' }
    })
  })

  it('denies a compact tab intent with a stale availability revision', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ loaded: true, contentMode: 'ready' })
    )
    const current = compactIntent({ kind: 'select-manager-tab', tab: 'messages' })

    await expect(
      host.handleCompactIntent(mocks.webContents as never, {
        ...current,
        revision: current.revision - 1
      })
    ).rejects.toThrow('discord_web_compact_intent_denied')
  })

  it('enters native Home once for Messages and keeps internal tab changes in place', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ loaded: true, contentMode: 'ready' })
    )
    mocks.webContents.getURL.mockReturnValue(
      'https://discord.com/channels/12345678901234567/22345678901234567'
    )
    await host.setCompactMode({
      kind: 'server-channels',
      serverId: '12345678901234567',
      serverName: 'EGB'
    })
    await host.toggleCompactHub()
    mocks.webContents.loadURL.mockClear()
    await expect(
      host.handleCompactIntent(
        mocks.webContents as never,
        compactIntent({ kind: 'select-manager-tab', tab: 'messages' })
      )
    ).resolves.toBe('navigating')
    expect(
      mocks.webContents.executeJavaScriptInIsolatedWorld.mock.calls.filter(([, scripts]) =>
        scripts[0]?.code.includes('"kind":"open-home"')
      )
    ).toHaveLength(1)
    expect(host.getCompactMode()).toEqual({ kind: 'manager', tab: 'messages' })
    expect(host.canCloseCompactHub()).toBe(false)

    emitInPageNavigation('https://discord.com/channels/@me')
    await vi.waitFor(() => expect(host.canCloseCompactHub()).toBe(true))
    expect(host.getCompactMode()).toEqual({ kind: 'manager', tab: 'messages' })

    await host.handleCompactIntent(
      mocks.webContents as never,
      compactIntent({ kind: 'select-manager-tab', tab: 'friends' })
    )
    await host.handleCompactIntent(
      mocks.webContents as never,
      compactIntent({ kind: 'select-manager-tab', tab: 'messages' })
    )
    expect(
      mocks.webContents.executeJavaScriptInIsolatedWorld.mock.calls.filter(([, scripts]) =>
        scripts[0]?.code.includes('"kind":"open-home"')
      )
    ).toHaveLength(1)
    expect(mocks.webContents.loadURL).not.toHaveBeenCalled()
  })

  it('restores the exact server mode only after the confirmed in-page return', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    const serverUrl = 'https://discord.com/channels/12345678901234567/22345678901234567'
    await host.attach(sender as never, attached)
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ contentMode: 'ready' }))
    mocks.webContents.getURL.mockReturnValue(serverUrl)
    const server = {
      kind: 'server-channels',
      serverId: '12345678901234567',
      serverName: 'EGB'
    } as const
    await host.setCompactMode(server)
    await host.toggleCompactHub()
    await host.handleCompactIntent(
      mocks.webContents as never,
      compactIntent({ kind: 'select-manager-tab', tab: 'messages' })
    )
    emitInPageNavigation('https://discord.com/channels/@me')
    await vi.waitFor(() => expect(host.canCloseCompactHub()).toBe(true))

    await expect(host.toggleCompactHub()).resolves.toBe('navigating')
    expect(mocks.webContents.goBack).toHaveBeenCalledOnce()
    expect(host.getCompactMode()).toEqual({ kind: 'manager', tab: 'messages' })
    expect(host.canCloseCompactHub()).toBe(false)

    emitInPageNavigation(serverUrl)
    await vi.waitFor(() => expect(host.getCompactMode()).toEqual(server))
    expect(host.canCloseCompactHub()).toBe(false)
    expect(mocks.webContents.loadURL).toHaveBeenCalledOnce()
  })

  it('captures a compact return mode once and restores exact server and dedicated states', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ contentMode: 'ready' }))
    const server = {
      kind: 'server-channels',
      serverId: '12345678901234567',
      serverName: 'EGB'
    } as const
    await host.setCompactMode(server)
    await host.toggleCompactHub()
    await host.handleCompactIntent(
      mocks.webContents as never,
      compactIntent({
        kind: 'select-manager-tab',
        tab: 'friends'
      })
    )
    expect(host.canCloseCompactHub()).toBe(true)
    await host.toggleCompactHub()
    expect(host.getCompactMode()).toEqual(server)

    const dedicated = {
      kind: 'dedicated',
      source: {
        kind: 'server-channel',
        serverId: '12345678901234567',
        serverName: 'EGB',
        channelId: '22345678901234567',
        channelName: 'roadmap'
      }
    } as const
    await host.setCompactMode(dedicated)
    await host.toggleCompactHub()
    await host.toggleCompactHub()
    expect(host.getCompactMode()).toEqual(dedicated)
  })

  it('does not close an initial manager without a captured return mode', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ contentMode: 'ready' }))
    expect(host.canCloseCompactHub()).toBe(false)
    await host.toggleCompactHub()
    expect(host.getCompactMode()).toEqual({ kind: 'manager', tab: 'servers' })
  })

  it('keeps Friends self-made without exposing Discord Home', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ loaded: true, contentMode: 'ready' })
    )
    mocks.webContents.getURL.mockReturnValue(
      'https://discord.com/channels/12345678901234567/22345678901234567'
    )
    mocks.webContents.loadURL.mockClear()

    await expect(host.setCompactMode({ kind: 'manager', tab: 'friends' })).resolves.toBe(
      'installed'
    )
    expect(host.getCompactMode()).toEqual({ kind: 'manager', tab: 'friends' })
    expect(mocks.webContents.loadURL).not.toHaveBeenCalled()
  })

  it('opens a direct message only after its exact in-page route is confirmed', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ loaded: true, contentMode: 'ready' })
    )

    mocks.webContents.getURL.mockReturnValue(
      'https://discord.com/channels/12345678901234567/22345678901234567'
    )
    await host.setCompactMode({
      kind: 'server-channels',
      serverId: '12345678901234567',
      serverName: 'EGB'
    })
    await host.toggleCompactHub()
    await host.handleCompactIntent(
      mocks.webContents as never,
      compactIntent({ kind: 'select-manager-tab', tab: 'messages' })
    )
    emitInPageNavigation('https://discord.com/channels/@me')
    await vi.waitFor(() => expect(host.canCloseCompactHub()).toBe(true))

    await expect(
      host.handleCompactIntent(
        mocks.webContents as never,
        compactIntent({
          kind: 'open-direct-message',
          href: '/channels/@me/22345678901234567',
          name: 'Brenno'
        })
      )
    ).resolves.toBe('navigating')
    expect(host.getCompactMode()).toEqual({ kind: 'manager', tab: 'messages' })
    expect(host.canCloseCompactHub()).toBe(false)

    emitInPageNavigation('https://discord.com/channels/@me/22345678901234567')
    await vi.waitFor(() =>
      expect(host.getCompactMode()).toEqual({
        kind: 'dedicated',
        source: {
          kind: 'direct-message',
          href: '/channels/@me/22345678901234567',
          name: 'Brenno'
        }
      })
    )
    expect(host.canCloseCompactHub()).toBe(false)
    await host.handleCompactIntent(mocks.webContents as never, compactIntent({ kind: 'back' }))
    expect(host.getCompactMode()).toEqual({ kind: 'manager', tab: 'messages' })
    await expect(
      host.handleCompactIntent({ id: 99 } as never, compactIntent({ kind: 'back' }))
    ).rejects.toThrow('discord_web_compact_intent_denied')
  })

  it('clears a pending return on unexpected in-page navigation', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ contentMode: 'ready' }))
    mocks.webContents.getURL.mockReturnValue(
      'https://discord.com/channels/12345678901234567/22345678901234567'
    )
    await host.setCompactMode({
      kind: 'server-channels',
      serverId: '12345678901234567',
      serverName: 'EGB'
    })
    await host.toggleCompactHub()
    await host.handleCompactIntent(
      mocks.webContents as never,
      compactIntent({
        kind: 'select-manager-tab',
        tab: 'messages'
      })
    )
    emitInPageNavigation('https://example.com/channels/@me')
    await vi.waitFor(() => expect(host.canCloseCompactHub()).toBe(false))
    expect(host.getCompactMode()).toEqual({ kind: 'manager', tab: 'messages' })
    expect(mocks.webContents.goBack).not.toHaveBeenCalled()
  })

  it('rejects compact intents captured before hide and reparent of the persistent guest', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ loaded: true, contentMode: 'ready' })
    )
    const beforeHide = compactIntent({ kind: 'back' })
    await host.hide(sender as never, attached)
    await expect(host.handleCompactIntent(mocks.webContents as never, beforeHide)).rejects.toThrow(
      'discord_web_compact_intent_denied'
    )

    await host.show(sender as never, attached)
    const beforeReparent = compactIntent({ kind: 'back' })
    const dockSender = { id: 2, isDestroyed: () => false, send: vi.fn() }
    mocks.windows.set(dockSender.id, createWindow())
    await host.attach(dockSender as never, {
      appId: 'discord',
      target: 'dock',
      generation: 2,
      revision: 3,
      tabId: 'tab',
      activeLeafAppId: 'discord',
      rectCss: attached.rectCss,
      rendererZoomFactor: 1
    })
    await expect(
      host.handleCompactIntent(mocks.webContents as never, beforeReparent)
    ).rejects.toThrow('discord_web_compact_intent_denied')
    await expect(
      host.handleCompactIntent(mocks.webContents as never, compactIntent({ kind: 'back' }))
    ).resolves.toBe('installed')
  })

  it('cleans the adapter before hiding and reparenting the view', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ loaded: true, contentMode: 'ready' })
    )
    mocks.webContents.executeJavaScriptInIsolatedWorld.mockClear()

    await host.hide(sender as never, attached)
    expect(mocks.webContents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(
      999,
      [{ code: 'window.__orcaDiscordFastResponseCleanup?.()' }],
      false
    )
    expect(mocks.view.setVisible).toHaveBeenLastCalledWith(false)
  })

  it('removes the adapter before detaching and before guest destruction', async () => {
    const host = new DiscordWebFastResponseHost(store as never)
    const firstWindow = mocks.windows.get(sender.id) as ReturnType<typeof createWindow>
    await host.attach(sender as never, attached)
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ loaded: true, contentMode: 'ready' })
    )
    mocks.webContents.executeJavaScriptInIsolatedWorld.mockClear()

    const dockSender = { id: 2, isDestroyed: () => false, send: vi.fn() }
    const dockWindow = createWindow()
    mocks.windows.set(dockSender.id, dockWindow)
    await host.attach(dockSender as never, {
      appId: 'discord',
      target: 'dock',
      generation: 2,
      revision: 3,
      tabId: 'tab',
      activeLeafAppId: 'discord',
      rectCss: attached.rectCss,
      rendererZoomFactor: 1
    })
    const cleanup = mocks.webContents.executeJavaScriptInIsolatedWorld.mock.calls.find(
      ([, scripts]) => scripts[0]?.code === 'window.__orcaDiscordFastResponseCleanup?.()'
    )
    expect(cleanup?.[0]).toBe(999)
    expect(
      mocks.webContents.executeJavaScriptInIsolatedWorld.mock.invocationCallOrder[0]
    ).toBeLessThan(firstWindow.contentView.removeChildView.mock.invocationCallOrder[0])

    host.shutdown()
    await vi.waitFor(() => expect(mocks.webContents.close).toHaveBeenCalledOnce())
    const invocationOrder =
      mocks.webContents.executeJavaScriptInIsolatedWorld.mock.invocationCallOrder
    const cleanupOrder = invocationOrder.at(-1)
    const closeOrder = mocks.webContents.close.mock.invocationCallOrder[0]
    expect(cleanupOrder).toBeLessThan(closeOrder)
  })

  it('does not install the compact adapter outside ready documents', async () => {
    mocks.webContents.getURL.mockReturnValue('https://discord.com/login')
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ loaded: true, contentMode: 'login' })
    )

    expect(mocks.webContents.executeJavaScriptInIsolatedWorld.mock.calls).toEqual([
      [999, [{ code: 'document.readyState' }], false]
    ])
  })

  it('publishes unsupported when a ready document cannot install the adapter', async () => {
    mocks.webContents.executeJavaScriptInIsolatedWorld.mockImplementation(
      (_worldId: number, scripts: readonly { code: string }[]) =>
        Promise.resolve(scripts[0]?.code === 'document.readyState' ? 'complete' : 'unsupported')
    )
    const host = new DiscordWebFastResponseHost(store as never)
    await host.attach(sender as never, attached)

    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ loaded: true, contentMode: 'unsupported' })
    )
    expect(sender.send).toHaveBeenLastCalledWith(
      'discordWebFastResponse:stateChanged',
      expect.objectContaining({ state: 'unsupported', contentMode: 'unsupported' })
    )
    expect(
      sender.send.mock.calls.filter(
        ([channel, state]) =>
          channel === 'discordWebFastResponse:stateChanged' && state.state === 'unsupported'
      )
    ).toHaveLength(1)
  })
})
