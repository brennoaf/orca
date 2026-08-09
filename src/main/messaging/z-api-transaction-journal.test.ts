import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userDataPath: '',
  writeSecureFile: vi.fn<(path: string, contents: string) => void>()
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
  writeSecureFile: mocks.writeSecureFile
}))

import {
  ZApiTransactionJournal,
  type ZApiTransactionJournalState
} from './z-api-transaction-journal'

function state(): ZApiTransactionJournalState {
  return {
    version: 1,
    provider: 'z-api',
    active: null,
    pending: {
      phase: 'callback_mutation_intent',
      configuration: {
        instanceId: 'instance-sensitive',
        instanceToken: 'instance-token-sensitive',
        clientToken: 'client-token-sensitive',
        baseUrl: 'https://api.z-api.io',
        endpointTrust: { kind: 'default' },
        publicWebhookBaseUrl: 'https://hooks.example.com',
        secretPath: '/orca/z-api/secret-sensitive',
        listenPort: 32123
      },
      rollbackWebhookState: {
        webhookUrl: 'https://previous.example.com/hook',
        receiveCallbackSentByMe: false
      }
    }
  }
}

describe('ZApiTransactionJournal', () => {
  let root: string
  let path: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-z-api-transaction-'))
    path = join(root, 'z-api-transaction-journal.json.enc')
    mocks.userDataPath = root
    mocks.writeSecureFile.mockReset()
    mocks.writeSecureFile.mockImplementation((target, contents) => {
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, contents, { encoding: 'utf8', mode: 0o600 })
    })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('round-trips the versioned journal without plaintext configuration', () => {
    const journal = new ZApiTransactionJournal()
    journal.write(state())
    const contents = readFileSync(path, 'utf8')
    expect(contents).not.toContain('instance-sensitive')
    expect(contents).not.toContain('secret-sensitive')
    expect(contents).not.toContain('hooks.example.com')
    expect(journal.read()).toEqual(state())
  })

  it('returns an empty journal only when the file is absent', () => {
    expect(new ZApiTransactionJournal().read()).toEqual({
      version: 1,
      provider: 'z-api',
      active: null,
      pending: null
    })
  })

  it('fails closed on malformed and future journal payloads', () => {
    const invalid = JSON.stringify({ version: 2, provider: 'z-api', active: null, pending: null })
    const ciphertext = Buffer.from(
      Buffer.from(invalid, 'utf8').map((byte) => byte ^ 0x5a)
    ).toString('base64')
    writeFileSync(
      path,
      JSON.stringify({ version: 1, format: 'electron-safe-storage-v1', ciphertext })
    )
    expect(() => new ZApiTransactionJournal().read()).toThrowError(
      expect.objectContaining({ code: 'secure_storage_read_failed' })
    )
  })
})
