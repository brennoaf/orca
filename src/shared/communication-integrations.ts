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
}

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

export type SaveCommunicationIntegrationParams =
  | SaveDiscordCommunicationIntegrationParams
  | SaveSlackCommunicationIntegrationParams
  | SaveZApiCommunicationIntegrationParams
