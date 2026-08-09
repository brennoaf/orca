import { randomBytes } from 'node:crypto'
import type { CommunicationEndpointTrust } from '../../shared/communication-integrations'
import { CommunicationIntegrationCredentialFile } from './communication-integration-credential-file'
import { normalizeCommunicationApiEndpoint } from './communication-api-endpoint'
import type { ZApiRestorableWebhookState } from './z-api-communication-client-contract'

export type ZApiTransactionConfiguration = {
  configurationId: string
  instanceId: string
  instanceToken: string
  clientToken: string
  baseUrl: string
  endpointTrust: CommunicationEndpointTrust
  publicWebhookBaseUrl: string
  secretPath: string
  listenPort: number
}

export type ZApiTransactionActive = {
  configuration: ZApiTransactionConfiguration
  originalWebhookState: ZApiRestorableWebhookState
  verifiedAt: string
}

export type ZApiTransactionPendingPhase =
  | 'pre_mutation'
  | 'filters_clear_intent'
  | 'filters_cleared'
  | 'callback_mutation_intent'
  | 'repair_required'

export type ZApiTransactionPending = {
  phase: ZApiTransactionPendingPhase
  configuration: ZApiTransactionConfiguration
  rollbackWebhookState: ZApiRestorableWebhookState | null
}

export type ZApiTransactionJournalState = {
  version: 1
  provider: 'z-api'
  active: ZApiTransactionActive | null
  pending: ZApiTransactionPending | null
}

const EMPTY_STATE: ZApiTransactionJournalState = {
  version: 1,
  provider: 'z-api',
  active: null,
  pending: null
}

