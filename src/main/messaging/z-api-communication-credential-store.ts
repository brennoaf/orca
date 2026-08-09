import type {
  CommunicationIntegrationRedactedError,
  CommunicationSecretMutation,
  ZApiCommunicationIntegrationStatus
} from '../../shared/communication-integrations'
import { DEFAULT_Z_API_BASE_URL } from '../../shared/communication-integrations'
import {
  applyCommunicationSecretMutation,
  CommunicationIntegrationCredentialFile,
  parseCommunicationIntegrationRedactedError
} from './communication-integration-credential-file'
import { normalizeCommunicationApiEndpoint } from './communication-api-endpoint'

type ZApiCommunicationVerification = {
  verifiedAt: string
  connected: boolean
}

export type ZApiCommunicationCredentials = {
  version: 1
  provider: 'z-api'
  instanceId: string | null
  instanceToken: string | null
  clientToken: string | null
  baseUrl: string
  trustedCustomAuthority: string | null
  verification: ZApiCommunicationVerification | null
  lastError: CommunicationIntegrationRedactedError | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseOptionalString(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseVerification(value: unknown): ZApiCommunicationVerification | null | undefined {
  if (value === null) {
    return null
  }
  if (
    !isRecord(value) ||
    typeof value.verifiedAt !== 'string' ||
    value.verifiedAt.length === 0 ||
    typeof value.connected !== 'boolean'
  ) {
    return undefined
  }
  return { verifiedAt: value.verifiedAt, connected: value.connected }
}

function parseZApiCredentials(value: unknown): ZApiCommunicationCredentials | null {
  if (!isRecord(value) || value.version !== 1 || value.provider !== 'z-api') {
    return null
  }
  const instanceId = parseOptionalString(value.instanceId)
  const instanceToken = parseOptionalString(value.instanceToken)
  const clientToken = parseOptionalString(value.clientToken)
  const baseUrl = parseOptionalString(value.baseUrl)
  const trustedCustomAuthority = parseOptionalString(value.trustedCustomAuthority)
  const verification = parseVerification(value.verification)
  const lastError =
    value.lastError === null ? null : parseCommunicationIntegrationRedactedError(value.lastError)
  let endpointValid = false
  if (baseUrl && trustedCustomAuthority !== undefined) {
    try {
      const normalized = normalizeCommunicationApiEndpoint(baseUrl)
      const defaultAuthority = normalizeCommunicationApiEndpoint(DEFAULT_Z_API_BASE_URL).authority
      endpointValid =
        normalized.baseUrl === baseUrl &&
        (trustedCustomAuthority === null
          ? normalized.authority === defaultAuthority
          : normalized.authority === trustedCustomAuthority)
    } catch {
      endpointValid = false
    }
  }
  if (
    instanceId === undefined ||
    instanceToken === undefined ||
    clientToken === undefined ||
    !baseUrl ||
    trustedCustomAuthority === undefined ||
    verification === undefined ||
    (lastError === null && value.lastError !== null) ||
    !endpointValid
  ) {
    return null
  }
  return {
    version: 1,
    provider: 'z-api',
    instanceId,
    instanceToken,
    clientToken,
    baseUrl,
    trustedCustomAuthority,
    verification,
    lastError
  }
}

const credentialFile = new CommunicationIntegrationCredentialFile(
  'z-api-communication-credentials.json.enc',
  parseZApiCredentials
)

export function readZApiCommunicationCredentials(): ZApiCommunicationCredentials | null {
  const result = credentialFile.read()
  return result.state === 'present' ? result.value : null
}

export function saveZApiCommunicationCredentials(args: {
  baseUrl: string
  trustedCustomAuthority: string | null
  instanceId: string
  instanceToken: CommunicationSecretMutation
  clientToken: CommunicationSecretMutation
}): ZApiCommunicationCredentials {
  const current = readZApiCommunicationCredentials()
  const next: ZApiCommunicationCredentials = {
    version: 1,
    provider: 'z-api',
    instanceId: args.instanceId,
    instanceToken: applyCommunicationSecretMutation(
      current?.instanceToken ?? null,
      args.instanceToken
    ),
    clientToken: applyCommunicationSecretMutation(current?.clientToken ?? null, args.clientToken),
    baseUrl: args.baseUrl,
    trustedCustomAuthority: args.trustedCustomAuthority,
    verification: null,
    lastError: null
  }
  credentialFile.write(next)
  return next
}

export function saveZApiCommunicationVerification(
  connected: boolean,
  verifiedAt: string
): ZApiCommunicationCredentials {
  const current = readZApiCommunicationCredentials()
  if (!current) {
    throw new Error('Z-API communication credentials are not configured')
  }
  const next: ZApiCommunicationCredentials = {
    ...current,
    verification: { verifiedAt, connected },
    lastError: null
  }
  credentialFile.write(next)
  return next
}

export function saveZApiCommunicationError(
  lastError: CommunicationIntegrationRedactedError
): ZApiCommunicationCredentials | null {
  const current = readZApiCommunicationCredentials()
  if (!current) {
    return null
  }
  const next: ZApiCommunicationCredentials = { ...current, verification: null, lastError }
  credentialFile.write(next)
  return next
}

export function clearZApiCommunicationCredentials(): void {
  credentialFile.clear()
}

export function getZApiCommunicationStatus(): ZApiCommunicationIntegrationStatus {
  const stored = readZApiCommunicationCredentials()
  const configured = Boolean(stored?.instanceId && stored.instanceToken && stored.clientToken)
  const verification = configured ? (stored?.verification ?? null) : null
  const normalized = normalizeCommunicationApiEndpoint(stored?.baseUrl ?? DEFAULT_Z_API_BASE_URL)
  return {
    provider: 'z-api',
    endpoint: {
      baseUrl: normalized.baseUrl,
      authority: normalized.authority,
      trust: stored?.trustedCustomAuthority
        ? { kind: 'custom', authority: stored.trustedCustomAuthority }
        : { kind: 'default' }
    },
    readiness: {
      configured,
      verified: verification !== null,
      sendReady: false,
      receiveReady: false,
      verifiedAt: verification?.verifiedAt ?? null,
      lastError: stored?.lastError ?? null
    },
    instanceId: stored?.instanceId ?? null,
    instanceTokenStored: stored?.instanceToken !== null && stored !== null,
    clientTokenStored: stored?.clientToken !== null && stored !== null,
    instanceConnected: verification?.connected ?? null,
    smartphoneConnected: null,
    ingressPrepared: false,
    listenPort: null,
    localTunnelTarget: null,
    publicWebhookBaseUrl: null,
    publicIngressVerified: false,
    webhooksConfigured: false,
    listeningValidation: {
      state: 'not_started',
      attemptId: null,
      code: null,
      deadline: null,
      remainingMs: null,
      confirmedAt: null,
      error: null
    },
    lastErrorCode: stored?.lastError?.code ?? null
  }
}

export function emptyZApiCommunicationStatus(
  lastError: CommunicationIntegrationRedactedError | null = null
): ZApiCommunicationIntegrationStatus {
  const normalized = normalizeCommunicationApiEndpoint(DEFAULT_Z_API_BASE_URL)
  return {
    provider: 'z-api',
    endpoint: {
      baseUrl: normalized.baseUrl,
      authority: normalized.authority,
      trust: { kind: 'default' }
    },
    readiness: {
      configured: false,
      verified: false,
      sendReady: false,
      receiveReady: false,
      verifiedAt: null,
      lastError
    },
    instanceId: null,
    instanceTokenStored: false,
    clientTokenStored: false,
    instanceConnected: null,
    smartphoneConnected: null,
    ingressPrepared: false,
    listenPort: null,
    localTunnelTarget: null,
    publicWebhookBaseUrl: null,
    publicIngressVerified: false,
    webhooksConfigured: false,
    listeningValidation: {
      state: 'not_started',
      attemptId: null,
      code: null,
      deadline: null,
      remainingMs: null,
      confirmedAt: null,
      error: null
    },
    lastErrorCode: lastError?.code ?? null
  }
}
