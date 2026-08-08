import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const mocks = vi.hoisted(() => ({
  userDataPath: '',
  encryptionAvailable: true,
  decryptError: false,
  hardenExistingSecureFile: vi.fn(),
  writeSecureFile: vi.fn((path: string, contents: string) => {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, contents, { encoding: 'utf8', mode: 0o600 })
    chmodSync(path, 0o600)
  })
}))

function transform(value: Buffer): Buffer {
  return Buffer.from(value.map((byte) => byte ^ 0x5a))
}

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => mocks.userDataPath) },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => mocks.encryptionAvailable),
    encryptString: vi.fn((value: string) => transform(Buffer.from(value, 'utf8'))),
    decryptString: vi.fn((value: Buffer) => {
      if (mocks.decryptError) {
        throw new Error('locked')
      }
      return transform(value).toString('utf8')
    })
  }
}))

vi.mock('../../shared/secure-file', () => ({
  hardenExistingSecureFile: mocks.hardenExistingSecureFile,
  writeSecureFile: mocks.writeSecureFile
}))

import {
  CommunicationIntegrationCredentialFile,
  type CommunicationIntegrationCredentialFileError
} from './communication-integration-credential-file'

type Payload = { version: 1; secret: string }

function parsePayload(value: unknown): Payload | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const source = value as Record<string, unknown>
  return source.version === 1 && typeof source.secret === 'string'
    ? { version: 1, secret: source.secret }
    : null
}

describe('CommunicationIntegrationCredentialFile', () => {
  let root: string
  let file: CommunicationIntegrationCredentialFile<Payload>

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-communication-credential-'))
    mocks.userDataPath = root
    mocks.encryptionAvailable = true
    mocks.decryptError = false
    mocks.hardenExistingSecureFile.mockClear()
    mocks.writeSecureFile.mockClear()
    file = new CommunicationIntegrationCredentialFile('provider.json.enc', parsePayload)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('distinguishes an absent file from a stored encrypted payload', () => {
    expect(file.read()).toEqual({ state: 'absent' })
    file.write({ version: 1, secret: 'secret-value' })
    const contents = readFileSync(join(root, 'provider.json.enc'), 'utf8')
    expect(contents).not.toContain('secret-value')
    expect(file.read()).toEqual({ state: 'present', value: { version: 1, secret: 'secret-value' } })
    expect(mocks.writeSecureFile).toHaveBeenCalledOnce()
    expect(mocks.hardenExistingSecureFile).toHaveBeenCalledWith(join(root, 'provider.json.enc'))
  })

  it('fails closed when secure storage is unavailable', () => {
    file.write({ version: 1, secret: 'secret-value' })
    mocks.encryptionAvailable = false
    expect(() => file.read()).toThrowError(
      expect.objectContaining<Partial<CommunicationIntegrationCredentialFileError>>({
        code: 'secure_storage_unavailable'
      })
    )
  })

  it.each([
    ['invalid JSON', '{'],
    [
      'unknown envelope version',
      JSON.stringify({ version: 2, format: 'electron-safe-storage-v1', ciphertext: 'AAAA' })
    ],
    [
      'invalid ciphertext',
      JSON.stringify({ version: 1, format: 'electron-safe-storage-v1', ciphertext: '%' })
    ]
  ])('rejects %s', (_label, contents) => {
    writeFileSync(join(root, 'provider.json.enc'), contents)
    expect(() => file.read()).toThrowError(
      expect.objectContaining<Partial<CommunicationIntegrationCredentialFileError>>({
        code: 'secure_storage_read_failed'
      })
    )
  })

  it('rejects decryption failure instead of treating it as absent', () => {
    file.write({ version: 1, secret: 'secret-value' })
    mocks.decryptError = true
    expect(() => file.read()).toThrowError(
      expect.objectContaining<Partial<CommunicationIntegrationCredentialFileError>>({
        code: 'secure_storage_read_failed'
      })
    )
  })

  it('removes an unreadable file through explicit clear', () => {
    writeFileSync(join(root, 'provider.json.enc'), '{')
    file.clear()
    expect(file.read()).toEqual({ state: 'absent' })
  })
})
