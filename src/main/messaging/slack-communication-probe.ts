import {
  DEFAULT_SLACK_API_BASE_URL,
  type CommunicationEndpointTrust,
  type SlackCommunicationWorkspace
} from '../../shared/communication-integrations'
import {
  assertCommunicationEndpointTrust,
  CommunicationApiError,
  normalizeCommunicationApiEndpoint,
  requestCommunicationApi,
  type CommunicationApiRequestDependencies
} from './communication-api-endpoint'

export type SlackCommunicationProbeParams = {
  baseUrl: string
  endpointTrust: CommunicationEndpointTrust
  appToken: string
  userToken: string
}

export type SlackCommunicationProbeResult = {
  workspace: SlackCommunicationWorkspace
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function requiredString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function providerHttpError(statusCode: number): CommunicationApiError {
  if (statusCode === 401) {
    return new CommunicationApiError('unauthorized', 'Slack rejected the credentials.')
  }
  if (statusCode === 403) {
    return new CommunicationApiError('forbidden', 'Slack denied the requested operation.')
  }
  if (statusCode === 429) {
    return new CommunicationApiError('rate_limited', 'Slack rate-limited the verification.')
  }
  if (statusCode >= 500) {
    return new CommunicationApiError('provider_unavailable', 'Slack is unavailable.')
  }
  return new CommunicationApiError('provider_rejected', 'Slack rejected the verification.')
}

function assertSuccess(statusCode: number, body: unknown): Record<string, unknown> {
  if (statusCode < 200 || statusCode >= 300) {
    throw providerHttpError(statusCode)
  }
  const payload = record(body)
  if (!payload) {
    throw new CommunicationApiError('invalid_response', 'Slack returned an invalid response.')
  }
  if (payload.ok !== true) {
    const providerCode = typeof payload.error === 'string' ? payload.error : ''
    if (
      providerCode === 'invalid_auth' ||
      providerCode === 'not_authed' ||
      providerCode === 'account_inactive' ||
      providerCode === 'token_revoked'
    ) {
      throw new CommunicationApiError('unauthorized', 'Slack rejected the credentials.')
    }
    if (providerCode === 'missing_scope' || providerCode === 'not_allowed_token_type') {
      throw new CommunicationApiError('forbidden', 'Slack denied the requested operation.')
    }
    if (providerCode === 'ratelimited') {
      throw new CommunicationApiError('rate_limited', 'Slack rate-limited the verification.')
    }
    throw new CommunicationApiError('provider_rejected', 'Slack rejected the verification.')
  }
  return payload
}

function validateTokens(appToken: string, userToken: string): void {
  if (
    !appToken.startsWith('xapp-') ||
    !userToken.startsWith('xoxp-') ||
    userToken.startsWith('xoxb-')
  ) {
    throw new CommunicationApiError(
      'invalid_configuration',
      'Slack requires an xapp app token and an xoxp user token.'
    )
  }
}

function assertSocketModeUrl(payload: Record<string, unknown>): void {
  const value = requiredString(payload.url)
  let url: URL
  try {
    url = new URL(value ?? '')
  } catch {
    throw new CommunicationApiError('invalid_response', 'Slack returned an invalid response.')
  }
  if (url.protocol !== 'wss:') {
    throw new CommunicationApiError('invalid_response', 'Slack returned an invalid response.')
  }
}

export async function probeSlackCommunicationIntegration(
  params: SlackCommunicationProbeParams,
  dependencies: CommunicationApiRequestDependencies = {}
): Promise<SlackCommunicationProbeResult> {
  validateTokens(params.appToken, params.userToken)
  const endpoint = normalizeCommunicationApiEndpoint(params.baseUrl)
  assertCommunicationEndpointTrust(endpoint, params.endpointTrust, DEFAULT_SLACK_API_BASE_URL)
  const formHeaders = { 'content-type': 'application/x-www-form-urlencoded' }
  const auth = await requestCommunicationApi(
    {
      endpoint,
      endpointTrust: params.endpointTrust,
      defaultBaseUrl: DEFAULT_SLACK_API_BASE_URL,
      method: 'POST',
      path: 'auth.test',
      headers: { ...formHeaders, authorization: `Bearer ${params.userToken}` },
      body: ''
    },
    dependencies
  )
  const authPayload = assertSuccess(auth.statusCode, auth.body)
  const teamId = requiredString(authPayload.team_id)
  const userId = requiredString(authPayload.user_id)
  if (!teamId || !userId) {
    throw new CommunicationApiError('invalid_response', 'Slack returned an invalid response.')
  }
  const socket = await requestCommunicationApi(
    {
      endpoint,
      endpointTrust: params.endpointTrust,
      defaultBaseUrl: DEFAULT_SLACK_API_BASE_URL,
      method: 'POST',
      path: 'apps.connections.open',
      headers: { ...formHeaders, authorization: `Bearer ${params.appToken}` },
      body: ''
    },
    dependencies
  )
  assertSocketModeUrl(assertSuccess(socket.statusCode, socket.body))
  return {
    workspace: {
      teamId,
      teamName: requiredString(authPayload.team),
      userId,
      userName: requiredString(authPayload.user)
    }
  }
}
