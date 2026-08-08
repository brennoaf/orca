import type {
  CommunicationIntegrationRedactedError,
  CommunicationSecretMutation,
  SlackCommunicationIntegrationStatus,
  SlackCommunicationWorkspace
} from '../../shared/communication-integrations'
import { DEFAULT_SLACK_API_BASE_URL } from '../../shared/communication-integrations'
import {
  applyCommunicationSecretMutation,
  CommunicationIntegrationCredentialFile,
  parseCommunicationIntegrationRedactedError
} from './communication-integration-credential-file'
import { normalizeCommunicationApiEndpoint } from './communication-api-endpoint'

type SlackCommunicationVerification = {
  verifiedAt: string
  workspace: SlackCommunicationWorkspace
}

export type SlackCommunicationCredentials = {
  version: 1
  provider: 'slack'
  appToken: string | null
  userToken: string | null
  baseUrl: string
  trustedCustomAuthority: string | null
  verification: SlackCommunicationVerification | null
  lastError: CommunicationIntegrationRedactedError | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseOptionalString(value: unknown): string | null | undefined {
  return value === null ? null : typeof value === 'string' && value.length > 0 ? value : undefined
}

function parseWorkspace(value: unknown): SlackCommunicationWorkspace | null {
  if (!isRecord(value)) {
    return null
  }
  const teamId = parseOptionalString(value.teamId)
  const teamName = parseOptionalString(value.teamName)
  const userId = parseOptionalString(value.userId)
  const userName = parseOptionalString(value.userName)
  if (!teamId || teamName === undefined || !userId || userName === undefined) {
    return null
  }
  return { teamId, teamName, userId, userName }
}

function parseVerification(value: unknown): SlackCommunicationVerification | null | undefined {
  if (value === null) {
    return null
  }
  if (!isRecord(value) || typeof value.verifiedAt !== 'string' || value.verifiedAt.length === 0) {
    return undefined
  }
  const workspace = parseWorkspace(value.workspace)
  return workspace ? { verifiedAt: value.verifiedAt, workspace } : undefined
}

function parseSlackCredentials(value: unknown): SlackCommunicationCredentials | null {
  if (!isRecord(value) || value.version !== 1 || value.provider !== 'slack') {
    return null
  }
  const appToken = parseOptionalString(value.appToken)
  const userToken = parseOptionalString(value.userToken)
  const baseUrl = parseOptionalString(value.baseUrl)
  const trustedCustomAuthority = parseOptionalString(value.trustedCustomAuthority)
  const verification = parseVerification(value.verification)
  const lastError =
    value.lastError === null ? null : parseCommunicationIntegrationRedactedError(value.lastError)
  let endpointValid = false
  if (baseUrl && trustedCustomAuthority !== undefined) {
    try {
      const normalized = normalizeCommunicationApiEndpoint(baseUrl)
      const defaultAuthority = normalizeCommunicationApiEndpoint(
        DEFAULT_SLACK_API_BASE_URL
      ).authority
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
    appToken === undefined ||
    userToken === undefined ||
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
    provider: 'slack',
    appToken,
    userToken,
    baseUrl,
    trustedCustomAuthority,
    verification,
    lastError
  }
}

const credentialFile = new CommunicationIntegrationCredentialFile(
  'slack-communication-credentials.json.enc',
  parseSlackCredentials
)

export function readSlackCommunicationCredentials(): SlackCommunicationCredentials | null {
  const result = credentialFile.read()
  return result.state === 'present' ? result.value : null
}

export function saveSlackCommunicationCredentials(args: {
  baseUrl: string
  trustedCustomAuthority: string | null
  appToken: CommunicationSecretMutation
  userToken: CommunicationSecretMutation
}): SlackCommunicationCredentials {
  const current = readSlackCommunicationCredentials()
  const next: SlackCommunicationCredentials = {
    version: 1,
    provider: 'slack',
    appToken: applyCommunicationSecretMutation(current?.appToken ?? null, args.appToken),
    userToken: applyCommunicationSecretMutation(current?.userToken ?? null, args.userToken),
    baseUrl: args.baseUrl,
    trustedCustomAuthority: args.trustedCustomAuthority,
    verification: null,
    lastError: null
  }
  credentialFile.write(next)
  return next
}

export function saveSlackCommunicationVerification(
  workspace: SlackCommunicationWorkspace,
  verifiedAt: string
): SlackCommunicationCredentials {
  const current = readSlackCommunicationCredentials()
  if (!current) {
    throw new Error('Slack communication credentials are not configured')
  }
  const next: SlackCommunicationCredentials = {
    ...current,
    verification: { verifiedAt, workspace },
    lastError: null
  }
  credentialFile.write(next)
  return next
}

export function saveSlackCommunicationError(
  lastError: CommunicationIntegrationRedactedError
): SlackCommunicationCredentials | null {
  const current = readSlackCommunicationCredentials()
  if (!current) {
    return null
  }
  const next: SlackCommunicationCredentials = { ...current, verification: null, lastError }
  credentialFile.write(next)
  return next
}

export function clearSlackCommunicationCredentials(): void {
  credentialFile.clear()
}

export function getSlackCommunicationStatus(): SlackCommunicationIntegrationStatus {
  const stored = readSlackCommunicationCredentials()
  const configured = stored?.appToken !== null && stored?.userToken !== null && stored !== null
  const verification = configured ? (stored?.verification ?? null) : null
  const normalized = normalizeCommunicationApiEndpoint(
    stored?.baseUrl ?? DEFAULT_SLACK_API_BASE_URL
  )
  return {
    provider: 'slack',
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
    appTokenStored: stored?.appToken !== null && stored !== null,
    userTokenStored: stored?.userToken !== null && stored !== null,
    workspace: verification?.workspace ?? null
  }
}

export function emptySlackCommunicationStatus(
  lastError: CommunicationIntegrationRedactedError | null = null
): SlackCommunicationIntegrationStatus {
  const normalized = normalizeCommunicationApiEndpoint(DEFAULT_SLACK_API_BASE_URL)
  return {
    provider: 'slack',
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
    appTokenStored: false,
    userTokenStored: false,
    workspace: null
  }
}
