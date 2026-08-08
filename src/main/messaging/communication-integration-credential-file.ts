import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type {
  CommunicationIntegrationErrorCode,
  CommunicationIntegrationRedactedError,
  CommunicationSecretMutation
} from '../../shared/communication-integrations'
import { hardenExistingSecureFile, writeSecureFile } from '../../shared/secure-file'
import { CommunicationApiError } from './communication-api-endpoint'

type PersistedCredentialEnvelope = {
  version: 1
  format: 'electron-safe-storage-v1'
  ciphertext: string
}

export type CommunicationIntegrationCredentialRead<T> =
  | { state: 'absent' }
  | { state: 'present'; value: T }

export class CommunicationIntegrationCredentialFileError extends Error {
  readonly code: Extract<
    CommunicationIntegrationErrorCode,
    'secure_storage_unavailable' | 'secure_storage_read_failed'
  >

  constructor(
    code: Extract<
      CommunicationIntegrationErrorCode,
      'secure_storage_unavailable' | 'secure_storage_read_failed'
    >
  ) {
    super(
      code === 'secure_storage_unavailable'
        ? 'Secure credential storage is unavailable'
        : 'Stored credentials could not be read'
    )
    this.name = 'CommunicationIntegrationCredentialFileError'
    this.code = code
  }
}

export function credentialFileErrorResult(
  error: CommunicationIntegrationCredentialFileError
): CommunicationIntegrationRedactedError {
  return { code: error.code, message: error.message, field: null }
}

export function redactCommunicationIntegrationError(
  error: unknown
): CommunicationIntegrationRedactedError | null {
  if (error instanceof CommunicationIntegrationCredentialFileError) {
    return credentialFileErrorResult(error)
  }
  if (!(error instanceof CommunicationApiError)) {
    return null
  }
  const endpointError = [
    'endpoint_invalid',
    'endpoint_blocked',
    'endpoint_confirmation_required'
  ].includes(error.code)
  return { code: error.code, message: error.message, field: endpointError ? 'baseUrl' : null }
}

export function applyCommunicationSecretMutation(
  current: string | null,
  mutation: CommunicationSecretMutation
): string | null {
  if (mutation.action === 'keep') {
    return current
  }
  if (mutation.action === 'clear') {
    return null
  }
  const value = mutation.value.trim()
  if (!value) {
    throw new Error('Replacement secret cannot be empty')
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const ERROR_CODES: readonly CommunicationIntegrationErrorCode[] = [
  'not_configured',
  'invalid_configuration',
  'endpoint_confirmation_required',
  'endpoint_invalid',
  'endpoint_blocked',
  'endpoint_dns_failed',
  'secure_storage_unavailable',
  'secure_storage_read_failed',
  'timeout',
  'redirect_rejected',
  'unauthorized',
  'forbidden',
  'rate_limited',
  'provider_rejected',
  'invalid_response',
  'network_error',
  'provider_unavailable'
]

const ERROR_FIELDS = [
  'clientId',
  'clientSecret',
  'appToken',
  'userToken',
  'instanceId',
  'instanceToken',
  'clientToken',
  'baseUrl'
] as const

export function parseCommunicationIntegrationRedactedError(
  value: unknown
): CommunicationIntegrationRedactedError | null {
  if (!isRecord(value)) {
    return null
  }
  const code = ERROR_CODES.find((candidate) => candidate === value.code)
  const field =
    value.field === null
      ? null
      : (ERROR_FIELDS.find((candidate) => candidate === value.field) ?? undefined)
  if (
    !code ||
    typeof value.message !== 'string' ||
    value.message.length === 0 ||
    field === undefined
  ) {
    return null
  }
  return { code, message: value.message, field }
}

function parseEnvelope(value: unknown): PersistedCredentialEnvelope {
  if (!isRecord(value)) {
    throw new CommunicationIntegrationCredentialFileError('secure_storage_read_failed')
  }
  if (
    value.version !== 1 ||
    value.format !== 'electron-safe-storage-v1' ||
    typeof value.ciphertext !== 'string' ||
    value.ciphertext.length === 0 ||
    value.ciphertext.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value.ciphertext)
  ) {
    throw new CommunicationIntegrationCredentialFileError('secure_storage_read_failed')
  }
  return {
    version: 1,
    format: 'electron-safe-storage-v1',
    ciphertext: value.ciphertext
  }
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

export class CommunicationIntegrationCredentialFile<T> {
  private readonly fileName: string
  private readonly parsePayload: (value: unknown) => T | null

  constructor(fileName: string, parsePayload: (value: unknown) => T | null) {
    this.fileName = fileName
    this.parsePayload = parsePayload
  }

  path(): string {
    return join(app.getPath('userData'), this.fileName)
  }

  read(): CommunicationIntegrationCredentialRead<T> {
    const path = this.path()
    if (!existsSync(path)) {
      return { state: 'absent' }
    }
    try {
      hardenExistingSecureFile(path)
      const envelope = parseEnvelope(JSON.parse(readFileSync(path, 'utf8')))
      assertEncryptionAvailable()
      const plaintext = safeStorage.decryptString(Buffer.from(envelope.ciphertext, 'base64'))
      const payload = this.parsePayload(JSON.parse(plaintext))
      if (!payload) {
        throw new CommunicationIntegrationCredentialFileError('secure_storage_read_failed')
      }
      return { state: 'present', value: payload }
    } catch (error) {
      if (error instanceof CommunicationIntegrationCredentialFileError) {
        throw error
      }
      throw new CommunicationIntegrationCredentialFileError('secure_storage_read_failed')
    }
  }

  write(value: T): void {
    assertEncryptionAvailable()
    const envelope: PersistedCredentialEnvelope = {
      version: 1,
      format: 'electron-safe-storage-v1',
      ciphertext: safeStorage.encryptString(JSON.stringify(value)).toString('base64')
    }
    writeSecureFile(this.path(), JSON.stringify(envelope))
  }

  clear(): void {
    rmSync(this.path(), { force: true })
  }
}
