import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class FakeWindow {
    destroyed = false
    focused = true
    minimized = false
    webContents = { send: vi.fn() }
    focus = vi.fn()
    isDestroyed = vi.fn(() => this.destroyed)
    isFocused = vi.fn(() => this.focused)
    isMinimized = vi.fn(() => this.minimized)
    restore = vi.fn(() => {
      this.minimized = false
    })
    show = vi.fn()
  }
  const mainWindow = new FakeWindow()
  return {
    FakeWindow,
    mainWindow,
    attachedSender: null as unknown,
    mainSend: vi.fn(),
    openNative: vi.fn(() => true),
    updateNative: vi.fn(() => true as boolean | null),
    closeAttached: vi.fn(),
    destroySurface: vi.fn(),
    destroyAttached: vi.fn(),
    resizeAttached: vi.fn(),
    useDom: vi.fn(() => false)
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
vi.mock('./floating-comms-attached-window', () => ({
  destroyAttachedFloatingCommsWindow: mocks.destroyAttached
}))
vi.mock('./floating-comms-surface-window', () => ({
  closeFloatingCommsSurface: mocks.closeAttached,
  destroyFloatingCommsSurface: mocks.destroySurface,
  isFloatingCommsSurfaceRenderer: (sender: unknown) => sender === mocks.attachedSender,
  isFloatingCommsSurfaceVisible: () => true,
  openFloatingCommsSurface: mocks.openNative,
  resizeFloatingCommsSurface: mocks.resizeAttached,
  shouldUseFloatingCommsDomFallback: mocks.useDom,
  updateFloatingCommsSurface: mocks.updateNative
}))

import { FloatingCommsSurfaceController } from './floating-comms-surface-controller'

const owner = new mocks.FakeWindow() as unknown as Electron.BrowserWindow
const geometry = {
  anchor: { x: 20, y: 20, width: 40, height: 40 },
  workspace: { x: 10, y: 10, width: 800, height: 600 },
  height: 520
}
const request = (appId: 'discord' | 'slack' | 'whatsapp-web', requestId: number) => ({
  appId,
  requestId,
  ...geometry
})

describe('FloatingCommsSurfaceController', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.attachedSender = null
    mocks.openNative.mockReturnValue(true)
    mocks.updateNative.mockReturnValue(true)
    mocks.useDom.mockReturnValue(false)
  })

  it('keeps one attached surface and closes the previous one before replacement', () => {
    const controller = new FloatingCommsSurfaceController()
    const first = controller.open(owner, request('discord', 1)).identity
    const second = controller.open(owner, request('slack', 2)).identity

    expect(mocks.closeAttached).toHaveBeenCalledWith(first)
    expect(controller.listPresentations()).toEqual([
      expect.objectContaining({
        appId: 'slack',
        mode: 'attached-native',
        surfaceId: second.surfaceId
      })
    ])
  })

  it('admits only the exact current native or DOM attached sender', () => {
    const controller = new FloatingCommsSurfaceController()
    const nativeSender = new mocks.FakeWindow().webContents as unknown as Electron.WebContents
    const native = controller.open(owner, request('whatsapp-web', 1)).identity
    mocks.attachedSender = nativeSender
    expect(controller.isAttachedSender(nativeSender, native)).toBe(true)

    controller.closeAttached(native)
    mocks.useDom.mockReturnValue(true)
    const dom = controller.open(owner, request('whatsapp-web', 2)).identity
    expect(dom.mode).toBe('attached-dom')
    expect(
      controller.isAttachedSender(owner.webContents as unknown as Electron.WebContents, dom)
    ).toBe(true)
    expect(controller.isAttachedSender(nativeSender, dom)).toBe(false)
  })

  it('resizes only the current allowed DOM attached surface', () => {
    const controller = new FloatingCommsSurfaceController()
    mocks.useDom.mockReturnValue(true)
    const whatsapp = controller.open(owner, request('whatsapp-web', 1)).identity
    controller.resize(whatsapp, 720)
    expect(mocks.resizeAttached).toHaveBeenCalledWith(whatsapp, 720)

    controller.closeAttached(whatsapp)
    const slack = controller.open(owner, request('slack', 2)).identity
    controller.resize(slack, 420)
    expect(mocks.resizeAttached).toHaveBeenLastCalledWith(slack, 420)

    controller.closeAttached(slack)
    mocks.useDom.mockReturnValue(false)
    const native = controller.open(owner, request('whatsapp-web', 3)).identity
    expect(() => controller.resize(native, 520)).toThrow('floating_comms_resize_denied')

    controller.closeAttached(native)
    mocks.useDom.mockReturnValue(true)
    const discord = controller.open(owner, request('discord', 4)).identity
    expect(() => controller.resize(discord, 520)).toThrow('floating_comms_resize_denied')
    expect(mocks.resizeAttached).toHaveBeenCalledTimes(2)
  })

  it('admits one exact initial Discord native measurement without enabling resize', () => {
    const controller = new FloatingCommsSurfaceController()
    const sender = new mocks.FakeWindow().webContents as unknown as Electron.WebContents
    const discord = controller.open(owner, request('discord', 1)).identity
    mocks.attachedSender = sender

    controller.measure(sender, discord, 520)

    expect(mocks.resizeAttached).toHaveBeenCalledWith(discord, 520)
    expect(() => controller.resize(discord, 520)).toThrow('floating_comms_resize_denied')
    expect(() => controller.measure(sender, discord, 520)).toThrow('floating_comms_measure_denied')
  })

  it('rejects Discord native measurements from stale senders and identities', () => {
    const controller = new FloatingCommsSurfaceController()
    const sender = new mocks.FakeWindow().webContents as unknown as Electron.WebContents
    const staleSender = new mocks.FakeWindow().webContents as unknown as Electron.WebContents
    const discord = controller.open(owner, request('discord', 1)).identity
    mocks.attachedSender = sender

    expect(() => controller.measure(staleSender, discord, 520)).toThrow(
      'floating_comms_measure_denied'
    )
    expect(() => controller.measure(sender, { ...discord, requestId: 2 }, 520)).toThrow(
      'floating_comms_measure_denied'
    )
    expect(() => controller.measure(sender, { ...discord, surfaceId: 0 }, 520)).toThrow(
      'floating_comms_measure_denied'
    )
    expect(() => controller.measure(sender, { ...discord, appId: 'slack' }, 520)).toThrow(
      'floating_comms_measure_denied'
    )
    expect(() => controller.measure(sender, { ...discord, mode: 'attached-dom' }, 520)).toThrow(
      'floating_comms_measure_denied'
    )
    expect(mocks.resizeAttached).not.toHaveBeenCalled()
  })

  it('hands the attached session to the communications dock without a detached host', () => {
    const controller = new FloatingCommsSurfaceController()
    const attached = controller.open(owner, request('whatsapp-web', 1)).identity
    const sessionState = {
      appId: 'whatsapp-web' as const,
      selectedConversationId: 7,
      draft: 'draft'
    }

    expect(controller.takeAttachedForDock({ ...attached, sessionState })).toEqual(sessionState)
    expect(mocks.destroyAttached).toHaveBeenCalledWith(attached)
    expect(controller.listPresentations()).toEqual([])
    expect(mocks.mainSend).toHaveBeenLastCalledWith(
      'floatingComms:surfaceChanged',
      expect.objectContaining({ previous: attached, current: null, reason: 'detached' })
    )
  })

  it('rejects stale commands and closes the attached surface after an allowed action', () => {
    const controller = new FloatingCommsSurfaceController()
    const sender = new mocks.FakeWindow().webContents as unknown as Electron.WebContents
    const attached = controller.open(owner, request('discord', 1)).identity
    expect(() => controller.handleAction(sender, { ...attached, type: 'open-app' })).toThrow(
      'floating_comms_action_stale'
    )

    mocks.attachedSender = sender
    controller.handleAction(sender, { ...attached, type: 'open-app' })
    expect(mocks.closeAttached).toHaveBeenCalledWith(expect.objectContaining(attached))
  })
})
