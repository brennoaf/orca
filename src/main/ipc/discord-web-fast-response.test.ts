import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (event: { sender: unknown }, value: unknown) => unknown>()
  const listeners = new Map<string, (event: { sender: unknown }, value: unknown) => unknown>()
  const host = {
    attach: vi.fn(),
    update: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    handleCompactIntent: vi.fn(() => Promise.resolve()),
    selectVoiceChannel: vi.fn(() => Promise.resolve()),
    shutdown: vi.fn()
  }
  return {
    handlers,
    listeners,
    host,
    trusted: vi.fn(() => true),
    resolveProfile: vi.fn(() => ({ id: 'discord', partition: 'persist:discord' })),
    dock: { isSender: vi.fn(), getSnapshotForSender: vi.fn() },
    attached: { isAttachedSender: vi.fn() }
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: { sender: unknown }, value: unknown) => unknown) =>
      mocks.handlers.set(channel, handler),
    on: (channel: string, listener: (event: { sender: unknown }, value: unknown) => unknown) =>
      mocks.listeners.set(channel, listener),
    removeListener: (channel: string) => mocks.listeners.delete(channel)
  }
}))
vi.mock('../window/communications-dock-controller', () => ({
  communicationsDockController: mocks.dock
}))
vi.mock('../window/floating-comms-surface-controller', () => ({
  floatingCommsSurfaceController: mocks.attached
}))
vi.mock('../discord-web-fast-response/compact-host', () => ({
  DiscordWebFastResponseHost: class {
    attach = mocks.host.attach
    update = mocks.host.update
    show = mocks.host.show
    hide = mocks.host.hide
    handleCompactIntent = mocks.host.handleCompactIntent
    selectVoiceChannel = mocks.host.selectVoiceChannel
    shutdown = mocks.host.shutdown
  }
}))
vi.mock('../discord-web-fast-response/compact-host-session', () => ({
  resolveDiscordWebFastResponseProfile: mocks.resolveProfile
}))
vi.mock('./ui', () => ({ isTrustedUIRenderer: mocks.trusted }))

import {
  registerDiscordWebFastResponseHandlers,
  shutdownDiscordWebFastResponseHost
} from './discord-web-fast-response'

const sender = { id: 17 }
const geometry = { rectCss: { x: 0, y: 0, width: 300, height: 400 }, rendererZoomFactor: 1 }
const attached = {
  appId: 'discord' as const,
  target: 'attached' as const,
  requestId: 1,
  surfaceId: 2,
  mode: 'attached-native' as const,
  ...geometry
}
const dock = {
  appId: 'discord' as const,
  target: 'dock' as const,
  generation: 4,
  revision: 7,
  tabId: 'tab',
  activeLeafAppId: 'discord' as const,
  ...geometry
}

function visibleDiscordDock(): object {
  return {
    visible: true,
    layout: {
      collapsed: false,
      activeTabId: 'tab',
      tabs: [{ id: 'tab', layout: { type: 'leaf', appId: 'discord' } }]
    }
  }
}

describe('registerDiscordWebFastResponseHandlers', () => {
  beforeEach(() => {
    shutdownDiscordWebFastResponseHost()
    mocks.handlers.clear()
    mocks.listeners.clear()
    vi.clearAllMocks()
    mocks.dock.isSender.mockReturnValue(true)
    mocks.dock.getSnapshotForSender.mockReturnValue(visibleDiscordDock())
    mocks.attached.isAttachedSender.mockReturnValue(true)
    mocks.trusted.mockReturnValue(true)
    registerDiscordWebFastResponseHandlers({} as never)
  })

  it('authorizes current attached and dock owners', () => {
    mocks.handlers.get('discordWebFastResponse:attach')?.({ sender }, attached)
    expect(mocks.host.attach).toHaveBeenCalledWith(sender, attached)

    mocks.handlers.get('discordWebFastResponse:updateBounds')?.({ sender }, dock)
    expect(mocks.host.update).toHaveBeenCalledWith(sender, dock)
  })

  it('rejects a hidden dock, an unknown attached sender and malformed requests', () => {
    const attach = mocks.handlers.get('discordWebFastResponse:attach')!
    mocks.dock.getSnapshotForSender.mockReturnValue({ ...visibleDiscordDock(), visible: false })
    expect(() => attach({ sender }, dock)).toThrow('discord_web_fast_response_sender_denied')

    mocks.attached.isAttachedSender.mockReturnValue(false)
    expect(() => attach({ sender }, attached)).toThrow('discord_web_fast_response_sender_denied')
    expect(() => attach({ sender }, { ...attached, extra: true })).toThrow(
      'discord_web_fast_response_request_denied'
    )
  })

  it('resolves the shared profile for the trusted UI renderer only', () => {
    const resolveProfile = mocks.handlers.get('discordWebFastResponse:resolveSessionProfile')!
    expect(resolveProfile({ sender }, undefined)).toEqual({
      id: 'discord',
      partition: 'persist:discord'
    })
    expect(mocks.resolveProfile).toHaveBeenCalledOnce()

    mocks.trusted.mockReturnValue(false)
    expect(() => resolveProfile({ sender }, undefined)).toThrow(
      'discord_web_fast_response_profile_sender_denied'
    )
  })

  it('validates the preload voice selection payload before delegating to the host', () => {
    const select = mocks.listeners.get('discordWebFastResponse:selectVoiceChannel')!
    select({ sender }, { revision: 9, channelId: '12345678901234567' })
    select({ sender }, { revision: 9, channelId: 'invalid' })
    select({ sender }, { revision: 9, channelId: '12345678901234567', extra: true })

    expect(mocks.host.selectVoiceChannel).toHaveBeenCalledOnce()
    expect(mocks.host.selectVoiceChannel).toHaveBeenCalledWith(sender, {
      revision: 9,
      channelId: '12345678901234567'
    })
  })

  it('validates compact navigation intents before delegating to the host', () => {
    const navigate = mocks.listeners.get('discordWebFastResponse:compactIntent')!
    navigate(
      { sender },
      {
        revision: 7,
        intent: {
          kind: 'select-manager-tab',
          tab: 'messages'
        }
      }
    )
    navigate(
      { sender },
      {
        revision: 7,
        intent: {
          kind: 'select-server',
          serverId: '12345678901234567',
          serverName: 'EGB'
        }
      }
    )
    navigate(
      { sender },
      {
        revision: 7,
        intent: { kind: 'select-server', serverId: 'invalid', serverName: 'EGB' }
      }
    )
    navigate({ sender }, { revision: 7, intent: { kind: 'back' }, extra: true })

    expect(mocks.host.handleCompactIntent).toHaveBeenCalledTimes(2)
    expect(mocks.host.handleCompactIntent).toHaveBeenLastCalledWith(sender, {
      revision: 7,
      intent: {
        kind: 'select-server',
        serverId: '12345678901234567',
        serverName: 'EGB'
      }
    })
  })
})
