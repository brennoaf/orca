import { describe, expect, it, vi } from 'vitest'
import type { RpcContext } from '../core'

const mocks = vi.hoisted(() => ({
  getCompactMode: vi.fn(() => ({ kind: 'manager', tab: 'servers' })),
  canCloseCompactHub: vi.fn(() => false),
  toggleCompactHub: vi.fn(() => Promise.resolve('installed')),
  getHost: vi.fn()
}))

vi.mock('../../../ipc/discord-web-fast-response', () => ({
  getDiscordWebFastResponseHost: mocks.getHost
}))

import { DISCORD_WEB_FAST_RESPONSE_METHODS } from './discord-web-fast-response'

function method(name: string) {
  const result = DISCORD_WEB_FAST_RESPONSE_METHODS.find((candidate) => candidate.name === name)
  if (!result) {
    throw new Error('discord_web_fast_response_method_missing')
  }
  return result
}

describe('Discord compact mode RPC methods', () => {
  it('accepts no caller-selected compact mode', () => {
    const schema = method('discordWebFastResponse.toggleCompactHub').params
    expect(schema).toBeNull()
  })

  it('reads and toggles through the existing host singleton', async () => {
    const host = {
      getCompactMode: mocks.getCompactMode,
      canCloseCompactHub: mocks.canCloseCompactHub,
      toggleCompactHub: mocks.toggleCompactHub
    }
    mocks.getHost.mockReturnValue(host)

    expect(
      method('discordWebFastResponse.getCompactMode').handler(undefined, {} as RpcContext)
    ).toEqual({ mode: { kind: 'manager', tab: 'servers' }, canClose: false })
    await expect(
      method('discordWebFastResponse.toggleCompactHub').handler(undefined, {} as RpcContext)
    ).resolves.toEqual({
      mode: { kind: 'manager', tab: 'servers' },
      canClose: false,
      state: 'installed'
    })
    expect(mocks.toggleCompactHub).toHaveBeenCalledOnce()
  })

  it('denies remote clients', async () => {
    mocks.getHost.mockClear()
    await expect(
      Promise.resolve().then(() =>
        method('discordWebFastResponse.getCompactMode').handler(undefined, {
          clientKind: 'runtime'
        } as RpcContext)
      )
    ).rejects.toThrow('only available locally')
    expect(mocks.getHost).not.toHaveBeenCalled()
  })
})
