import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: { sender: WebContents }, value?: unknown) => unknown>(),
  owner: { isDestroyed: vi.fn(() => false) },
  fromWebContents: vi.fn(),
  isTrusted: vi.fn(),
  controller: {
    open: vi.fn(),
    update: vi.fn(),
    closeAttached: vi.fn(),
    resize: vi.fn(),
    detachSurface: vi.fn(),
    takeAttachedForDock: vi.fn(),
    minimizeDetached: vi.fn(),
    focusDetached: vi.fn(),
    closeDetached: vi.fn(),
    disable: vi.fn(),
    listPresentations: vi.fn(() => []),
    getPresentation: vi.fn(() => null),
    getStateForSender: vi.fn(),
    isAttachedSender: vi.fn(),
    isDetachedSender: vi.fn(),
    assertDiscordCommandSender: vi.fn(),
    handleAction: vi.fn()
  },
  communicationsDockController: {
    openOrFocus: vi.fn()
  },
  getStatuses: vi.fn(async () => []),
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

type WebContents = {
  isDestroyed: () => boolean
  getType: () => string
}

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
  ipcMain: {
    handle: (
      channel: string,
      callback: (event: { sender: WebContents }, value?: unknown) => unknown
    ) => mocks.handlers.set(channel, callback)
  }
}))
vi.mock('./ui', () => ({ isTrustedUIRenderer: mocks.isTrusted }))
vi.mock('../window/floating-comms-surface-controller', () => ({
  floatingCommsSurfaceController: mocks.controller
}))
vi.mock('../window/communications-dock-controller', () => ({
  communicationsDockController: mocks.communicationsDockController
}))
vi.mock('../messaging/communication-integration-registry', () => ({
  getCommunicationIntegrationStatuses: mocks.getStatuses
}))
vi.mock('../messaging/discord-voice-service', () => ({
  getDiscordVoiceSnapshot: mocks.getSnapshot,
  leaveDiscordVoiceCall: vi.fn(),
  reconnectDiscordVoiceService: vi.fn(),
  setDiscordVoiceSelfDeaf: vi.fn(),
  setDiscordVoiceSelfMute: vi.fn()
}))
vi.mock('../window/discord-voice-window', () => ({
  closeDiscordVoiceWindow: vi.fn(),
  createOrFocusDiscordVoiceWindow: vi.fn()
}))

import { registerFloatingCommsSurfaceHandlers } from './floating-comms-surface'

const sender: WebContents = { isDestroyed: () => false, getType: () => 'window' }
const identity = {
  appId: 'discord' as const,
  requestId: 1,
  surfaceId: 10,
  mode: 'attached-native' as const
}
const openRequest = {
  appId: 'discord' as const,
  requestId: 1,
  anchor: { x: 20, y: 30, width: 40, height: 40 },
  workspace: { x: 20, y: 20, width: 800, height: 500 },
  height: 300
}
const updateRequest = { ...openRequest, ...identity, geometryRequestId: null }

function handler(channel: string): (event: { sender: WebContents }, value?: unknown) => unknown {
  const registered = mocks.handlers.get(channel)
  if (!registered) {
    throw new Error(`Missing handler: ${channel}`)
  }
  return registered
}

