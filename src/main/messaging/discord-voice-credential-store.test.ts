import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

const mocks = vi.hoisted(() => ({
  userDataPath: '',
  encryptionAvailable: true,
  hardenExistingSecureFile: vi.fn(),
  writeSecureFile: vi.fn<(path: string, contents: string) => void>()
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => mocks.userDataPath) },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => mocks.encryptionAvailable),
    encryptString: vi.fn((value: string) =>
      Buffer.from(Buffer.from(value, 'utf8').map((byte) => byte ^ 0x5a))
    ),
    decryptString: vi.fn((value: Buffer) =>
      Buffer.from(value.map((byte) => byte ^ 0x5a)).toString('utf8')
    )
  }
}))

vi.mock('../../shared/secure-file', () => ({
  hardenExistingSecureFile: mocks.hardenExistingSecureFile,
  writeSecureFile: mocks.writeSecureFile
}))

function envelope(payload: unknown): string {
  const plaintext = JSON.stringify(payload)
  const ciphertext = Buffer.from(
    Buffer.from(plaintext, 'utf8').map((byte) => byte ^ 0x5a)
  ).toString('base64')
  return JSON.stringify({ version: 1, format: 'electron-safe-storage-v1', ciphertext })
}

describe('Discord voice credential store', () => {
  let root: string
  let path: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-discord-credential-'))
    path = join(root, 'discord-voice-credentials.json.enc')
    mocks.userDataPath = root
    mocks.encryptionAvailable = true
    mocks.writeSecureFile.mockReset()
    mocks.writeSecureFile.mockImplementation((target, contents) => {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, contents, { encoding: 'utf8', mode: 0o600 })
    })
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('reads the existing version-one credential format', async () => {
    writeFileSync(
      path,
      envelope({ clientId: '12345678901234567', clientSecret: 'secret', refreshToken: 'refresh' })
    )
    const store = await import('./discord-voice-credential-store')
    expect(store.readDiscordVoiceCredentials()).toEqual({
      clientId: '12345678901234567',
      clientSecret: 'secret',
      refreshToken: 'refresh'
    })
  })

  it('accepts an explicit null refresh token in the version-one format', async () => {
    writeFileSync(
      path,
      envelope({ clientId: '12345678901234567', clientSecret: 'secret', refreshToken: null })
    )
    const store = await import('./discord-voice-credential-store')
    expect(store.readDiscordVoiceCredentials()).toEqual({
      clientId: '12345678901234567',
      clientSecret: 'secret',
      refreshToken: null
    })
  })

  it.each([
    { clientId: '12345678901234567', clientSecret: 'secret' },
    { clientId: '12345678901234567', clientSecret: 'secret', refreshToken: 42 },
    { clientId: '12345678901234567', clientSecret: 'secret', refreshToken: false }
  ])('fails closed when the version-one refresh token is missing or invalid', async (payload) => {
    writeFileSync(path, envelope(payload))
    const store = await import('./discord-voice-credential-store')
    expect(() => store.readDiscordVoiceCredentials()).toThrowError(
      expect.objectContaining({ code: 'secure_storage_read_failed' })
    )
  })

  it('fails closed for an invalid existing file', async () => {
    writeFileSync(path, '{corrupt')
    const store = await import('./discord-voice-credential-store')
    expect(() => store.readDiscordVoiceCredentials()).toThrowError(
      expect.objectContaining({ code: 'secure_storage_read_failed' })
    )
    expect(() =>
      store.saveDiscordVoiceCredentials({
        clientId: '12345678901234567',
        clientSecret: 'replacement'
      })
    ).toThrowError(expect.objectContaining({ code: 'secure_storage_read_failed' }))
    expect(readFileSync(path, 'utf8')).toBe('{corrupt')
  })

  it('preserves or invalidates the refresh token according to credential changes', async () => {
    const store = await import('./discord-voice-credential-store')
    store.saveDiscordVoiceCredentials({
      clientId: '12345678901234567',
      clientSecret: 'first-secret'
    })
    store.saveDiscordVoiceRefreshTokenIfCurrent(
      { clientId: '12345678901234567', clientSecret: 'first-secret' },
      'refresh-token'
    )
    store.updateDiscordVoiceCredentials({
      clientId: '12345678901234567',
      clientSecret: { action: 'keep' }
    })
    expect(store.readDiscordVoiceCredentials()?.refreshToken).toBe('refresh-token')
    store.updateDiscordVoiceCredentials({
      clientId: '22345678901234567',
      clientSecret: { action: 'keep' }
    })
    expect(store.readDiscordVoiceCredentials()).toMatchObject({
      clientId: '22345678901234567',
      clientSecret: 'first-secret',
      refreshToken: null
    })
    store.updateDiscordVoiceCredentials({
      clientId: '22345678901234567',
      clientSecret: { action: 'clear' }
    })
    expect(store.readDiscordVoiceCredentials()).toBeNull()
    expect(existsSync(path)).toBe(false)
  })

  it('mutates refresh tokens only for the current credential identity', async () => {
    const store = await import('./discord-voice-credential-store')
    const oldIdentity = { clientId: '12345678901234567', clientSecret: 'old-secret' }
    const currentIdentity = { clientId: '22345678901234567', clientSecret: 'current-secret' }
    store.saveDiscordVoiceCredentials(oldIdentity)
    expect(store.saveDiscordVoiceRefreshTokenIfCurrent(oldIdentity, 'old-refresh')).toBe(true)
    store.saveDiscordVoiceCredentials(currentIdentity)
    expect(store.saveDiscordVoiceRefreshTokenIfCurrent(currentIdentity, 'current-refresh')).toBe(
      true
    )

    expect(store.saveDiscordVoiceRefreshTokenIfCurrent(oldIdentity, 'stale-refresh')).toBe(false)
    expect(store.clearDiscordVoiceRefreshTokenIfCurrent(oldIdentity)).toBe(false)
    expect(store.readDiscordVoiceCredentials()).toEqual({
      ...currentIdentity,
      refreshToken: 'current-refresh'
    })
    expect(store.clearDiscordVoiceRefreshTokenIfCurrent(currentIdentity)).toBe(true)
    expect(store.readDiscordVoiceCredentials()?.refreshToken).toBeNull()
  })

  it('uses only the legacy Discord credential file and never exposes plaintext', async () => {
    const store = await import('./discord-voice-credential-store')
    store.saveDiscordVoiceCredentials({
      clientId: '12345678901234567',
      clientSecret: 'secret-value'
    })
    const contents = readFileSync(path, 'utf8')
    expect(contents).not.toContain('12345678901234567')
    expect(contents).not.toContain('secret-value')
    expect(existsSync(join(root, 'discord-communication-credentials.json.enc'))).toBe(false)
  })

  it('reports unavailable secure storage instead of unconfigured', async () => {
    writeFileSync(
      path,
      envelope({ clientId: '12345678901234567', clientSecret: 'secret', refreshToken: null })
    )
    mocks.encryptionAvailable = false
    const store = await import('./discord-voice-credential-store')
    expect(() => store.readDiscordVoiceCredentials()).toThrowError(
      expect.objectContaining({ code: 'secure_storage_unavailable' })
    )
  })
})
