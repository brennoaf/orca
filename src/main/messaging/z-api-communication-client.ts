import {
  DEFAULT_Z_API_BASE_URL,
  type CommunicationApiEndpoint
} from '../../shared/communication-integrations'
import {
  assertCommunicationEndpointTrust,
  CommunicationApiError,
  normalizeCommunicationApiEndpoint,
  requestCommunicationApi,
  type CommunicationApiRequestDependencies
} from './communication-api-endpoint'
import {
  zApiChatMetadataSchema,
  zApiProviderRecordSchema,
  zApiSendTextResponseSchema,
  zApiStatusPayloadSchema,
  zApiTrueResponseSchema,
  type ZApiCommunicationClientParams,
  type ZApiChatMetadata,
  type ZApiChatArchiveState,
  type ZApiInstanceStatus,
  type ZApiInstanceWebhookState,
  type ZApiRestorableWebhookState,
  type ZApiSendTextParams,
  type ZApiSendTextResult
} from './z-api-communication-client-contract'
import { restorableZApiWebhookState } from './z-api-webhook-state'
import { listZApiChatArchiveStates } from './z-api-chat-archive-state'

export class ZApiAmbiguousSendError extends CommunicationApiError {
  readonly deliveryAmbiguous = true
  readonly retrySafe = false

  constructor(
    code:
      | 'timeout'
      | 'network_error'
      | 'invalid_response'
      | 'redirect_rejected'
      | 'provider_unavailable'
  ) {
    super(code, 'Z-API message delivery is ambiguous.')
    this.name = 'ZApiAmbiguousSendError'
  }
}

function invalidPathField(value: string): boolean {
  let hasControl = false
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    hasControl ||= codePoint < 32 || codePoint === 127
  }
  return value === '.' || value === '..' || /[\s/\\]/u.test(value) || hasControl
}

