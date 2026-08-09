import type { CommunicationEndpointTrust } from '../../shared/communication-integrations'
import { CommunicationApiError } from './communication-api-endpoint'
import type { MessageStore } from './message-store'
import type {
  ZApiInstanceStatus,
  ZApiInstanceWebhookState,
  ZApiRestorableWebhookState,
  ZApiSendTextParams,
  ZApiSendTextResult
} from './z-api-communication-client-contract'
import type {
  ZApiTransactionConfiguration,
  ZApiTransactionJournalState
} from './z-api-transaction-journal'

const REQUIRED_WEBHOOK_FIELDS = [
  'connectedCallbackUrl',
  'deliveryCallbackUrl',
  'disconnectedCallbackUrl',
  'messageStatusCallbackUrl',
  'presenceChatCallbackUrl',
  'receivedAndDeliveryCallbackUrl',
  'receivedCallbackUrl',
  'receivedStatusCallbackUrl'
] as const

export type ZApiTransactionErrorCode =
  | 'invalid_configuration'
  | 'not_configured'
  | 'provider_unavailable'
  | 'receiver_unavailable'
  | 'webhook_challenge_failed'
  | 'webhook_state_conflict'
  | 'webhook_restore_failed'
  | 'ambiguous_send'
  | 'message_persistence_failed'

export class ZApiTransactionError extends Error {
  constructor(
    readonly code: ZApiTransactionErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'ZApiTransactionError'
  }
}

export type ZApiPreparedIngress = {
  listenPort: number
  localTunnelTarget: string
}

export type ZApiSaveAndConfigureParams = {
  instanceId: string
  instanceToken: string
  clientToken: string
  baseUrl: string
  endpointTrust: CommunicationEndpointTrust
  publicWebhookBaseUrl: string
  listenPort: number
  preparedIngress: ZApiPreparedIngress
}

export type ZApiTransactionStatus = {
  configured: boolean
  verified: boolean
  sendReady: boolean
  receiveReady: boolean
  connected: boolean | null
  smartphoneConnected: boolean | null
  ingress: {
    prepared: boolean
    listenPort: number | null
    challengeVerified: boolean
    webhooksVerified: boolean
  }
  lastErrorCode: ZApiTransactionErrorCode | null
}

export type ZApiReceiverEndpoint = {
  host: '127.0.0.1'
  port: number
  path: string
}

export type ZApiReceiverController = {
  start: () => Promise<ZApiReceiverEndpoint>
  stop: () => Promise<void>
  armChallenge: (nonce: string) => void
  setExpectedInstanceId: (instanceId: string | null) => void
}

export type ZApiTransactionClient = {
  getStatus: () => Promise<ZApiInstanceStatus>
  getInstanceWebhookState: () => Promise<ZApiInstanceWebhookState>
  getRestorableWebhookState: () => Promise<ZApiRestorableWebhookState>
  clearWebhookFilters: () => Promise<void>
  setEveryWebhooks: (publicWebhookUrl: string, notifySentByMe: boolean) => Promise<void>
  restoreEveryWebhooks: (state: ZApiRestorableWebhookState) => Promise<void>
  sendText: (params: ZApiSendTextParams) => Promise<ZApiSendTextResult>
}

export type ZApiTransactionJournalPort = {
  read: () => ZApiTransactionJournalState
  write: (state: ZApiTransactionJournalState) => void
  clear: () => void
}

export type ZApiTransactionMessageStore = Pick<
  MessageStore,
  | 'getReplyDestination'
  | 'registerOutboundPending'
  | 'markOutboundSent'
  | 'markOutboundUnknown'
  | 'markOutboundFailed'
>

export type ZApiTransactionServiceDependencies = {
  journal: ZApiTransactionJournalPort
  messageStore: ZApiTransactionMessageStore
  createReceiver: (args: { port: number; path: string }) => ZApiReceiverController
  createClient: (configuration: ZApiTransactionConfiguration) => ZApiTransactionClient
  verifyChallenge: (args: { publicWebhookUrl: string; nonce: string }) => Promise<void>
  now?: () => number
  randomPath?: () => string
  randomNonce?: () => string
  randomClientMessageId?: () => string
}

export function emptyZApiTransactionStatus(): ZApiTransactionStatus {
  return {
    configured: false,
    verified: false,
    sendReady: false,
    receiveReady: false,
    connected: null,
    smartphoneConnected: null,
    ingress: {
      prepared: false,
      listenPort: null,
      challengeVerified: false,
      webhooksVerified: false
    },
    lastErrorCode: null
  }
}

export function validZApiSecret(value: string): boolean {
  return (
    value.length > 0 &&
    value.trim() === value &&
    [...value].every((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint >= 32 && codePoint !== 127
    })
  )
}

export function zApiFullWebhookUrl(configuration: ZApiTransactionConfiguration): string {
  return `${configuration.publicWebhookBaseUrl}${configuration.secretPath}`
}

export function matchesZApiWebhookState(
  state: ZApiInstanceWebhookState,
  expectedUrl: string,
  notifySentByMe: boolean
): boolean {
  return (
    REQUIRED_WEBHOOK_FIELDS.every((field) => state[field] === expectedUrl) &&
    state.receiveCallbackSentByMe === notifySentByMe
  )
}

export function zApiTransactionErrorCode(error: unknown): ZApiTransactionErrorCode {
  if (error instanceof ZApiTransactionError) {
    return error.code
  }
  if (error instanceof CommunicationApiError) {
    if (error.code === 'invalid_configuration') {
      return 'invalid_configuration'
    }
    if (error.code === 'webhook_state_conflict') {
      return 'webhook_state_conflict'
    }
    if (error.code === 'provider_unavailable') {
      return 'provider_unavailable'
    }
  }
  return 'provider_unavailable'
}
