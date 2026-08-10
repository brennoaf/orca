export const DEFAULT_SLACK_API_BASE_URL = 'https://slack.com/api'
export const DEFAULT_Z_API_BASE_URL = 'https://api.z-api.io'

export const COMMUNICATION_INTEGRATION_SECTION_IDS = {
  discord: 'integrations-communications-discord',
  slack: 'integrations-communications-slack',
  'z-api': 'integrations-communications-z-api'
} as const

export type CommunicationProviderId = 'discord' | 'slack' | 'z-api'

export type CommunicationSecretMutation =
  | { action: 'keep' }
  | { action: 'replace'; value: string }
  | { action: 'clear' }

export type CommunicationEndpointTrust = { kind: 'default' } | { kind: 'custom'; authority: string }

export type CommunicationApiEndpoint = {
  baseUrl: string
  authority: string
  hostname: string
  port: string
}

export type CommunicationResolvedAddress = { address: string; family: 4 | 6 }

export type CommunicationApiResponse = { statusCode: number; body: unknown }

export type CommunicationIntegrationErrorCode =
  | 'not_configured'
  | 'invalid_configuration'
  | 'endpoint_confirmation_required'
  | 'endpoint_invalid'
  | 'endpoint_blocked'
  | 'endpoint_dns_failed'
  | 'secure_storage_unavailable'
  | 'secure_storage_read_failed'
  | 'timeout'
  | 'redirect_rejected'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'provider_rejected'
  | 'invalid_response'
  | 'webhook_state_conflict'
  | 'receiver_unavailable'
  | 'active_ingress_locked'
  | 'webhook_challenge_failed'
  | 'webhook_restore_failed'
  | 'conversation_not_replyable'
  | 'ambiguous_send'
  | 'message_persistence_failed'
  | 'network_error'
  | 'provider_unavailable'

export type CommunicationIntegrationFieldName =
  | 'clientId'
  | 'clientSecret'
  | 'appToken'
  | 'userToken'
  | 'instanceId'
  | 'instanceToken'
  | 'clientToken'
  | 'baseUrl'

export type CommunicationIntegrationRedactedError = {
  code: CommunicationIntegrationErrorCode
  message: string
  field: CommunicationIntegrationFieldName | null
}

export type CommunicationEndpointStatus = {
  baseUrl: string
  authority: string
  trust: CommunicationEndpointTrust
}

export type CommunicationIntegrationReadiness = {
  configured: boolean
  verified: boolean
  sendReady: boolean
  receiveReady: boolean
  verifiedAt: string | null
  lastError: CommunicationIntegrationRedactedError | null
}

export type DiscordCommunicationIntegrationStatus = {
  provider: 'discord'
  endpoint: null
  readiness: CommunicationIntegrationReadiness
  clientId: string | null
  clientSecretStored: boolean
}

export type SlackCommunicationWorkspace = {
  teamId: string
  teamName: string | null
  userId: string
  userName: string | null
}

export type SlackCommunicationIntegrationStatus = {
  provider: 'slack'
  endpoint: CommunicationEndpointStatus
  readiness: CommunicationIntegrationReadiness
  appTokenStored: boolean
  userTokenStored: boolean
  workspace: SlackCommunicationWorkspace | null
}

export type ZApiCommunicationIntegrationStatus = {
  provider: 'z-api'
  endpoint: CommunicationEndpointStatus
  readiness: CommunicationIntegrationReadiness
  instanceId: string | null
  instanceTokenStored: boolean
  clientTokenStored: boolean
  instanceConnected: boolean | null
  smartphoneConnected: boolean | null
  ingressPrepared: boolean
  listenPort: number | null
  localTunnelTarget: string | null
  publicWebhookBaseUrl: string | null
  publicIngressVerified: boolean
  webhooksConfigured: boolean
  listeningValidation?: ZApiListeningValidationSnapshot
  lastErrorCode: CommunicationIntegrationErrorCode | null
}

type ZApiListeningValidationBase = {
  attemptId: string | null
  code: string | null
  deadline: string | null
  remainingMs: number | null
  confirmedAt: string | null
  error: CommunicationIntegrationRedactedError | null
}