function validateClientParams(params: ZApiCommunicationClientParams): void {
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

function providerHttpError(statusCode: number): CommunicationApiError {
  if (statusCode === 401) {
    return new CommunicationApiError('unauthorized', 'Z-API rejected the credentials.')
  }
  if (statusCode === 403) {
    return new CommunicationApiError('forbidden', 'Z-API denied the requested operation.')
  }
  if (statusCode === 429) {
    return new CommunicationApiError('rate_limited', 'Z-API rate-limited the request.')
  }
  if (statusCode >= 500) {
    return new CommunicationApiError('provider_unavailable', 'Z-API is unavailable.')
  }
  return new CommunicationApiError('provider_rejected', 'Z-API rejected the request.')
}

function assertSuccessfulResponse(statusCode: number): void {
  if (statusCode < 200 || statusCode >= 300) {
    throw providerHttpError(statusCode)
  }
}

function invalidResponse(): CommunicationApiError {
  return new CommunicationApiError('invalid_response', 'Z-API returned an invalid response.')
}

function optionalString(record: Record<string, unknown>, key: string): string | null {
  if (!Object.hasOwn(record, key)) {
    return null
  }
  if (record[key] === null) {
    return null
  }
  if (typeof record[key] !== 'string') {
    throw invalidResponse()
  }
  return record[key]
}

function optionalBoolean(record: Record<string, unknown>, key: string): boolean | null {
  if (!Object.hasOwn(record, key)) {
    return null
  }
  if (typeof record[key] !== 'boolean') {
    throw invalidResponse()
  }
  return record[key]
}

function validateSendTextParams(params: ZApiSendTextParams): void {
  if (
    params.destination.length === 0 ||
    params.message.length === 0 ||
    params.replyMessageId === ''
  ) {
    throw new CommunicationApiError(
      'invalid_configuration',
      'Z-API requires a destination and message.'
    )
  }
}

export class ZApiCommunicationClient {
  private readonly endpoint: CommunicationApiEndpoint
  private readonly pathPrefix: string
  private readonly headers: Readonly<Record<string, string>>

  constructor(
    private readonly params: ZApiCommunicationClientParams,
    private readonly dependencies: CommunicationApiRequestDependencies = {}
  ) {
    validateClientParams(params)
    this.endpoint = normalizeCommunicationApiEndpoint(params.baseUrl)
    assertCommunicationEndpointTrust(this.endpoint, params.endpointTrust, DEFAULT_Z_API_BASE_URL)
    this.pathPrefix = `instances/${encodeURIComponent(params.instanceId)}/token/${encodeURIComponent(params.instanceToken)}`
    this.headers = { 'Client-Token': params.clientToken }
  }

  async getStatus(): Promise<ZApiInstanceStatus> {
    const response = await this.request('GET', 'status')
    const parsed = zApiStatusPayloadSchema.safeParse(response.body)
    if (!parsed.success) {
      throw invalidResponse()
    }
    const { connected, smartphoneConnected, paymentStatus, status, error } = parsed.data
    return {
      connected,
      smartphoneConnected,
      configurationReady: connected && smartphoneConnected,
      paymentStatus: paymentStatus ?? null,
      statusDetail: status ?? error ?? null
    }
  }

  async getInstanceWebhookState(): Promise<ZApiInstanceWebhookState> {
    const response = await this.request('GET', 'me')
    const parsed = zApiProviderRecordSchema.safeParse(response.body)
    if (!parsed.success) {
      throw invalidResponse()
    }
    const payload = parsed.data
    return {
      connectedCallbackUrl: optionalString(payload, 'connectedCallbackUrl'),
      deliveryCallbackUrl: optionalString(payload, 'deliveryCallbackUrl'),
      disconnectedCallbackUrl: optionalString(payload, 'disconnectedCallbackUrl'),
      messageStatusCallbackUrl: optionalString(payload, 'messageStatusCallbackUrl'),
      presenceChatCallbackUrl: optionalString(payload, 'presenceChatCallbackUrl'),
      receivedAndDeliveryCallbackUrl: optionalString(payload, 'receivedAndDeliveryCallbackUrl'),
      receivedCallbackUrl: optionalString(payload, 'receivedCallbackUrl'),
      receivedStatusCallbackUrl: optionalString(payload, 'receivedStatusCallbackUrl'),
      initialDataCallbackUrl: optionalString(payload, 'initialDataCallbackUrl'),
      receiveCallbackSentByMe: optionalBoolean(payload, 'receiveCallbackSentByMe')
    }
  }

  async getRestorableWebhookState(): Promise<ZApiRestorableWebhookState> {
    return restorableZApiWebhookState(await this.getInstanceWebhookState())
  }

  async getChatMetadata(address: string): Promise<ZApiChatMetadata> {
    if (!address) {
      throw new CommunicationApiError(
        'invalid_configuration',
        'Z-API requires a conversation destination.'
      )
    }
    const response = await this.request('GET', `chats/${encodeURIComponent(address)}`)
    const parsed = zApiChatMetadataSchema.safeParse(response.body)
    if (!parsed.success) {
      throw invalidResponse()
    }
    return { profileThumbnail: parsed.data.profileThumbnail }
  }

  async listChatArchiveStates(): Promise<ZApiChatArchiveState[]> {
    return listZApiChatArchiveStates(async (path) => (await this.request('GET', path)).body)
  }

  async updateEveryWebhooks(publicWebhookUrl: string): Promise<ZApiRestorableWebhookState> {
    const restoreState = await this.getRestorableWebhookState()
    await this.setEveryWebhooks(publicWebhookUrl, true)
    return restoreState
  }

  async setEveryWebhooks(publicWebhookUrl: string, notifySentByMe: boolean): Promise<void> {
    const webhookEndpoint = normalizeCommunicationApiEndpoint(publicWebhookUrl)
    await this.putEveryWebhooks(webhookEndpoint.baseUrl, notifySentByMe)
  }

  async restoreEveryWebhooks(state: ZApiRestorableWebhookState): Promise<void> {
    const validated = restorableZApiWebhookState({
      connectedCallbackUrl: state.webhookUrl,
      deliveryCallbackUrl: state.webhookUrl,
      disconnectedCallbackUrl: state.webhookUrl,
      messageStatusCallbackUrl: state.webhookUrl,
      presenceChatCallbackUrl: state.webhookUrl,
      receivedAndDeliveryCallbackUrl: state.webhookUrl,
      receivedCallbackUrl: state.webhookUrl,
      receivedStatusCallbackUrl: state.webhookUrl,
      initialDataCallbackUrl: null,
      receiveCallbackSentByMe: state.receiveCallbackSentByMe
    })
    await this.putEveryWebhooks(validated.webhookUrl, validated.receiveCallbackSentByMe)
  }

  async clearWebhookFilters(): Promise<void> {
    const response = await this.request('PUT', 'update-filters', {
      messageFilters: [],
      callbackTypeFilters: []
    })
    if (!zApiTrueResponseSchema.safeParse(response.body).success) {
      throw invalidResponse()
    }
  }

  async sendText(params: ZApiSendTextParams): Promise<ZApiSendTextResult> {
    validateSendTextParams(params)
    try {
      const response = await this.request('POST', 'send-text', {
        phone: params.destination,
        message: params.message,
        ...(params.replyMessageId === undefined ? {} : { messageId: params.replyMessageId })
      })
      const parsed = zApiSendTextResponseSchema.safeParse(response.body)
      if (!parsed.success) {
        throw invalidResponse()
      }
      return {
        zaapId: parsed.data.zaapId,
        messageId: parsed.data.messageId,
        id: parsed.data.id
      }
    } catch (error) {
      if (
        error instanceof CommunicationApiError &&
        (error.code === 'timeout' ||
          error.code === 'network_error' ||
          error.code === 'invalid_response' ||
          error.code === 'redirect_rejected' ||
          error.code === 'provider_unavailable')
      ) {
        throw new ZApiAmbiguousSendError(error.code)
      }
      throw error
    }
  }

  private async putEveryWebhooks(value: string, notifySentByMe: boolean): Promise<void> {
    const response = await this.request('PUT', 'update-every-webhooks', {
      value,
      notifySentByMe
    })
    if (!zApiTrueResponseSchema.safeParse(response.body).success) {
      throw invalidResponse()
    }
  }

  private async request(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    body?: Readonly<Record<string, unknown>>
  ) {
    const response = await requestCommunicationApi(
      {
        endpoint: this.endpoint,
        endpointTrust: this.params.endpointTrust,
        defaultBaseUrl: DEFAULT_Z_API_BASE_URL,
        method,
        path: `${this.pathPrefix}/${path}`,
        headers:
          body === undefined
            ? this.headers
            : { ...this.headers, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body)
      },
      this.dependencies
    )
    assertSuccessfulResponse(response.statusCode)
    return response
  }
}
