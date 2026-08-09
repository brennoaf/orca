import {
  CommunicationApiError,
  normalizeCommunicationApiEndpoint
} from './communication-api-endpoint'
import type {
  ZApiInstanceWebhookState,
  ZApiRestorableWebhookState
} from './z-api-communication-client-contract'

const REQUIRED_WEBHOOK_URL_FIELDS = [
  'connectedCallbackUrl',
  'deliveryCallbackUrl',
  'disconnectedCallbackUrl',
  'messageStatusCallbackUrl',
  'presenceChatCallbackUrl',
  'receivedAndDeliveryCallbackUrl',
  'receivedCallbackUrl',
  'receivedStatusCallbackUrl'
] as const

function webhookStateConflict(): CommunicationApiError {
  return new CommunicationApiError(
    'webhook_state_conflict',
    'The existing Z-API webhook state cannot be restored safely.'
  )
}

export function restorableZApiWebhookState(
  state: ZApiInstanceWebhookState
): ZApiRestorableWebhookState {
  const urls = REQUIRED_WEBHOOK_URL_FIELDS.map((field) => state[field])
  const first = urls[0]
  if (
    first === null ||
    first.length === 0 ||
    state.receiveCallbackSentByMe === null ||
    urls.some((value) => value === null || value.length === 0 || value !== first) ||
    (state.initialDataCallbackUrl !== null &&
      state.initialDataCallbackUrl.length > 0 &&
      state.initialDataCallbackUrl !== first)
  ) {
    throw webhookStateConflict()
  }
  try {
    if (normalizeCommunicationApiEndpoint(first).baseUrl !== first) {
      throw webhookStateConflict()
    }
  } catch {
    throw webhookStateConflict()
  }
  return { webhookUrl: first, receiveCallbackSentByMe: state.receiveCallbackSentByMe }
}
