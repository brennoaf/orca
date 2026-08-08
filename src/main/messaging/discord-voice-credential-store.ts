import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { hardenExistingSecureFile, writeSecureFile } from '../../shared/secure-file'
import type {
  CommunicationIntegrationRedactedError,
  CommunicationSecretMutation,
  DiscordCommunicationIntegrationStatus
} from '../../shared/communication-integrations'
import {
  normalizeDiscordApplicationId,
  type DiscordVoiceCredentialStatus
} from '../../shared/discord-voice'
import {
  applyCommunicationSecretMutation,
  CommunicationIntegrationCredentialFileError
} from './communication-integration-credential-file'

const CREDENTIALS_FILE = 'discord-voice-credentials.json.enc'

export type DiscordVoiceCredentials = {
  clientId: string
  clientSecret: string
  refreshToken: string | null
}

export type DiscordVoiceCredentialIdentity = Pick<
  DiscordVoiceCredentials,
  'clientId' | 'clientSecret'
>

type PersistedCredentialsFile = {
  version: 1
  format: 'electron-safe-storage-v1'
  ciphertext: string
}

let cached: DiscordVoiceCredentials | null = null
let cacheLoaded = false

function credentialsPath(): string {
  return join(app.getPath('userData'), CREDENTIALS_FILE)
}

function assertEncryptionAvailable(): void {
  let available = false
  try {
    available = safeStorage.isEncryptionAvailable()
  } catch {
    throw new CommunicationIntegrationCredentialFileError('secure_storage_unavailable')
  }
  if (!available) {
    throw new CommunicationIntegrationCredentialFileError('secure_storage_unavailable')
  }
}

function parseCredentials(value: unknown): DiscordVoiceCredentials | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const source = value as Record<string, unknown>
  const clientId = normalizeDiscordApplicationId(source.clientId)
  const clientSecret = typeof source.clientSecret === 'string' ? source.clientSecret.trim() : ''
  if (!clientId || !clientSecret) {
    return null
  }
  if (source.refreshToken !== null && typeof source.refreshToken !== 'string') {
    return null
  }
  return { clientId, clientSecret, refreshToken: source.refreshToken || null }
}

function parseEnvelope(value: unknown): PersistedCredentialsFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new CommunicationIntegrationCredentialFileError('secure_storage_read_failed')
  }
  const source = value as Record<string, unknown>
  if (
    source.version !== 1 ||
    source.format !== 'electron-safe-storage-v1' ||
    typeof source.ciphertext !== 'string' ||
    source.ciphertext.length === 0 ||
    source.ciphertext.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(source.ciphertext)
  ) {
    throw new CommunicationIntegrationCredentialFileError('secure_storage_read_failed')
  }
  return {
    version: 1,
    format: 'electron-safe-storage-v1',
    ciphertext: source.ciphertext
  }
}

function write(credentials: DiscordVoiceCredentials): void {
  assertEncryptionAvailable()
  const file: PersistedCredentialsFile = {
    version: 1,
    format: 'electron-safe-storage-v1',
    ciphertext: safeStorage.encryptString(JSON.stringify(credentials)).toString('base64')
  }
  writeSecureFile(credentialsPath(), JSON.stringify(file))
  cached = credentials
  cacheLoaded = true
}

function readFromDisk(): DiscordVoiceCredentials | null {
  const path = credentialsPath()
  if (!existsSync(path)) {
    return null
  }
  try {
    hardenExistingSecureFile(path)
    const envelope = parseEnvelope(JSON.parse(readFileSync(path, 'utf8')))
    assertEncryptionAvailable()
    const credentials = parseCredentials(
      JSON.parse(safeStorage.decryptString(Buffer.from(envelope.ciphertext, 'base64')))
    )
    if (!credentials) {
      throw new CommunicationIntegrationCredentialFileError('secure_storage_read_failed')
    }
    return credentials
  } catch (error) {
    if (error instanceof CommunicationIntegrationCredentialFileError) {
      throw error
    }
    throw new CommunicationIntegrationCredentialFileError('secure_storage_read_failed')
  }
}

export function readDiscordVoiceCredentials(): DiscordVoiceCredentials | null {
  if (cacheLoaded) {
    return cached
  }
  cached = readFromDisk()
  cacheLoaded = true
  return cached
}

export function saveDiscordVoiceCredentials(args: {
  clientId: string
  clientSecret: string
}): void {
  updateDiscordVoiceCredentials({
    clientId: args.clientId,
    clientSecret: { action: 'replace', value: args.clientSecret }
  })
}

export function updateDiscordVoiceCredentials(args: {
  clientId: string
  clientSecret: CommunicationSecretMutation
}): DiscordVoiceCredentials | null {
  const clientId = normalizeDiscordApplicationId(args.clientId)
  if (!clientId) {
    throw new Error('Discord application ID must be the numeric ID from the Developer Portal')
  }
  const current = readFromDisk()
  const clientSecret = applyCommunicationSecretMutation(
    current?.clientSecret ?? null,
    args.clientSecret
  )
  if (!clientSecret) {
    clearDiscordVoiceCredentials()
    return null
  }
  const credentials = {
    clientId,
    clientSecret,
    refreshToken:
      current?.clientId === clientId && current.clientSecret === clientSecret
        ? current.refreshToken
        : null
  }
  write(credentials)
  return credentials
}

function matchesIdentity(
  credentials: DiscordVoiceCredentials | null,
  expected: DiscordVoiceCredentialIdentity
): credentials is DiscordVoiceCredentials {
  return (
    credentials?.clientId === expected.clientId &&
    credentials.clientSecret === expected.clientSecret
  )
}

export function saveDiscordVoiceRefreshTokenIfCurrent(
  expected: DiscordVoiceCredentialIdentity,
  refreshToken: string
): boolean {
  const credentials = readFromDisk()
  if (!matchesIdentity(credentials, expected)) {
    return false
  }
  write({ ...credentials, refreshToken })
  return true
}

export function clearDiscordVoiceRefreshTokenIfCurrent(
  expected: DiscordVoiceCredentialIdentity
): boolean {
  const credentials = readFromDisk()
  if (!matchesIdentity(credentials, expected)) {
    return false
  }
  if (credentials.refreshToken) {
    write({ ...credentials, refreshToken: null })
  }
  return true
}

export function clearDiscordVoiceCredentials(): void {
  cached = null
  cacheLoaded = true
  rmSync(credentialsPath(), { force: true })
}

export function getDiscordVoiceCredentialStatus(): DiscordVoiceCredentialStatus {
  const credentials = readDiscordVoiceCredentials()
  return {
    configured: credentials !== null,
    clientId: credentials?.clientId ?? null
  }
}

export function emptyDiscordCommunicationStatus(
  lastError: CommunicationIntegrationRedactedError | null = null
): DiscordCommunicationIntegrationStatus {
  return {
    provider: 'discord',
    endpoint: null,
    readiness: {
      configured: false,
      verified: false,
      sendReady: false,
      receiveReady: false,
      verifiedAt: null,
      lastError
    },
    clientId: null,
    clientSecretStored: false
  }
}
