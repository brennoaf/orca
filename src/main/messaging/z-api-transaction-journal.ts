import type { CommunicationEndpointTrust } from '../../shared/communication-integrations'
import { CommunicationIntegrationCredentialFile } from './communication-integration-credential-file'
import { normalizeCommunicationApiEndpoint } from './communication-api-endpoint'
import type { ZApiRestorableWebhookState } from './z-api-communication-client-contract'

export type ZApiTransactionConfiguration = {
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

function parseConfiguration(value: unknown): ZApiTransactionConfiguration | null {
  if (!isRecord(value)) {
    return null
  }
  const instanceId = nonEmptyString(value.instanceId)
  const instanceToken = nonEmptyString(value.instanceToken)
  const clientToken = nonEmptyString(value.clientToken)
  const baseUrl = nonEmptyString(value.baseUrl)
  const endpointTrust = parseEndpointTrust(value.endpointTrust)
  const publicWebhookBaseUrl = nonEmptyString(value.publicWebhookBaseUrl)
  const secretPath = nonEmptyString(value.secretPath)
  const listenPort = value.listenPort
  if (
    !instanceId ||
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
    instanceId,
    instanceToken,
    clientToken,
    baseUrl,
    endpointTrust,
    publicWebhookBaseUrl,
    secretPath,
    listenPort: listenPort as number
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

function parseActive(value: unknown): ZApiTransactionActive | null | undefined {
  if (value === null) {
    return null
  }
  if (!isRecord(value)) {
    return undefined
  }
  const configuration = parseConfiguration(value.configuration)
  const originalWebhookState = parsePreviousWebhookState(value.originalWebhookState)
  const verifiedAt = nonEmptyString(value.verifiedAt)
  return configuration && originalWebhookState && verifiedAt
    ? { configuration, originalWebhookState, verifiedAt }
    : undefined
}

function parsePending(value: unknown): ZApiTransactionPending | null | undefined {
  if (value === null) {
    return null
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
  const configuration = parseConfiguration(value.configuration)
  const rollbackWebhookState =
    value.rollbackWebhookState === null
      ? null
      : parsePreviousWebhookState(value.rollbackWebhookState)
  if (!phase || !configuration || rollbackWebhookState === null) {
    return phase === 'pre_mutation' && configuration && value.rollbackWebhookState === null
      ? { phase, configuration, rollbackWebhookState: null }
      : undefined
  }
  return { phase, configuration, rollbackWebhookState }
}

function parseState(value: unknown): ZApiTransactionJournalState | null {
  if (!isRecord(value) || value.version !== 1 || value.provider !== 'z-api') {
    return null
  }
  const active = parseActive(value.active)
  const pending = parsePending(value.pending)
  if (active === undefined || pending === undefined) {
    return null
  }
  return { version: 1, provider: 'z-api', active, pending }
}

export class ZApiTransactionJournal {
  private readonly file = new CommunicationIntegrationCredentialFile(
    'z-api-transaction-journal.json.enc',
    parseState
  )

  read(): ZApiTransactionJournalState {
    const result = this.file.read()
    return result.state === 'present' ? result.value : structuredClone(EMPTY_STATE)
  }

  write(state: ZApiTransactionJournalState): void {
    const parsed = parseState(state)
    if (!parsed) {
      throw new Error('Z-API transaction journal state is invalid.')
    }
    this.file.write(parsed)
  }

  clear(): void {
    this.file.clear()
  }
}
