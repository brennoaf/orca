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
  clearSlackCommunicationCredentials,
  getSlackCommunicationStatus,
  readSlackCommunicationCredentials,
  saveSlackCommunicationCredentials,
  saveSlackCommunicationError,
  saveSlackCommunicationVerification
} from './slack-communication-credential-store'

describe('Slack communication credential store', () => {
  let root: string
  let path: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'orca-slack-credential-'))
    path = join(root, 'slack-communication-credentials.json.enc')
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

  it('round-trips encrypted credentials without plaintext in the envelope', () => {
    saveSlackCommunicationCredentials({
      baseUrl: 'https://slack.com/api',
      trustedCustomAuthority: null,
      appToken: { action: 'replace', value: 'xapp-secret-app' },
      userToken: { action: 'replace', value: 'xoxp-secret-user' }
    })
    const contents = readFileSync(path, 'utf8')
    expect(contents).not.toContain('xapp-secret-app')
    expect(contents).not.toContain('xoxp-secret-user')
    expect(contents).not.toContain('https://slack.com/api')
    expect(readSlackCommunicationCredentials()).toMatchObject({
      version: 1,
      provider: 'slack',
      appToken: 'xapp-secret-app',
      userToken: 'xoxp-secret-user',
      baseUrl: 'https://slack.com/api'
    })
  })

  it('applies keep, replace, and clear while invalidating verification and errors', () => {
    saveSlackCommunicationCredentials({
      baseUrl: 'https://slack.com/api',
      trustedCustomAuthority: null,
      appToken: { action: 'replace', value: 'xapp-first' },
      userToken: { action: 'replace', value: 'xoxp-first' }
    })
    saveSlackCommunicationVerification(
      { teamId: 'T1', teamName: 'Team', userId: 'U1', userName: 'User' },
      '2026-08-08T12:00:00.000Z'
    )
    saveSlackCommunicationError({ code: 'unauthorized', message: 'Rejected.', field: null })
    saveSlackCommunicationCredentials({
      baseUrl: 'https://gateway.example.com/slack',
      trustedCustomAuthority: 'gateway.example.com',
      appToken: { action: 'keep' },
      userToken: { action: 'replace', value: 'xoxp-second' }
    })
    expect(readSlackCommunicationCredentials()).toMatchObject({
      appToken: 'xapp-first',
      userToken: 'xoxp-second',
      verification: null,
      lastError: null
    })
    saveSlackCommunicationCredentials({
      baseUrl: 'https://gateway.example.com/slack',
      trustedCustomAuthority: 'gateway.example.com',
      appToken: { action: 'clear' },
      userToken: { action: 'keep' }
    })
    expect(readSlackCommunicationCredentials()).toMatchObject({
      appToken: null,
      userToken: 'xoxp-second'
    })
  })

  it('does not overwrite an existing corrupt credential file', () => {
    writeFileSync(path, '{corrupt')
    expect(() =>
      saveSlackCommunicationCredentials({
        baseUrl: 'https://slack.com/api',
        trustedCustomAuthority: null,
        appToken: { action: 'replace', value: 'xapp-new' },
        userToken: { action: 'replace', value: 'xoxp-new' }
      })
    ).toThrowError(expect.objectContaining({ code: 'secure_storage_read_failed' }))
    expect(readFileSync(path, 'utf8')).toBe('{corrupt')
    expect(mocks.writeSecureFile).not.toHaveBeenCalled()
  })

  it('clears a corrupt credential file explicitly', () => {
    writeFileSync(path, '{corrupt')
    clearSlackCommunicationCredentials()
    expect(readSlackCommunicationCredentials()).toBeNull()
  })

  it('derives status from absent, configured, verified, failed, and cleared persisted state', () => {
    expect(getSlackCommunicationStatus()).toMatchObject({
      readiness: {
        configured: false,
        verified: false,
        sendReady: false,
        receiveReady: false,
        verifiedAt: null,
        lastError: null
      },
      appTokenStored: false,
      userTokenStored: false,
      workspace: null
    })

    saveSlackCommunicationCredentials({
      baseUrl: 'https://slack.com/api',
      trustedCustomAuthority: null,
      appToken: { action: 'replace', value: 'xapp-secret' },
      userToken: { action: 'replace', value: 'xoxp-secret' }
    })
    expect(getSlackCommunicationStatus()).toMatchObject({
      readiness: {
        configured: true,
        verified: false,
        sendReady: false,
        receiveReady: false
      },
      appTokenStored: true,
      userTokenStored: true
    })

    saveSlackCommunicationVerification(
      { teamId: 'T1', teamName: 'Team', userId: 'U1', userName: 'User' },
      '2026-08-08T12:00:00.000Z'
    )
    expect(getSlackCommunicationStatus()).toMatchObject({
      readiness: {
        configured: true,
        verified: true,
        sendReady: false,
        receiveReady: false,
        verifiedAt: '2026-08-08T12:00:00.000Z',
        lastError: null
      },
      workspace: { teamId: 'T1', userId: 'U1' }
    })

    const lastError = { code: 'unauthorized' as const, message: 'Rejected.', field: null }
    saveSlackCommunicationError(lastError)
    expect(getSlackCommunicationStatus()).toMatchObject({
      readiness: {
        configured: true,
        verified: false,
        sendReady: false,
        receiveReady: false,
        verifiedAt: null,
        lastError
      },
      workspace: null
    })

    clearSlackCommunicationCredentials()
    expect(getSlackCommunicationStatus()).toMatchObject({
      readiness: {
        configured: false,
        verified: false,
        sendReady: false,
        receiveReady: false
      },
      appTokenStored: false,
      userTokenStored: false
    })
  })
})
