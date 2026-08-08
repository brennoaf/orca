import {
  DEFAULT_Z_API_BASE_URL,
  type CommunicationEndpointTrust
} from '../../shared/communication-integrations'
import {
  assertCommunicationEndpointTrust,
  CommunicationApiError,
  normalizeCommunicationApiEndpoint,
  requestCommunicationApi,
  type CommunicationApiRequestDependencies
} from './communication-api-endpoint'

export type ZApiCommunicationProbeParams = {
  baseUrl: string
  endpointTrust: CommunicationEndpointTrust
  instanceId: string
  instanceToken: string
  clientToken: string
}

export type ZApiCommunicationProbeResult = {
  instanceConnected: boolean
}

function providerHttpError(statusCode: number): CommunicationApiError {
  if (statusCode === 401) {
    return new CommunicationApiError('unauthorized', 'Z-API rejected the credentials.')
  }
  if (statusCode === 403) {
    return new CommunicationApiError('forbidden', 'Z-API denied the requested operation.')
  }
  if (statusCode === 429) {
    return new CommunicationApiError('rate_limited', 'Z-API rate-limited the verification.')
  }
  if (statusCode >= 500) {
    return new CommunicationApiError('provider_unavailable', 'Z-API is unavailable.')
  }
  return new CommunicationApiError('provider_rejected', 'Z-API rejected the verification.')
}

function validateParams(params: ZApiCommunicationProbeParams): void {
  const invalidPathField = (value: string): boolean => {
    const hasControl = [...value].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0
      return codePoint < 32 || codePoint === 127
    })
    return value === '.' || value === '..' || /[\s/\\]/u.test(value) || hasControl
  }
  if (
    !params.clientToken ||
    !params.instanceId ||
    !params.instanceToken ||
    invalidPathField(params.instanceId) ||
    invalidPathField(params.instanceToken)
  ) {
    throw new CommunicationApiError(
      'invalid_configuration',
      'Z-API requires the instance ID, instance token, and client token.'
    )
  }
}

export async function probeZApiCommunicationIntegration(
  params: ZApiCommunicationProbeParams,
  dependencies: CommunicationApiRequestDependencies = {}
): Promise<ZApiCommunicationProbeResult> {
  validateParams(params)
  const endpoint = normalizeCommunicationApiEndpoint(params.baseUrl)
  assertCommunicationEndpointTrust(endpoint, params.endpointTrust, DEFAULT_Z_API_BASE_URL)
  const response = await requestCommunicationApi(
    {
      endpoint,
      endpointTrust: params.endpointTrust,
      defaultBaseUrl: DEFAULT_Z_API_BASE_URL,
      method: 'GET',
      path: `instances/${encodeURIComponent(params.instanceId)}/token/${encodeURIComponent(params.instanceToken)}/status`,
      headers: { 'Client-Token': params.clientToken }
    },
    dependencies
  )
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw providerHttpError(response.statusCode)
  }
  if (
    typeof response.body !== 'object' ||
    response.body === null ||
    typeof (response.body as Record<string, unknown>).connected !== 'boolean'
  ) {
    throw new CommunicationApiError('invalid_response', 'Z-API returned an invalid response.')
  }
  return {
    instanceConnected: (response.body as { connected: boolean }).connected
  }
}
