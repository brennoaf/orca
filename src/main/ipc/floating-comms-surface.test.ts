import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: { sender: unknown }, value?: unknown) => unknown>(),
  isTrusted: vi.fn(),
  isSurface: vi.fn(),
  useDomFallback: vi.fn(),
  open: vi.fn(() => true),
  update: vi.fn(() => true as boolean | null),
  close: vi.fn(),
  resize: vi.fn(),
  send: vi.fn(),
  getIdentity: vi.fn(() => ({
    appId: 'discord' as 'discord' | 'slack' | 'whatsapp-web',
    requestId: 1
  })),
  isVisible: vi.fn(() => false),
  getStatuses: vi.fn(async () => []),
  leaveCall: vi.fn(),
  reconnect: vi.fn(),
  setSelfDeaf: vi.fn(),
  setSelfMute: vi.fn(),
  getSnapshot: vi.fn(() => ({
    connection: 'connected',
    channelId: null,
    channelName: null,
    selfUserId: null,
    participants: [],
    credentialsConfigured: true,
    lastError: null
  }))
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: { sender: unknown }, value?: unknown) => unknown) =>
      mocks.handlers.set(channel, handler)
  }
}))
vi.mock('./ui', () => ({
  isTrustedUIRenderer: mocks.isTrusted,
  sendToTrustedUIRenderer: mocks.send
}))
vi.mock('../window/floating-comms-surface-window', () => ({
  isFloatingCommsSurfaceRenderer: mocks.isSurface,
  shouldUseFloatingCommsDomFallback: mocks.useDomFallback,
  openFloatingCommsSurface: mocks.open,
  updateFloatingCommsSurface: mocks.update,
  closeFloatingCommsSurface: mocks.close,
  resizeFloatingCommsSurface: mocks.resize,
  getFloatingCommsSurfaceIdentity: mocks.getIdentity,
  isFloatingCommsSurfaceVisible: mocks.isVisible
}))
vi.mock('../messaging/communication-integration-registry', () => ({
  getCommunicationIntegrationStatuses: mocks.getStatuses
}))
vi.mock('../messaging/discord-voice-service', () => ({
  getDiscordVoiceSnapshot: mocks.getSnapshot,
  leaveDiscordVoiceCall: mocks.leaveCall,
  reconnectDiscordVoiceService: mocks.reconnect,
  setDiscordVoiceSelfDeaf: mocks.setSelfDeaf,
  setDiscordVoiceSelfMute: mocks.setSelfMute
}))
vi.mock('../window/discord-voice-window', () => ({
  closeDiscordVoiceWindow: vi.fn(),
  createOrFocusDiscordVoiceWindow: vi.fn(),
  getDiscordVoiceOverlayState: vi.fn(() => ({ open: false }))
}))

import { registerFloatingCommsSurfaceHandlers } from './floating-comms-surface'

function handler(channel: string): (event: { sender: unknown }, value?: unknown) => unknown {
  const registered = mocks.handlers.get(channel)
  if (!registered) {
    throw new Error(`Missing handler: ${channel}`)
  }
  return registered
}

const request = {
  appId: 'discord',
  requestId: 1,
  anchor: { x: 20, y: 30, width: 40, height: 40 },
  height: 300
}

