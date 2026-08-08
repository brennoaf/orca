import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcContext } from '../core'

const mocks = vi.hoisted(() => ({
  getOverlayState: vi.fn(() => ({ open: true })),
  getSnapshot: vi.fn(() => ({ state: 'snapshot' })),
  saveCommunicationIntegration: vi.fn(),
  clearCommunicationIntegration: vi.fn(),
  getCommunicationStatus: vi.fn(() => ({
    readiness: { configured: true },
    clientId: '12345678901234567'
  }))
}))

vi.mock('../../../window/discord-voice-window', () => ({
  closeDiscordVoiceWindow: vi.fn(),
  createOrFocusDiscordVoiceWindow: vi.fn(),
  getDiscordVoiceOverlayCompact: vi.fn(() => false),
  getDiscordVoiceOverlayState: mocks.getOverlayState,
  setDiscordVoiceOverlayCompact: vi.fn()
}))

vi.mock('../../../messaging/communication-integration-registry', () => ({
  COMMUNICATION_INTEGRATION_REGISTRY: {
    discord: { getStatus: mocks.getCommunicationStatus }
  },
  saveCommunicationIntegration: mocks.saveCommunicationIntegration,
  clearCommunicationIntegration: mocks.clearCommunicationIntegration
}))

vi.mock('../../../messaging/discord-voice-service', () => ({
  getDiscordVoiceSnapshot: mocks.getSnapshot,
  leaveDiscordVoiceCall: vi.fn(),
  reconnectDiscordVoiceService: vi.fn(),
  setDiscordVoiceSelfDeaf: vi.fn(),
  setDiscordVoiceSelfMute: vi.fn()
}))

import { DISCORD_VOICE_METHODS } from './discord-voice'

function method(name: string) {
  const result = DISCORD_VOICE_METHODS.find((candidate) => candidate.name === name)
  if (!result) {
    throw new Error(`Missing RPC method: ${name}`)
  }
  return result
}

describe('discordVoice.getOverlayState', () => {
  it('is a no-params RPC that returns the BrowserWindow-derived state', async () => {
    const method = DISCORD_VOICE_METHODS.find(
      (candidate) => candidate.name === 'discordVoice.getOverlayState'
    )
    expect(method?.params).toBeNull()
    expect(await method?.handler(undefined, {} as RpcContext)).toEqual({ open: true })
    expect(mocks.getOverlayState).toHaveBeenCalledTimes(1)
  })
})

describe('legacy Discord credential RPC methods', () => {
  beforeEach(() => {
    mocks.saveCommunicationIntegration.mockReset()
    mocks.clearCommunicationIntegration.mockReset()
    mocks.getCommunicationStatus.mockClear()
  })

  it('strictly rejects unknown save fields', () => {
    const schema = method('discordVoice.saveCredentials').params
    expect(
      schema?.safeParse({
        clientId: '12345678901234567',
        clientSecret: 'secret-value',
        extra: true
      }).success
    ).toBe(false)
  })

  it.each(['mobile', 'runtime'] as const)(
    'rejects %s clients before reading or mutating credentials',
    async (clientKind) => {
      const context = { clientKind } as RpcContext
      const cases = [
        { name: 'discordVoice.getCredentialStatus', params: undefined },
        {
          name: 'discordVoice.saveCredentials',
          params: { clientId: '12345678901234567', clientSecret: 'secret-value' }
        },
        { name: 'discordVoice.clearCredentials', params: undefined }
      ]
      for (const testCase of cases) {
        await expect(
          Promise.resolve().then(() => method(testCase.name).handler(testCase.params, context))
        ).rejects.toThrow('only available to local windows')
      }
      expect(mocks.getCommunicationStatus).not.toHaveBeenCalled()
      expect(mocks.saveCommunicationIntegration).not.toHaveBeenCalled()
      expect(mocks.clearCommunicationIntegration).not.toHaveBeenCalled()
    }
  )

  it('delegates save to the common adapter and preserves the legacy status shape', async () => {
    mocks.saveCommunicationIntegration.mockResolvedValueOnce({ ok: true })
    const method = DISCORD_VOICE_METHODS.find(
      (candidate) => candidate.name === 'discordVoice.saveCredentials'
    )
    const result = await method?.handler(
      { clientId: '12345678901234567', clientSecret: 'secret-value' },
      {} as RpcContext
    )
    expect(mocks.saveCommunicationIntegration).toHaveBeenCalledWith({
      provider: 'discord',
      clientId: '12345678901234567',
      clientSecret: { action: 'replace', value: 'secret-value' }
    })
    expect(result).toEqual({ configured: true, clientId: '12345678901234567' })
    expect(JSON.stringify(result)).not.toContain('secret-value')
  })

  it('delegates clear to the common adapter', async () => {
    mocks.clearCommunicationIntegration.mockResolvedValueOnce({ ok: true })
    const method = DISCORD_VOICE_METHODS.find(
      (candidate) => candidate.name === 'discordVoice.clearCredentials'
    )
    await method?.handler(undefined, {} as RpcContext)
    expect(mocks.clearCommunicationIntegration).toHaveBeenCalledWith('discord')
  })
})