const migrationMarker = Symbol('z-api-transaction-journal-migration')
type ParsedJournalState = ZApiTransactionJournalState & { [migrationMarker]: boolean }
type ParsedConfiguration = {
  configuration: ZApiTransactionConfiguration
  migrated: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function parseEndpointTrust(value: unknown): CommunicationEndpointTrust | null {
  if (!isRecord(value)) {
    return null
  }
  if (value.kind === 'default') {
    return { kind: 'default' }
  }
  const authority = nonEmptyString(value.authority)
  return value.kind === 'custom' && authority ? { kind: 'custom', authority } : null
}

function parseConfiguration(value: unknown): ParsedConfiguration | null {
  if (!isRecord(value)) {
    return null
  }
  const instanceId = nonEmptyString(value.instanceId)
  const storedConfigurationId = nonEmptyString(value.configurationId)
  const configurationId = storedConfigurationId ?? randomBytes(16).toString('hex')
  const instanceToken = nonEmptyString(value.instanceToken)
  const clientToken = nonEmptyString(value.clientToken)
  const baseUrl = nonEmptyString(value.baseUrl)
  const endpointTrust = parseEndpointTrust(value.endpointTrust)
  const publicWebhookBaseUrl = nonEmptyString(value.publicWebhookBaseUrl)
  const secretPath = nonEmptyString(value.secretPath)
  const listenPort = value.listenPort
  if (
    !instanceId ||
    !/^[a-f0-9]{32}$/u.test(configurationId) ||
    !instanceToken ||
    !clientToken ||
    !baseUrl ||
    !endpointTrust ||
    !publicWebhookBaseUrl ||
    !secretPath ||
    !Number.isSafeInteger(listenPort) ||
    (listenPort as number) < 1 ||
    (listenPort as number) > 65_535 ||
    !/^\/[A-Za-z0-9/_-]+$/u.test(secretPath)
  ) {
    return null
  }
  try {
    if (
      normalizeCommunicationApiEndpoint(baseUrl).baseUrl !== baseUrl ||
      normalizeCommunicationApiEndpoint(publicWebhookBaseUrl).baseUrl !== publicWebhookBaseUrl
    ) {
      return null
    }
  } catch {
    return null
  }
  return {
    configuration: {
      configurationId,
      instanceId,
      instanceToken,
      clientToken,
      baseUrl,
      endpointTrust,
      publicWebhookBaseUrl,
      secretPath,
      listenPort: listenPort as number
    },
    migrated: storedConfigurationId === null
  }
}

function parsePreviousWebhookState(value: unknown): ZApiRestorableWebhookState | null {
  if (!isRecord(value)) {
    return null
  }
  const webhookUrl = nonEmptyString(value.webhookUrl)
  if (!webhookUrl || typeof value.receiveCallbackSentByMe !== 'boolean') {
    return null
  }
  try {
    if (normalizeCommunicationApiEndpoint(webhookUrl).baseUrl !== webhookUrl) {
      return null
    }
  } catch {
    return null
  }
  return { webhookUrl, receiveCallbackSentByMe: value.receiveCallbackSentByMe }
}

function parseActive(
  value: unknown
): { active: ZApiTransactionActive | null; migrated: boolean } | undefined {
  if (value === null) {
    return { active: null, migrated: false }
  }
  if (!isRecord(value)) {
    return undefined
  }
  const parsedConfiguration = parseConfiguration(value.configuration)
  const originalWebhookState = parsePreviousWebhookState(value.originalWebhookState)
  const verifiedAt = nonEmptyString(value.verifiedAt)
  return parsedConfiguration && originalWebhookState && verifiedAt
    ? {
        active: {
          configuration: parsedConfiguration.configuration,
          originalWebhookState,
          verifiedAt
        },
        migrated: parsedConfiguration.migrated
      }
    : undefined
}

function parsePending(
  value: unknown
): { pending: ZApiTransactionPending | null; migrated: boolean } | undefined {
  if (value === null) {
    return { pending: null, migrated: false }
  }
  if (!isRecord(value)) {
    return undefined
  }
  const phase = [
    'pre_mutation',
    'filters_clear_intent',
    'filters_cleared',
    'callback_mutation_intent',
    'repair_required'
  ].find((candidate) => candidate === value.phase) as ZApiTransactionPendingPhase | undefined
  const parsedConfiguration = parseConfiguration(value.configuration)
  const rollbackWebhookState =
    value.rollbackWebhookState === null
      ? null
      : parsePreviousWebhookState(value.rollbackWebhookState)
  if (!phase || !parsedConfiguration || rollbackWebhookState === null) {
    return phase === 'pre_mutation' && parsedConfiguration && value.rollbackWebhookState === null
      ? {
          pending: {
            phase,
            configuration: parsedConfiguration.configuration,
            rollbackWebhookState: null
          },
          migrated: parsedConfiguration.migrated
        }
      : undefined
  }
  return {
    pending: { phase, configuration: parsedConfiguration.configuration, rollbackWebhookState },
    migrated: parsedConfiguration.migrated
  }
}

function parseState(value: unknown): ParsedJournalState | null {
  if (!isRecord(value) || value.version !== 1 || value.provider !== 'z-api') {
    return null
  }
  const parsedActive = parseActive(value.active)
  const parsedPending = parsePending(value.pending)
  if (!parsedActive || !parsedPending) {
    return null
  }
  const state = {
    version: 1 as const,
    provider: 'z-api' as const,
    active: parsedActive.active,
    pending: parsedPending.pending
  } as ParsedJournalState
  Object.defineProperty(state, migrationMarker, {
    value: parsedActive.migrated || parsedPending.migrated,
    enumerable: false
  })
  return state
}

export class ZApiTransactionJournal {
  private readonly file = new CommunicationIntegrationCredentialFile<ParsedJournalState>(
    'z-api-transaction-journal.json.enc',
    parseState
  )

  read(): ZApiTransactionJournalState {
    const result = this.file.read()
    if (result.state === 'absent') {
      return structuredClone(EMPTY_STATE)
    }
    if (result.value[migrationMarker]) {
      this.file.write(result.value)
    }
    return structuredClone(result.value)
  }

  write(state: ZApiTransactionJournalState): void {
    const parsed = parseState(state)
    if (!parsed) {
      throw new Error('Z-API transaction journal state is invalid.')
    }
    if (parsed[migrationMarker]) {
      throw new Error('Z-API transaction journal state is invalid.')
    }
    this.file.write(parsed)
  }

  clear(): void {
    this.file.clear()
  }
}
