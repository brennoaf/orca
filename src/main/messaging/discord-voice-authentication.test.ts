import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { DiscordIpcConnection } from './discord-ipc-connection'
import type * as DiscordOAuthModule from './discord-oauth'
import type { DiscordOAuthTokens } from './discord-oauth'

const mocks = vi.hoisted(() => ({
  userDataPath: '',
  refresh: vi.fn<(args: unknown) => Promise<DiscordOAuthTokens>>(),
  exchange: vi.fn<(args: unknown) => Promise<DiscordOAuthTokens>>()
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => mocks.userDataPath) },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((value: string) =>
      Buffer.from(Buffer.from(value, 'utf8').map((byte) => byte ^ 0x5a))
    ),
    decryptString: vi.fn((value: Buffer) =>
      Buffer.from(value.map((byte) => byte ^ 0x5a)).toString('utf8')
    )
  }
}))

vi.mock('../../shared/secure-file', () => ({
  hardenExistingSecureFile: vi.fn(),
  writeSecureFile: vi.fn((target: string, contents: string) => {
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, contents, { encoding: 'utf8', mode: 0o600 })
  })
}))

vi.mock('./discord-oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof DiscordOAuthModule>()
  return {
    ...actual,
    refreshDiscordAccessToken: mocks.refresh,
    exchangeDiscordAuthorizationCode: mocks.exchange
  }
})

function deferred<T>(): {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: Error): void
} {
  let resolvePromise: ((value: T) => void) | null = null
  let rejectPromise: ((error: Error) => void) | null = null
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })
  return {
    promise,
    resolve(value) {
      if (!resolvePromise) {
        throw new Error('Deferred promise is not initialized')
      }
      resolvePromise(value)
    },
    reject(error) {
      if (!rejectPromise) {
        throw new Error('Deferred promise is not initialized')
      }
      rejectPromise(error)
    }
  }
}

function connection(): DiscordIpcConnection {
  return {
    request: vi.fn(async (command: string) => {
      if (command === 'AUTHORIZE') {
        return { code: 'authorization-code' }
      }
      if (command === 'AUTHENTICATE') {
        return { user: { id: 'user-1' } }
      }
      throw new Error(`Unexpected Discord command: ${command}`)
    })
  } as unknown as DiscordIpcConnection
}

describe('Discord voice authentication credential races', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-discord-auth-'))
    mocks.userDataPath = root
    mocks.refresh.mockReset()
    mocks.exchange.mockReset()
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('does not save a stale refresh result after credentials change', async () => {
    const refresh = deferred<DiscordOAuthTokens>()
    mocks.refresh.mockReturnValueOnce(refresh.promise)
    const store = await import('./discord-voice-credential-store')
    const { authenticateDiscordRpc } = await import('./discord-voice-authentication')
    const oldCredentials = {
      clientId: '12345678901234567',
      clientSecret: 'old-secret',
      refreshToken: 'old-refresh'
    }
    const currentIdentity = { clientId: '22345678901234567', clientSecret: 'current-secret' }
    store.saveDiscordVoiceCredentials(oldCredentials)
    store.saveDiscordVoiceRefreshTokenIfCurrent(oldCredentials, oldCredentials.refreshToken)

    const authentication = authenticateDiscordRpc(connection(), oldCredentials)
    await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
    store.saveDiscordVoiceCredentials(currentIdentity)
    store.saveDiscordVoiceRefreshTokenIfCurrent(currentIdentity, 'current-refresh')
    refresh.resolve({ accessToken: 'stale-access', refreshToken: 'stale-refresh' })

    await expect(authentication).resolves.toBe('user-1')
    expect(store.readDiscordVoiceCredentials()).toEqual({
      ...currentIdentity,
      refreshToken: 'current-refresh'
    })
  })

  it('does not clear or replace current refresh state after a stale grant rejection', async () => {
    const refresh = deferred<DiscordOAuthTokens>()
    mocks.refresh.mockReturnValueOnce(refresh.promise)
    mocks.exchange.mockResolvedValueOnce({
      accessToken: 'stale-exchanged-access',
      refreshToken: 'stale-exchanged-refresh'
    })
    const oauth = await import('./discord-oauth')
    const store = await import('./discord-voice-credential-store')
    const { authenticateDiscordRpc } = await import('./discord-voice-authentication')
    const oldCredentials = {
      clientId: '12345678901234567',
      clientSecret: 'old-secret',
      refreshToken: 'spent-refresh'
    }
    const currentIdentity = { clientId: '22345678901234567', clientSecret: 'current-secret' }
    store.saveDiscordVoiceCredentials(oldCredentials)
    store.saveDiscordVoiceRefreshTokenIfCurrent(oldCredentials, oldCredentials.refreshToken)

    const authentication = authenticateDiscordRpc(connection(), oldCredentials)
    await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce())
    store.saveDiscordVoiceCredentials(currentIdentity)
    store.saveDiscordVoiceRefreshTokenIfCurrent(currentIdentity, 'current-refresh')
    refresh.reject(new oauth.DiscordOAuthRejectionError('Rejected grant', 'invalid_grant'))

    await expect(authentication).resolves.toBe('user-1')
    expect(store.readDiscordVoiceCredentials()).toEqual({
      ...currentIdentity,
      refreshToken: 'current-refresh'
    })
  })
})
