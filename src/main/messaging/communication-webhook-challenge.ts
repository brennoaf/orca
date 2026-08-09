import { z } from 'zod'
import {
  CommunicationApiError,
  normalizeCommunicationApiEndpoint,
  requestCommunicationApi,
  type CommunicationApiRequestDependencies
} from './communication-api-endpoint'

const challengeNonceSchema = z.string().regex(/^[A-Za-z0-9_-]{16,256}$/u)
export const COMMUNICATION_WEBHOOK_CHALLENGE_MARKER = 'orca-v1'

export type CommunicationWebhookChallengeParams = {
  publicWebhookUrl: string
  nonce: string
}

export type CommunicationWebhookChallengeResult = {
  verified: true
}

export async function verifyCommunicationWebhookChallenge(
  params: CommunicationWebhookChallengeParams,
  dependencies: CommunicationApiRequestDependencies = {}
): Promise<CommunicationWebhookChallengeResult> {
  const nonce = challengeNonceSchema.safeParse(params.nonce)
  if (!nonce.success) {
    throw new CommunicationApiError('invalid_configuration', 'The webhook challenge is invalid.')
  }
  const endpoint = normalizeCommunicationApiEndpoint(params.publicWebhookUrl)
  const webhookUrl = new URL(endpoint.baseUrl)
  const requestEndpoint = normalizeCommunicationApiEndpoint(webhookUrl.origin)
  const response = await requestCommunicationApi(
    {
      endpoint: requestEndpoint,
      endpointTrust: { kind: 'custom', authority: requestEndpoint.authority },
      defaultBaseUrl: requestEndpoint.baseUrl,
      method: 'GET',
      path: webhookUrl.pathname,
      headers: { 'X-Orca-Webhook-Challenge': COMMUNICATION_WEBHOOK_CHALLENGE_MARKER },
      responseType: 'text'
    },
    dependencies
  )
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new CommunicationApiError(
      'provider_rejected',
      'The webhook endpoint rejected the challenge.'
    )
  }
  if (response.body !== nonce.data) {
    throw new CommunicationApiError(
      'invalid_response',
      'The webhook challenge response did not match.'
    )
  }
  return { verified: true }
}