export type ZApiListeningValidationSnapshot =
  | (ZApiListeningValidationBase & {
      state: 'not_started'
      attemptId: null
      code: null
      deadline: null
      remainingMs: null
      confirmedAt: null
      error: null
    })
  | (ZApiListeningValidationBase & {
      state: 'awaiting'
      attemptId: string
      code: string
      deadline: string
      remainingMs: number
      confirmedAt: null
      error: null
    })
  | (ZApiListeningValidationBase & {
      state: 'confirmed'
      attemptId: string
      code: null
      deadline: string
      remainingMs: 0
      confirmedAt: string
      error: null
    })
  | (ZApiListeningValidationBase & {
      state: 'expired' | 'cancelled'
      attemptId: string
      code: null
      deadline: string
      remainingMs: 0
      confirmedAt: null
      error: null
    })
  | (ZApiListeningValidationBase & {
      state: 'failed'
      attemptId: null
      code: null
      deadline: null
      remainingMs: null
      confirmedAt: null
      error: CommunicationIntegrationRedactedError
    })

export type CommunicationIntegrationStatus =
  | DiscordCommunicationIntegrationStatus
  | SlackCommunicationIntegrationStatus
  | ZApiCommunicationIntegrationStatus

export type CommunicationIntegrationOperationResult =
  | { ok: true; status: CommunicationIntegrationStatus }
  | {
      ok: false
      status: CommunicationIntegrationStatus
      error: CommunicationIntegrationRedactedError
    }

export type SaveDiscordCommunicationIntegrationParams = {
  provider: 'discord'
  clientId: string
  clientSecret: CommunicationSecretMutation
}

export type SaveSlackCommunicationIntegrationParams = {
  provider: 'slack'
  baseUrl: string
  endpointTrust: CommunicationEndpointTrust
  appToken: CommunicationSecretMutation
  userToken: CommunicationSecretMutation
}

export type SaveZApiCommunicationIntegrationParams = {
  provider: 'z-api'
  baseUrl: string
  endpointTrust: CommunicationEndpointTrust
  instanceId: string
  instanceToken: CommunicationSecretMutation
  clientToken: CommunicationSecretMutation
}

export type ZApiSecretMutation = { action: 'keep' } | { action: 'replace'; value: string }

export type SaveAndConfigureZApiParams = {
  instanceId: string
  instanceToken: ZApiSecretMutation
  clientToken: ZApiSecretMutation
  apiBaseUrl: string
  endpointTrust: CommunicationEndpointTrust
  publicWebhookBaseUrl: string
  listenPort: number
}

export type ZApiPreparedIngressSnapshot = {
  listenPort: number
  localTunnelTarget: string
}

export type ZApiConversationKind = 'group' | 'private' | 'newsletter' | 'broadcast' | 'unknown'

export type ZApiConversationSnapshot = {
  id: number
  conversationKind: ZApiConversationKind
  displayName: string | null
  lastMessageAt: number
}

export type ZApiMessageSnapshot = {
  id: number
  conversationId: number
  providerMessageId: string | null
  senderName: string | null
  direction: 'inbound' | 'outbound'
  contentKind: 'text' | 'unsupported'
  text: string | null
  providerContentType: string | null
  occurredAt: number
  deliveryStatus: 'received' | 'pending' | 'sent' | 'unknown' | 'failed'
}

export type ZApiConversationPage = {
  conversations: ZApiConversationSnapshot[]
  nextOffset: number | null
}

export type ZApiMessagePage = {
  messages: ZApiMessageSnapshot[]
  nextOffset: number | null
}

export type ZApiSendReplyResult = {
  providerMessageId: string
  deliveryStatus: 'sent'
}

export type ZApiCommunicationOperationResult<T = undefined> =
  | {
      ok: true
      status: ZApiCommunicationIntegrationStatus
      value: T
    }
  | {
      ok: false
      status: ZApiCommunicationIntegrationStatus
      error: CommunicationIntegrationRedactedError
    }

export type SaveCommunicationIntegrationParams =
  | SaveDiscordCommunicationIntegrationParams
  | SaveSlackCommunicationIntegrationParams
  | SaveZApiCommunicationIntegrationParams
