import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as DiscordIpcConnectionModule from './discord-ipc-connection'
import type * as DiscordVoiceAuthenticationModule from './discord-voice-authentication'

type TestConnection = {
  close: ReturnType<typeof vi.fn>
  request: ReturnType<
    typeof vi.fn<
      (command: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>
    >
  >
  subscribe: ReturnType<typeof vi.fn<() => Promise<void>>>
  unsubscribe: ReturnType<typeof vi.fn<() => Promise<void>>>
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined
  const promise = new Promise<void>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

type OpenOptions = {
  onEvent: (event: { event: string; data: Record<string, unknown> }) => void
  onUnexpectedClose: (reason: string) => void
}

const mocks = vi.hoisted(() => ({
  open: vi.fn<
    (
      options: OpenOptions
    ) => Promise<{ connection: TestConnection; ready: Record<string, unknown> }>
  >(),
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

describe('Discord voice service channel selection', () => {
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

  it('confirms a selected channel without optimistic state changes', async () => {
    const selectedId = '12345678901234567'
    const testConnection = connection()
    testConnection.request.mockImplementation(async (command) => {
      if (command === 'GET_SELECTED_VOICE_CHANNEL') {
        return { id: selectedId }
      }
      if (command === 'GET_CHANNEL') {
        return { name: 'Voice', voice_states: [] }
      }
      return {}
    })
    mocks.open.mockResolvedValueOnce({ connection: testConnection, ready: {} })
    mocks.authenticate.mockResolvedValueOnce('user-1')
    const service = await import('./discord-voice-service')
    service.startDiscordVoiceService()
    await vi.waitFor(() => expect(service.getDiscordVoiceSnapshot().connection).toBe('connected'))
    const snapshot = await service.selectDiscordVoiceChannel(selectedId)
    expect(testConnection.request).toHaveBeenCalledWith('SELECT_VOICE_CHANNEL', {
      channel_id: selectedId
    })
    expect(snapshot.channelId).toBe(selectedId)
    expect(snapshot.selection).toMatchObject({ kind: 'succeeded', channelId: selectedId })
    service.stopDiscordVoiceService()
  })

  it('does not update the snapshot when selection is rejected', async () => {
    const testConnection = connection()
    testConnection.request.mockImplementation(async (command) => {
      if (command === 'GET_SELECTED_VOICE_CHANNEL') {
        return {}
      }
      if (command === 'SELECT_VOICE_CHANNEL') {
        throw new Error('Rejected')
      }
      return {}
    })
    mocks.open.mockResolvedValueOnce({ connection: testConnection, ready: {} })
    mocks.authenticate.mockResolvedValueOnce('user-1')
    const service = await import('./discord-voice-service')
    service.startDiscordVoiceService()
    await vi.waitFor(() => expect(service.getDiscordVoiceSnapshot().connection).toBe('connected'))
    await expect(service.selectDiscordVoiceChannel('12345678901234567')).rejects.toThrow('Rejected')
    expect(service.getDiscordVoiceSnapshot().channelId).toBeNull()
    expect(service.getDiscordVoiceSnapshot().selection).toMatchObject({
      kind: 'failed',
      errorCode: 'selection_failed'
    })
    service.stopDiscordVoiceService()
  })

  it('does not let a stale completion overwrite a newer selection', async () => {
    const first = deferred()
    const second = deferred()
    const confirmed: string[] = []
    const testConnection = connection()
    testConnection.request.mockImplementation(async (command, params) => {
      const channelId = typeof params?.channel_id === 'string' ? params.channel_id : null
      if (command === 'SELECT_VOICE_CHANNEL' && channelId) {
        const pending = channelId === '12345678901234567' ? first : second
        await pending.promise
        confirmed.push(channelId)
        return {}
      }
      if (command === 'GET_SELECTED_VOICE_CHANNEL') {
        const selected = confirmed.shift()
        return selected ? { id: selected } : {}
      }
      if (command === 'GET_CHANNEL') {
        return { name: 'Voice', voice_states: [] }
      }
      return {}
    })
    mocks.open.mockResolvedValueOnce({ connection: testConnection, ready: {} })
    mocks.authenticate.mockResolvedValueOnce('user-1')
    const service = await import('./discord-voice-service')
    service.startDiscordVoiceService()
    await vi.waitFor(() => expect(service.getDiscordVoiceSnapshot().connection).toBe('connected'))

    const stale = service.selectDiscordVoiceChannel('12345678901234567')
    const current = service.selectDiscordVoiceChannel('22345678901234567')
    second.resolve()
    await current
    first.resolve()
    await stale

    expect(service.getDiscordVoiceSnapshot().selection).toMatchObject({
      kind: 'succeeded',
      channelId: '22345678901234567'
    })
    expect(service.getDiscordVoiceSnapshot().channelId).toBe('22345678901234567')
    service.stopDiscordVoiceService()
  })
})

describe('Discord voice snapshot publication', () => {
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

  it.each([
    [
      'authentication failure',
      async () => {
        const auth = await import('./discord-voice-authentication')
        mocks.open.mockResolvedValueOnce({ connection: connection(), ready: {} })
        mocks.authenticate.mockRejectedValueOnce(
          new auth.DiscordVoiceAuthError('Rejected credentials')
        )
      },
      'Rejected credentials'
    ],
    [
      'transport failure',
      async () => {
        mocks.open.mockRejectedValueOnce(new Error('Discord desktop is unavailable'))
      },
      'Discord desktop is unavailable'
    ]
  ] as const)('publishes %s', async (_label, configure, expectedError) => {
    await configure()
    const service = await import('./discord-voice-service')
    const snapshots: ReturnType<typeof service.getDiscordVoiceSnapshot>[] = []
    const remove = service.onDiscordVoiceSnapshotChanged((snapshot) => snapshots.push(snapshot))

    service.startDiscordVoiceService()
    await vi.waitFor(() => expect(snapshots.at(-1)?.lastError).toBe(expectedError))

    expect(snapshots.some((snapshot) => snapshot.connection === 'connecting')).toBe(true)
    expect(snapshots.at(-1)).toMatchObject({ connection: 'disconnected', lastError: expectedError })
    remove()
    service.stopDiscordVoiceService()
  })

  it('publishes unexpected close, reconnect attempt and stop transitions', async () => {
    const captured: { options: OpenOptions | null } = { options: null }
    const firstConnection = connection()
    mocks.open.mockImplementationOnce(async (options) => {
      captured.options = options
      return { connection: firstConnection, ready: {} }
    })
    mocks.authenticate.mockResolvedValueOnce('user-1')
    const service = await import('./discord-voice-service')
    const snapshots: ReturnType<typeof service.getDiscordVoiceSnapshot>[] = []
    service.onDiscordVoiceSnapshotChanged((snapshot) => snapshots.push(snapshot))

    service.startDiscordVoiceService()
    await vi.waitFor(() => expect(snapshots.at(-1)?.connection).toBe('connected'))
    expect(
      snapshots.some(
        (snapshot) => snapshot.connection === 'connecting' && snapshot.selfUserId === 'user-1'
      )
    ).toBe(true)
    if (!captured.options) {
      throw new Error('Discord connection options were not captured')
    }
    captured.options.onUnexpectedClose('Discord closed')
    await vi.waitFor(() => expect(snapshots.at(-1)?.lastError).toBe('Discord closed'))
    service.stopDiscordVoiceService()

    expect(snapshots.at(-1)).toMatchObject({
      connection: 'disconnected',
      lastError: null,
      selection: { kind: 'idle' }
    })
  })

  it('publishes participant and speaking changes without changing call identity', async () => {
    const captured: { options: OpenOptions | null } = { options: null }
    const selectedId = '12345678901234567'
    const testConnection = connection()
    testConnection.request.mockImplementation(async (command) => {
      if (command === 'GET_SELECTED_VOICE_CHANNEL') {
        return { id: selectedId }
      }
      if (command === 'GET_CHANNEL') {
        return { name: 'Voice', voice_states: [] }
      }
      return {}
    })
    mocks.open.mockImplementationOnce(async (options) => {
      captured.options = options
      return { connection: testConnection, ready: {} }
    })
    mocks.authenticate.mockResolvedValueOnce('user-1')
    const service = await import('./discord-voice-service')
    const snapshots: ReturnType<typeof service.getDiscordVoiceSnapshot>[] = []
    service.onDiscordVoiceSnapshotChanged((snapshot) => snapshots.push(snapshot))
    service.startDiscordVoiceService()
    await vi.waitFor(() => expect(service.getDiscordVoiceSnapshot().channelId).toBe(selectedId))
    if (!captured.options) {
      throw new Error('Discord connection options were not captured')
    }

    captured.options.onEvent({
      event: 'VOICE_STATE_CREATE',
      data: {
        user: { id: 'user-2', username: 'Voice user' },
        voice_state: { mute: false, self_mute: false }
      }
    })
    captured.options.onEvent({ event: 'SPEAKING_START', data: { user_id: 'user-2' } })

    expect(snapshots.at(-1)?.participants).toMatchObject([{ userId: 'user-2', speaking: true }])
    service.stopDiscordVoiceService()
  })
})
