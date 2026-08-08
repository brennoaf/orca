import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as DiscordIpcConnectionModule from './discord-ipc-connection'
import type * as DiscordVoiceAuthenticationModule from './discord-voice-authentication'

type TestConnection = {
  close: ReturnType<typeof vi.fn>
  request: ReturnType<typeof vi.fn<(command: string) => Promise<Record<string, unknown>>>>
  subscribe: ReturnType<typeof vi.fn<() => Promise<void>>>
  unsubscribe: ReturnType<typeof vi.fn<() => Promise<void>>>
}

const mocks = vi.hoisted(() => ({
  open: vi.fn<() => Promise<{ connection: TestConnection; ready: Record<string, unknown> }>>(),
  authenticate: vi.fn<() => Promise<string | null>>(),
  credentials: {
    clientId: '12345678901234567',
    clientSecret: 'secret',
    refreshToken: null
  } as { clientId: string; clientSecret: string; refreshToken: string | null } | null
}))

vi.mock('./discord-ipc-connection', async (importOriginal) => {
  const actual = await importOriginal<typeof DiscordIpcConnectionModule>()
  return { ...actual, DiscordIpcConnection: { open: mocks.open } }
})

vi.mock('./discord-voice-authentication', async (importOriginal) => {
  const actual = await importOriginal<typeof DiscordVoiceAuthenticationModule>()
  return { ...actual, authenticateDiscordRpc: mocks.authenticate }
})

vi.mock('./discord-voice-credential-store', () => ({
  getDiscordVoiceCredentialStatus: vi.fn(() => ({
    configured: mocks.credentials !== null,
    clientId: mocks.credentials?.clientId ?? null
  })),
  readDiscordVoiceCredentials: vi.fn(() => mocks.credentials)
}))

function connection(): TestConnection {
  return {
    close: vi.fn(),
    request: vi.fn(async () => ({})),
    subscribe: vi.fn(async () => undefined),
    unsubscribe: vi.fn(async () => undefined)
  }
}

describe('Discord voice service connection failure classification', () => {
  beforeEach(() => {
    mocks.open.mockReset()
    mocks.authenticate.mockReset()
    mocks.credentials = {
      clientId: '12345678901234567',
      clientSecret: 'secret',
      refreshToken: null
    }
    vi.resetModules()
  })

  it('classifies authentication failures and clears the kind after recovery', async () => {
    const auth = await import('./discord-voice-authentication')
    const firstConnection = connection()
    const recoveredConnection = connection()
    mocks.open
      .mockResolvedValueOnce({ connection: firstConnection, ready: {} })
      .mockResolvedValueOnce({ connection: recoveredConnection, ready: {} })
    mocks.authenticate
      .mockRejectedValueOnce(new auth.DiscordVoiceAuthError('Rejected credentials'))
      .mockResolvedValueOnce('user-1')
    const service = await import('./discord-voice-service')

    service.startDiscordVoiceService()
    await vi.waitFor(() =>
      expect(service.getDiscordVoiceConnectionFailureKind()).toBe('authentication')
    )
    service.reconnectDiscordVoiceService()
    await vi.waitFor(() => expect(service.getDiscordVoiceSnapshot().connection).toBe('connected'))

    expect(service.getDiscordVoiceConnectionFailureKind()).toBeNull()
    service.stopDiscordVoiceService()
  })

  it('classifies transport failures as provider unavailable', async () => {
    mocks.open.mockRejectedValueOnce(new Error('Discord desktop is not running'))
    const service = await import('./discord-voice-service')

    service.startDiscordVoiceService()
    await vi.waitFor(() =>
      expect(service.getDiscordVoiceConnectionFailureKind()).toBe('provider_unavailable')
    )

    service.stopDiscordVoiceService()
  })
})
