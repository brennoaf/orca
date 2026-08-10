import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class FakeWindow {
    destroyed = false
    hidden = false
    minimized = false
    visible = true
    loadFailed: ((window: FakeWindow, error: unknown) => void) | null = null
    webContents = {
      send: vi.fn(),
      isLoading: vi.fn(() => false),
      isDestroyed: vi.fn(() => this.destroyed)
    }
    destroy = vi.fn(() => {
      this.destroyed = true
      this.visible = false
    })
    focus = vi.fn()
    getBounds = vi.fn(() => ({ x: 100, y: 100, width: 420, height: 420 }))
    hide = vi.fn(() => {
      this.hidden = true
      this.visible = false
    })
    isDestroyed = vi.fn(() => this.destroyed)
    isMinimized = vi.fn(() => this.minimized)
    isVisible = vi.fn(() => this.visible)
    restore = vi.fn(() => {
      this.minimized = false
    })
    show = vi.fn(() => {
      this.hidden = false
      this.visible = true
    })
    setAlwaysOnTop = vi.fn()
  }

  const bindings = new Map<FakeWindow, { release: ReturnType<typeof vi.fn>; lifecycle: unknown }>()
  return {
    FakeWindow,
    bindings,
    mainSend: vi.fn(),
    mainWindow: new FakeWindow(),
    attachedSender: null as unknown,
    openNative: vi.fn(() => true),
    updateNative: vi.fn(() => true as boolean | null),
    closeAttached: vi.fn(),
    resizeAttached: vi.fn(),
    takeWindow: vi.fn(),
    destroyAttached: vi.fn(),
    useDom: vi.fn(() => false),
    unownedWindows: [] as InstanceType<typeof FakeWindow>[],
    createUnowned: vi.fn(),
    layoutSet: vi.fn(),
    layoutFlush: vi.fn(async () => undefined)
  }
})

vi.mock('electron', () => ({ app: { getPath: () => 'C:\\user-data' } }))
vi.mock('../ipc/ui', () => ({
  getTrustedUIRendererWindow: () => mocks.mainWindow,
  sendToTrustedUIRenderer: mocks.mainSend
}))
vi.mock('../messaging/discord-voice-service', () => ({
  getDiscordVoiceSnapshot: () => ({
    connection: 'disconnected',
    channelId: null,
    channelName: null,
    selfUserId: null,
    participants: [],
    credentialsConfigured: false,
    lastError: null
  })
}))
vi.mock('./discord-voice-window', () => ({ getDiscordVoiceOverlayState: () => ({ open: false }) }))
vi.mock('./floating-comms-detached-layout', () => ({
  FLOATING_COMMS_DETACHED_DEFAULT_HEIGHT: 420,
  FLOATING_COMMS_DETACHED_DEFAULT_WIDTH: 420,
  FloatingCommsDetachedLayoutStore: class {
    get = vi.fn(() => null)
    set = mocks.layoutSet
    flush = mocks.layoutFlush
  }
}))
vi.mock('./floating-comms-detached-window', () => ({
  bindFloatingCommsDetachedWindow: (
    window: InstanceType<typeof mocks.FakeWindow>,
    _bounds: unknown,
    lifecycle: unknown
  ) => {
    const binding = { release: vi.fn(), lifecycle }
    mocks.bindings.set(window, binding)
    return binding
  }
}))
vi.mock('./floating-comms-surface-window', () => ({
  closeFloatingCommsSurface: mocks.closeAttached,
  createUnownedFloatingCommsSurfaceWindow: mocks.createUnowned,
  destroyFloatingCommsSurface: mocks.destroyAttached,
  isFloatingCommsSurfaceRenderer: (sender: unknown) => sender === mocks.attachedSender,
  isFloatingCommsSurfaceVisible: () => true,
  openFloatingCommsSurface: mocks.openNative,
  resizeFloatingCommsSurface: mocks.resizeAttached,
  shouldUseFloatingCommsDomFallback: mocks.useDom,
  takeFloatingCommsSurfaceWindow: mocks.takeWindow,
  updateFloatingCommsSurface: mocks.updateNative
}))

import type { FloatingCommsSurfaceIdentity } from '../../shared/floating-comms-surface'
import { FloatingCommsSurfaceController } from './floating-comms-surface-controller'

const owner = new mocks.FakeWindow() as unknown as Electron.BrowserWindow
const geometry = {
  anchor: { x: 20, y: 20, width: 40, height: 40 },
  workspace: { x: 10, y: 10, width: 800, height: 600 },
  height: 300
}
const request = (appId: 'discord' | 'slack' | 'whatsapp-web', requestId: number) => ({
  appId,
  requestId,
  ...geometry
})
const session = (appId: 'discord' | 'slack' | 'whatsapp-web') =>
  appId === 'whatsapp-web'
    ? ({ appId, selectedConversationId: null, draft: '' } as const)
    : ({ appId } as const)

