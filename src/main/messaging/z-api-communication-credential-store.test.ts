import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

import {
  clearZApiCommunicationCredentials,
  getZApiCommunicationStatus,
  readZApiCommunicationCredentials,
  saveZApiCommunicationCredentials,
  saveZApiCommunicationError,
  saveZApiCommunicationVerification
} from './z-api-communication-credential-store'

describe('Z-API communication credential store', () => {
  let root: string
  let path: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-z-api-credential-'))
    path = join(root, 'z-api-communication-credentials.json.enc')
    mocks.userDataPath = root
    mocks.encryptionAvailable = true
    mocks.writeSecureFile.mockReset()
    mocks.writeSecureFile.mockImplementation((target, contents) => {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, contents, { encoding: 'utf8', mode: 0o600 })
    })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('round-trips its own encrypted payload without plaintext identifiers or URLs', () => {
    saveZApiCommunicationCredentials({
      baseUrl: 'https://api.z-api.io',
      trustedCustomAuthority: null,
      instanceId: 'instance-sensitive',
      instanceToken: { action: 'replace', value: 'instance-token-sensitive' },
      clientToken: { action: 'replace', value: 'client-token-sensitive' }
    })
    const contents = readFileSync(path, 'utf8')
    expect(contents).not.toContain('instance-sensitive')
    expect(contents).not.toContain('instance-token-sensitive')
    expect(contents).not.toContain('client-token-sensitive')
    expect(contents).not.toContain('https://api.z-api.io')
    expect(readZApiCommunicationCredentials()).toMatchObject({
      version: 1,
      provider: 'z-api',
      instanceId: 'instance-sensitive',
      instanceToken: 'instance-token-sensitive',
      clientToken: 'client-token-sensitive'
    })
    expect(join(root, 'slack-communication-credentials.json.enc')).not.toBe(path)
  })

  it('applies keep, replace, and clear while invalidating verification and errors', () => {
    saveZApiCommunicationCredentials({
      baseUrl: 'https://api.z-api.io',
      trustedCustomAuthority: null,
      instanceId: 'instance-1',
      instanceToken: { action: 'replace', value: 'instance-first' },
      clientToken: { action: 'replace', value: 'client-first' }
    })
    saveZApiCommunicationVerification(false, '2026-08-08T12:00:00.000Z')
    saveZApiCommunicationError({ code: 'unauthorized', message: 'Rejected.', field: null })
    saveZApiCommunicationCredentials({
      baseUrl: 'https://gateway.example.com/z-api',
      trustedCustomAuthority: 'gateway.example.com',
      instanceId: 'instance-2',
      instanceToken: { action: 'keep' },
      clientToken: { action: 'replace', value: 'client-second' }
    })
    expect(readZApiCommunicationCredentials()).toMatchObject({
      instanceId: 'instance-2',
      instanceToken: 'instance-first',
      clientToken: 'client-second',
      verification: null,
      lastError: null
    })
    saveZApiCommunicationCredentials({
      baseUrl: 'https://gateway.example.com/z-api',
      trustedCustomAuthority: 'gateway.example.com',
      instanceId: 'instance-2',
      instanceToken: { action: 'clear' },
      clientToken: { action: 'keep' }
    })
    expect(readZApiCommunicationCredentials()).toMatchObject({
      instanceToken: null,
      clientToken: 'client-second'
    })
  })

  it('does not overwrite an existing unknown payload version', () => {
    const plaintext = JSON.stringify({ version: 2, provider: 'z-api' })
    const ciphertext = Buffer.from(
      Buffer.from(plaintext, 'utf8').map((byte) => byte ^ 0x5a)
    ).toString('base64')
    const contents = JSON.stringify({
      version: 1,
      format: 'electron-safe-storage-v1',
      ciphertext
    })
    writeFileSync(path, contents)
    expect(() =>
      saveZApiCommunicationCredentials({
        baseUrl: 'https://api.z-api.io',
        trustedCustomAuthority: null,
        instanceId: 'new-id',
        instanceToken: { action: 'replace', value: 'new-instance-token' },
        clientToken: { action: 'replace', value: 'new-client-token' }
      })
    ).toThrowError(expect.objectContaining({ code: 'secure_storage_read_failed' }))
    expect(readFileSync(path, 'utf8')).toBe(contents)
    expect(mocks.writeSecureFile).not.toHaveBeenCalled()
  })

  it('clears an unreadable credential file explicitly', () => {
    writeFileSync(path, '{corrupt')
    clearZApiCommunicationCredentials()
    expect(readZApiCommunicationCredentials()).toBeNull()
  })

  it('derives status from absent, configured, verified, failed, and cleared persisted state', () => {
    expect(getZApiCommunicationStatus()).toMatchObject({
      readiness: {
        configured: false,
        verified: false,
        sendReady: false,
        receiveReady: false,
        verifiedAt: null,
        lastError: null
      },
      instanceId: null,
      instanceTokenStored: false,
      clientTokenStored: false,
      instanceConnected: null
    })

    saveZApiCommunicationCredentials({
      baseUrl: 'https://api.z-api.io',
      trustedCustomAuthority: null,
      instanceId: 'instance-1',
      instanceToken: { action: 'replace', value: 'instance-token' },
      clientToken: { action: 'replace', value: 'client-token' }
    })
    expect(getZApiCommunicationStatus()).toMatchObject({
      readiness: {
        configured: true,
        verified: false,
        sendReady: false,
        receiveReady: false
      },
      instanceId: 'instance-1',
      instanceTokenStored: true,
      clientTokenStored: true
    })

    saveZApiCommunicationVerification(false, '2026-08-08T12:00:00.000Z')
    expect(getZApiCommunicationStatus()).toMatchObject({
      readiness: {
        configured: true,
        verified: true,
        sendReady: false,
        receiveReady: false,
        verifiedAt: '2026-08-08T12:00:00.000Z',
        lastError: null
      },
      instanceConnected: false
    })

    const lastError = { code: 'unauthorized' as const, message: 'Rejected.', field: null }
    saveZApiCommunicationError(lastError)
    expect(getZApiCommunicationStatus()).toMatchObject({
      readiness: {
        configured: true,
        verified: false,
        sendReady: false,
        receiveReady: false,
        verifiedAt: null,
        lastError
      },
      instanceConnected: null
    })

    clearZApiCommunicationCredentials()
    expect(getZApiCommunicationStatus()).toMatchObject({
      readiness: {
        configured: false,
        verified: false,
        sendReady: false,
        receiveReady: false
      },
      instanceId: null,
      instanceTokenStored: false,
      clientTokenStored: false
    })
  })
})