describe('floating communications IPC', () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.fromWebContents.mockReset().mockReturnValue(mocks.owner)
    mocks.isTrusted.mockReset().mockReturnValue(true)
    for (const candidate of Object.values(mocks.controller)) {
      if (typeof candidate === 'function' && 'mockClear' in candidate) {
        candidate.mockClear()
      }
    }
    mocks.controller.open.mockReturnValue({ identity })
    mocks.controller.update.mockReturnValue({ identity })
    mocks.controller.takeAttachedForDock.mockReturnValue({ appId: 'discord' })
    mocks.controller.isAttachedSender.mockReturnValue(false)
    mocks.controller.isDetachedSender.mockReturnValue(false)
    mocks.controller.getStateForSender.mockReturnValue(null)
    registerFloatingCommsSurfaceHandlers()
  })

  it('admits strict local open and update requests only', () => {
    expect(handler('floatingComms:open')({ sender }, openRequest)).toEqual({ identity })
    expect(mocks.controller.open).toHaveBeenCalledWith(mocks.owner, openRequest)
    expect(handler('floatingComms:update')({ sender }, updateRequest)).toEqual({ identity })
    expect(mocks.controller.update).toHaveBeenCalledWith(mocks.owner, updateRequest)
    expect(() =>
      handler('floatingComms:open')({ sender }, { ...openRequest, extra: true })
    ).toThrow('floating_comms_open_denied')
    expect(() =>
      handler('floatingComms:update')({ sender }, { ...updateRequest, surfaceId: 0 })
    ).toThrow('floating_comms_update_denied')
    mocks.isTrusted.mockReturnValue(false)
    expect(() => handler('floatingComms:open')({ sender }, openRequest)).toThrow(
      'floating_comms_open_denied'
    )
  })

  it('requires exact attached identity for measure and auxiliary close', () => {
    mocks.isTrusted.mockReturnValue(false)
    mocks.controller.isAttachedSender.mockReturnValue(true)
    const measure = { ...identity, height: 280 }
    handler('floatingComms:measure')({ sender }, measure)
    handler('floatingComms:closeAttached')({ sender }, identity)
    expect(mocks.controller.resize).toHaveBeenCalledWith(measure, 280)
    expect(mocks.controller.closeAttached).toHaveBeenCalledWith(identity)
    mocks.controller.isAttachedSender.mockReturnValue(false)
    expect(() => handler('floatingComms:measure')({ sender }, measure)).toThrow(
      'floating_comms_measure_denied'
    )
    expect(() =>
      handler('floatingComms:closeAttached')({ sender }, { ...identity, mode: 'detached' })
    ).toThrow('floating_comms_close_denied')
  })

  it('validates handoff shape and app pairing before detach', () => {
    const detach = { ...identity, sessionState: { appId: 'discord' as const } }
    handler('floatingComms:detach')({ sender }, detach)
    expect(mocks.controller.takeAttachedForDock).toHaveBeenCalledWith(detach)
    expect(mocks.communicationsDockController.openOrFocus).toHaveBeenCalledWith('discord', {
      appId: 'discord'
    })
    expect(() =>
      handler('floatingComms:detach')(
        { sender },
        {
          ...identity,
          sessionState: { appId: 'whatsapp-web', selectedConversationId: null, draft: 'x' }
        }
      )
    ).toThrow('floating_comms_detach_denied')
    expect(() =>
      handler('floatingComms:detach')(
        { sender },
        {
          ...identity,
          sessionState: { appId: 'discord', unexpected: true }
        }
      )
    ).toThrow('floating_comms_detach_denied')
  })

  it('allows minimize only from the exact detached renderer', () => {
    const detached = {
      ...identity,
      mode: 'detached' as const,
      sessionState: { appId: 'discord' as const }
    }
    mocks.controller.isDetachedSender.mockReturnValue(true)
    handler('floatingComms:minimizeDetached')({ sender }, detached)
    expect(mocks.controller.minimizeDetached).toHaveBeenCalledWith(detached)
    mocks.controller.isDetachedSender.mockReturnValue(false)
    expect(() => handler('floatingComms:minimizeDetached')({ sender }, detached)).toThrow(
      'floating_comms_minimize_denied'
    )
  })

  it('keeps focus close disable and presentation reads local to the main renderer', () => {
    const appRequest = { appId: 'discord' }
    handler('floatingComms:focusDetached')({ sender }, appRequest)
    handler('floatingComms:closeDetached')({ sender }, appRequest)
    handler('floatingComms:disable')({ sender }, appRequest)
    handler('floatingComms:listPresentations')({ sender })
    handler('floatingComms:getPresentation')({ sender }, appRequest)
    expect(mocks.controller.focusDetached).toHaveBeenCalledWith('discord')
    expect(mocks.controller.closeDetached).toHaveBeenCalledWith('discord')
    expect(mocks.controller.disable).toHaveBeenCalledWith('discord')
    mocks.isTrusted.mockReturnValue(false)
    expect(() => handler('floatingComms:listPresentations')({ sender })).toThrow(
      'floating_comms_presentations_denied'
    )
  })

  it('routes state commands and actions only through exact surface ownership', async () => {
    const presentation = {
      ...identity,
      discord: mocks.getSnapshot(),
      overlayOpen: false,
      sessionState: { appId: 'discord' as const },
      visible: true
    }
    mocks.controller.getStateForSender.mockReturnValue(presentation)
    expect(handler('floatingComms:getState')({ sender })).toEqual(presentation)
    await expect(handler('floatingComms:getIntegrationStatuses')({ sender })).resolves.toEqual([])
    const command = { ...identity, appId: 'discord' as const, method: 'reconnect' as const }
    await handler('floatingComms:discordCommand')({ sender }, command)
    expect(mocks.controller.assertDiscordCommandSender).toHaveBeenCalledWith(sender, command)
    const action = { ...identity, type: 'open-app' as const }
    handler('floatingComms:action')({ sender }, action)
    expect(mocks.controller.handleAction).toHaveBeenCalledWith(sender, action)
    mocks.controller.getStateForSender.mockReturnValue(null)
    expect(() => handler('floatingComms:getState')({ sender })).toThrow(
      'floating_comms_state_denied'
    )
    expect(() => handler('floatingComms:action')({ sender }, { ...action, surfaceId: 0 })).toThrow(
      'floating_comms_action_denied'
    )
  })
})