function detached(identity: FloatingCommsSurfaceIdentity) {
  return { ...identity, sessionState: session(identity.appId) }
}

describe('FloatingCommsSurfaceController', () => {
  beforeEach(() => {
    mocks.bindings.clear()
    mocks.mainSend.mockReset()
    mocks.openNative.mockReset().mockReturnValue(true)
    mocks.updateNative.mockReset().mockReturnValue(true)
    mocks.closeAttached.mockReset()
    mocks.resizeAttached.mockReset()
    mocks.takeWindow.mockReset()
    mocks.destroyAttached.mockReset()
    mocks.useDom.mockReset().mockReturnValue(false)
    mocks.createUnowned.mockReset().mockImplementation((_owner, loadFailed) => {
      const window = new mocks.FakeWindow()
      window.loadFailed = loadFailed
      mocks.unownedWindows.push(window)
      return window
    })
    mocks.unownedWindows.length = 0
    mocks.layoutSet.mockReset()
    mocks.layoutFlush.mockReset().mockResolvedValue(undefined)
    mocks.attachedSender = null
    mocks.mainWindow.destroyed = false
    mocks.mainWindow.minimized = false
  })

  it('keeps one attached surface and detached records for two apps with focus dedup', () => {
    const controller = new FloatingCommsSurfaceController()
    const discordWindow = new mocks.FakeWindow()
    const slackWindow = new mocks.FakeWindow()
    const discordAttached = controller.open(owner, request('discord', 1)).identity
    mocks.takeWindow.mockReturnValueOnce(discordWindow)
    const discordDetached = controller.detachSurface(detached(discordAttached))
    const slackAttached = controller.open(owner, request('slack', 2)).identity
    mocks.takeWindow.mockReturnValueOnce(slackWindow)
    const slackDetached = controller.detachSurface(detached(slackAttached))
    expect(
      controller
        .listPresentations()
        .map(({ appId }) => appId)
        .sort()
    ).toEqual(['discord', 'slack'])
    const openCalls = mocks.openNative.mock.calls.length
    expect(controller.open(owner, request('discord', 99)).identity).toMatchObject({
      appId: 'discord',
      surfaceId: discordDetached.surfaceId,
      mode: 'detached'
    })
    expect(mocks.openNative).toHaveBeenCalledTimes(openCalls)
    expect(discordWindow.focus).toHaveBeenCalledTimes(2)
    expect(slackDetached.mode).toBe('detached')
  })

  it('reuses the native webContents through detach minimize and attached readoption', () => {
    const controller = new FloatingCommsSurfaceController()
    const window = new mocks.FakeWindow()
    const attached = controller.open(owner, request('discord', 1)).identity
    mocks.takeWindow.mockReturnValue(window)
    const detachedPresentation = controller.detachSurface(detached(attached))
    controller.minimizeDetached(detached(detachedPresentation))
    const visibilityFalse = window.webContents.send.mock.calls.findLast(
      ([channel, value]) =>
        channel === 'floatingComms:visibilityChanged' &&
        (value as { visible?: boolean }).visible === false
    )
    expect(visibilityFalse?.[1]).toMatchObject({
      surfaceId: detachedPresentation.surfaceId,
      mode: 'detached',
      visible: false
    })
    expect(
      window.webContents.send.mock.calls.some(
        ([channel, value]) =>
          channel === 'floatingComms:surfaceChanged' &&
          (value as { current?: unknown }).current === null
      )
    ).toBe(false)
    expect(mocks.mainSend).toHaveBeenLastCalledWith(
      'floatingComms:surfaceChanged',
      expect.objectContaining({
        previous: expect.objectContaining({ surfaceId: detachedPresentation.surfaceId }),
        current: null,
        reason: 'minimized'
      })
    )
    const reopened = controller.open(owner, request('discord', 2)).identity
    expect(mocks.openNative).toHaveBeenLastCalledWith(
      owner,
      expect.objectContaining({ requestId: 2 }),
      reopened,
      expect.any(Object),
      window
    )
    const surfaceChange = window.webContents.send.mock.calls.findLast(
      ([channel]) => channel === 'floatingComms:surfaceChanged'
    )?.[1]
    expect(surfaceChange).toMatchObject({
      previous: { surfaceId: detachedPresentation.surfaceId, mode: 'detached' },
      current: { surfaceId: reopened.surfaceId, mode: 'attached-native' }
    })
    expect(window.webContents.send).toHaveBeenCalledWith('floatingComms:visibilityChanged', {
      ...reopened,
      visible: true
    })
    expect(mocks.mainSend).toHaveBeenLastCalledWith(
      'floatingComms:surfaceChanged',
      expect.objectContaining({
        previous: expect.objectContaining({ surfaceId: detachedPresentation.surfaceId }),
        current: reopened
      })
    )
  })

  it('admits a reopened native sender only for its current identity', () => {
    const controller = new FloatingCommsSurfaceController()
    const sender = new mocks.FakeWindow().webContents as unknown as Electron.WebContents
    const first = controller.open(owner, request('whatsapp-web', 1)).identity
    mocks.attachedSender = sender
    controller.closeAttached(first)
    const second = controller.open(owner, request('whatsapp-web', 2)).identity

    expect(controller.isAttachedSender(sender, first)).toBe(false)
    expect(controller.isAttachedSender(sender, second)).toBe(true)
    controller.resize(second, 320)
    expect(mocks.resizeAttached).toHaveBeenCalledWith(second, 320)
  })

  it('cleans a DOM detached window when loading rejects before registration', () => {
    const controller = new FloatingCommsSurfaceController()
    mocks.useDom.mockReturnValue(true)
    const attached = controller.open(owner, request('slack', 1)).identity
    mocks.createUnowned.mockImplementationOnce((_owner, loadFailed) => {
      const window = new mocks.FakeWindow()
      loadFailed(window, new Error('aborted'))
      return window
    })
    expect(() => controller.detachSurface(detached(attached))).toThrow(
      'floating_comms_detached_load_failed'
    )
    expect(controller.listPresentations()).toEqual([])
    expect(mocks.mainSend).toHaveBeenLastCalledWith(
      'floatingComms:surfaceChanged',
      expect.objectContaining({ previous: attached, current: null, reason: 'crashed' })
    )
  })

  it('removes an announced DOM detach on load rejection without affecting a newer generation', () => {
    const controller = new FloatingCommsSurfaceController()
    mocks.useDom.mockReturnValue(true)
    const firstAttached = controller.open(owner, request('slack', 1)).identity
    controller.detachSurface(detached(firstAttached))
    const firstWindow = mocks.unownedWindows[0]
    if (!firstWindow?.loadFailed) {
      throw new Error('Missing first load callback')
    }
    controller.closeDetached('slack')
    const secondAttached = controller.open(owner, request('slack', 2)).identity
    const secondDetached = controller.detachSurface(detached(secondAttached))
    firstWindow.loadFailed(firstWindow, new Error('stale failure'))
    expect(controller.getPresentation('slack')).toMatchObject({
      surfaceId: secondDetached.surfaceId,
      mode: 'detached'
    })
    const secondWindow = mocks.unownedWindows[1]
    if (!secondWindow?.loadFailed) {
      throw new Error('Missing second load callback')
    }
    secondWindow.loadFailed(secondWindow, new Error('load failure'))
    expect(controller.getPresentation('slack')).toBeNull()
    expect(mocks.bindings.get(secondWindow)?.release).toHaveBeenCalledOnce()
  })

  it('rejects stale sender identities and keeps detached actions open', () => {
    const controller = new FloatingCommsSurfaceController()
    const window = new mocks.FakeWindow()
    const attached = controller.open(owner, request('discord', 1)).identity
    mocks.takeWindow.mockReturnValue(window)
    const current = controller.detachSurface(detached(attached))
    const sender = window.webContents as unknown as Electron.WebContents
    expect(controller.isDetachedSender(sender, current)).toBe(true)
    expect(
      controller.isDetachedSender(sender, { ...current, surfaceId: current.surfaceId + 1 })
    ).toBe(false)
    expect(controller.isDetachedSender(sender, { ...current, mode: 'attached-native' })).toBe(false)
    controller.handleAction(sender, { ...current, type: 'open-app' })
    expect(controller.getPresentation('discord')).not.toBeNull()
    expect(mocks.closeAttached).not.toHaveBeenCalled()
    expect(mocks.mainWindow.show).toHaveBeenCalled()
    expect(mocks.mainWindow.focus).toHaveBeenCalled()
  })

  it('destroys exact detached and reusable windows on disable and shutdown', async () => {
    const controller = new FloatingCommsSurfaceController()
    const discordWindow = new mocks.FakeWindow()
    const slackWindow = new mocks.FakeWindow()
    const discordAttached = controller.open(owner, request('discord', 1)).identity
    mocks.takeWindow.mockReturnValueOnce(discordWindow)
    const discordDetached = controller.detachSurface(detached(discordAttached))
    controller.minimizeDetached(detached(discordDetached))
    controller.disable('discord')
    expect(discordWindow.destroy).toHaveBeenCalledOnce()
    const slackAttached = controller.open(owner, request('slack', 2)).identity
    mocks.takeWindow.mockReturnValueOnce(slackWindow)
    controller.detachSurface(detached(slackAttached))
    await controller.shutdown()
    expect(slackWindow.destroy).toHaveBeenCalledOnce()
    expect(controller.listPresentations()).toEqual([])
    expect(mocks.layoutFlush).toHaveBeenCalledOnce()
  })
})