describe('registerFloatingCommsSurfaceHandlers', () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.isTrusted.mockReset()
    mocks.isSurface.mockReset()
    mocks.useDomFallback.mockReset().mockReturnValue(false)
    mocks.open.mockReset().mockReturnValue(true)
    mocks.update.mockReset().mockReturnValue(true)
    mocks.close.mockReset()
    mocks.resize.mockReset()
    mocks.send.mockReset()
    mocks.getIdentity.mockReset().mockReturnValue({ appId: 'discord', requestId: 1 })
    mocks.isVisible.mockReset().mockReturnValue(false)
    mocks.leaveCall.mockReset()
    mocks.reconnect.mockReset()
    mocks.setSelfDeaf.mockReset()
    mocks.setSelfMute.mockReset()
    registerFloatingCommsSurfaceHandlers()
  })

  it('rejects untrusted senders and malformed anchors with explicit errors', () => {
    const open = handler('floatingComms:open')
    mocks.isTrusted.mockReturnValue(false)
    expect(() => open({ sender: {} }, request)).toThrow('floating_comms_open_denied')
    mocks.isTrusted.mockReturnValue(true)
    expect(() =>
      open({ sender: {} }, { ...request, anchor: { ...request.anchor, width: 0 } })
    ).toThrow('floating_comms_open_denied')
    expect(() => open({ sender: {} }, { ...request, unexpected: true })).toThrow(
      'floating_comms_open_denied'
    )
    expect(() =>
      open({ sender: {} }, { ...request, anchor: { ...request.anchor, unexpected: true } })
    ).toThrow('floating_comms_open_denied')
    expect(mocks.open).not.toHaveBeenCalled()
  })

  it('opens and updates the native surface only for admitted trusted requests', () => {
    mocks.isTrusted.mockReturnValue(true)
    const open = handler('floatingComms:open')
    const update = handler('floatingComms:update')
    expect(open({ sender: {} }, request)).toEqual({ mode: 'window' })
    expect(update({ sender: {} }, request)).toEqual({ mode: 'window' })
    expect(mocks.open).toHaveBeenCalledWith(request)
    expect(mocks.update).toHaveBeenCalledWith(request)
  })

  it('returns the DOM fallback when no external placement is available', () => {
    mocks.isTrusted.mockReturnValue(true)
    mocks.open.mockReturnValue(false)
    expect(handler('floatingComms:open')({ sender: {} }, request)).toEqual({ mode: 'dom' })
  })

  it('returns the DOM fallback when repositioning loses external space', () => {
    mocks.isTrusted.mockReturnValue(true)
    mocks.update.mockReturnValue(false)
    expect(handler('floatingComms:update')({ sender: {} }, request)).toEqual({ mode: 'dom' })
  })

  it('routes validated auxiliary actions and rejects main-window impersonation', () => {
    const action = handler('floatingComms:action')
    mocks.isSurface.mockReturnValue(false)
    expect(() =>
      action({ sender: {} }, { type: 'open-app', appId: 'discord', requestId: 1 })
    ).toThrow('floating_comms_action_denied')
    mocks.isSurface.mockReturnValue(true)
    action(
      { sender: {} },
      { type: 'open-settings', appId: 'discord', requestId: 1, provider: 'discord' }
    )
    expect(mocks.send).toHaveBeenCalledWith('floatingComms:action', {
      type: 'open-settings',
      appId: 'discord',
      requestId: 1,
      provider: 'discord'
    })
    expect(mocks.close).toHaveBeenCalledWith(1)
  })

  it('ignores an auxiliary action from a stale surface request', () => {
    const action = handler('floatingComms:action')
    mocks.isSurface.mockReturnValue(true)
    mocks.getIdentity.mockReturnValue({ appId: 'slack', requestId: 2 })
    action({ sender: {} }, { type: 'open-app', appId: 'discord', requestId: 1 })
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.close).not.toHaveBeenCalled()
  })

  it('admits close only from the main or current auxiliary renderer', () => {
    const close = handler('floatingComms:close')
    mocks.isTrusted.mockReturnValue(false)
    mocks.isSurface.mockReturnValue(false)
    expect(() => close({ sender: {} }, { requestId: 1 })).toThrow('floating_comms_close_denied')

    mocks.isTrusted.mockReturnValue(true)
    close({ sender: {} })
    close({ sender: {} }, { requestId: 1 })
    mocks.isTrusted.mockReturnValue(false)
    mocks.isSurface.mockReturnValue(true)
    close({ sender: {} }, { requestId: 2 })
    expect(() => close({ sender: {} })).toThrow('floating_comms_close_denied')
    expect(mocks.close).toHaveBeenNthCalledWith(1, undefined)
    expect(mocks.close).toHaveBeenNthCalledWith(2, 1)
    expect(mocks.close).toHaveBeenNthCalledWith(3, 2)
  })

  it('reports the native BrowserWindow visibility without awaiting integration statuses', () => {
    mocks.isSurface.mockReturnValue(true)
    mocks.isVisible.mockReturnValue(false)
    expect(handler('floatingComms:getState')({ sender: {} })).toMatchObject({
      appId: 'discord',
      requestId: 1,
      visible: false
    })
    expect(mocks.getStatuses).not.toHaveBeenCalled()
  })

  it('loads integration statuses through a separate auxiliary-only handler', async () => {
    mocks.isSurface.mockReturnValue(true)
    await expect(handler('floatingComms:getIntegrationStatuses')({ sender: {} })).resolves.toEqual(
      []
    )
    expect(mocks.getStatuses).toHaveBeenCalledOnce()
  })

  it('rejects auxiliary commands with unknown fields', async () => {
    const command = handler('floatingComms:discordCommand')
    const action = handler('floatingComms:action')
    mocks.isSurface.mockReturnValue(true)
    await expect(
      command(
        { sender: {} },
        {
          appId: 'discord',
          requestId: 1,
          method: 'set-self-mute',
          muted: true,
          unexpected: true
        }
      )
    ).rejects.toThrow('floating_comms_command_denied')
    expect(() =>
      action({ sender: {} }, { type: 'open-settings', provider: 'discord', unexpected: true })
    ).toThrow('floating_comms_action_denied')
  })

  it('admits Discord commands only for the current visible surface identity', async () => {
    const command = handler('floatingComms:discordCommand')
    const mute = {
      appId: 'discord',
      requestId: 1,
      method: 'set-self-mute',
      muted: true
    }
    mocks.isSurface.mockReturnValue(true)
    mocks.isVisible.mockReturnValue(true)

    await expect(command({ sender: {} }, mute)).resolves.toEqual(mocks.getSnapshot())
    expect(mocks.setSelfMute).toHaveBeenCalledExactlyOnceWith(true)

    mocks.isVisible.mockReturnValue(false)
    await expect(command({ sender: {} }, mute)).rejects.toThrow('floating_comms_command_stale')
    mocks.isVisible.mockReturnValue(true)
    mocks.getIdentity.mockReturnValue({ appId: 'slack', requestId: 2 })
    await expect(command({ sender: {} }, mute)).rejects.toThrow('floating_comms_command_stale')
    expect(mocks.setSelfMute).toHaveBeenCalledTimes(1)
  })
})
