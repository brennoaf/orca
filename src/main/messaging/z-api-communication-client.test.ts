import { EventEmitter } from 'node:events'
import type { RequestOptions } from 'node:https'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_Z_API_BASE_URL } from '../../shared/communication-integrations'
import type {
  CommunicationApiRequestDependencies,
  CommunicationHttpsRequest,
  CommunicationHttpsResponse,
  CommunicationHttpsRequester
} from './communication-api-endpoint'
import { MessageStore } from './message-store'
import { ZApiAmbiguousSendError, ZApiCommunicationClient } from './z-api-communication-client'
import type { ZApiCommunicationClientParams } from './z-api-communication-client-contract'
import { normalizeZApiCallback } from './z-api-message-normalizer'

class FakeRequest extends EventEmitter {
  readonly destroy = vi.fn()
  readonly end = vi.fn()
  readonly write = vi.fn()
}

class FakeResponse extends EventEmitter {
  readonly destroy = vi.fn()
  readonly resume = vi.fn()

  constructor(
    readonly statusCode: number,
    readonly headers: Readonly<Record<string, string>>
  ) {
    super()
  }
}

type Fixture = {
  statusCode?: number
  body?: unknown
  rawBody?: string
  requestError?: boolean
  pending?: boolean
  contentType?: string | null
}

function transport(fixtures: readonly Fixture[]): {
  dependencies: CommunicationApiRequestDependencies
  options: readonly RequestOptions[]
  requests: readonly FakeRequest[]
} {
  const options: RequestOptions[] = []
  const requests: FakeRequest[] = []
  const requester: CommunicationHttpsRequester = (requestOptions, respond) => {
    const fixture = fixtures[options.length]
    if (!fixture) {
      throw new Error('Unexpected Z-API request.')
    }
    options.push(requestOptions)
    const request = new FakeRequest()
    requests.push(request)
    if (!fixture.pending) {
      queueMicrotask(() => {
        if (fixture.requestError) {
          request.emit('error', new Error('provider-secret'))
          return
        }
        const statusCode = fixture.statusCode ?? 200
        const response = new FakeResponse(
          statusCode,
          fixture.contentType === null
            ? {}
            : { 'content-type': fixture.contentType ?? 'application/json' }
        )
        respond(response as unknown as CommunicationHttpsResponse)
        if (statusCode >= 200 && statusCode < 300) {
          response.emit(
            'data',
            Buffer.from(fixture.rawBody ?? JSON.stringify(fixture.body), 'utf8')
          )
          response.emit('end')
        }
      })
    }
    return request as unknown as CommunicationHttpsRequest
  }
  return {
    dependencies: {
      resolveDns: async () => [{ address: '172.67.74.24', family: 4 }],
      request: requester
    },
    options,
    requests
  }
}

function params(
  overrides: Partial<ZApiCommunicationClientParams> = {}
): ZApiCommunicationClientParams {
  return {
    baseUrl: DEFAULT_Z_API_BASE_URL,
    endpointTrust: { kind: 'default' },
    instanceId: 'instance:id',
    instanceToken: 'instance+token',
    clientToken: 'client-secret',
    ...overrides
  }
}

function client(fixtures: readonly Fixture[]): {
  client: ZApiCommunicationClient
  options: readonly RequestOptions[]
  requests: readonly FakeRequest[]
} {
  const fixture = transport(fixtures)
  return {
    client: new ZApiCommunicationClient(params(), fixture.dependencies),
    options: fixture.options,
    requests: fixture.requests
  }
}

function uniformWebhookBody(
  webhookUrl = 'https://previous.example.com/webhook',
  receiveCallbackSentByMe = false
): Record<string, unknown> {
  return {
    connectedCallbackUrl: webhookUrl,
    deliveryCallbackUrl: webhookUrl,
    disconnectedCallbackUrl: webhookUrl,
    messageStatusCallbackUrl: webhookUrl,
    presenceChatCallbackUrl: webhookUrl,
    receivedAndDeliveryCallbackUrl: webhookUrl,
    receivedCallbackUrl: webhookUrl,
    receivedStatusCallbackUrl: webhookUrl,
    initialDataCallbackUrl: webhookUrl,
    receiveCallbackSentByMe
  }
}

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

const INVALID_REQUIRED_WEBHOOK_BODIES = REQUIRED_WEBHOOK_FIELDS.flatMap((field) => {
  const absent = uniformWebhookBody()
  delete absent[field]
  return [
    absent,
    { ...uniformWebhookBody(), [field]: null },
    { ...uniformWebhookBody(), [field]: '' }
  ]
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ZApiCommunicationClient', () => {
  it('gets strict connection state and relevant provider status without returning extras', async () => {
    const fixture = client([
      {
        body: {
          connected: true,
          smartphoneConnected: true,
          error: 'connected',
          paymentStatus: 'ACTIVE',
          token: 'must-not-leak'
        }
      }
    ])
    await expect(fixture.client.getStatus()).resolves.toEqual({
      connected: true,
      smartphoneConnected: true,
      configurationReady: true,
      paymentStatus: 'ACTIVE',
      statusDetail: 'connected'
    })
    expect(fixture.options[0]).toMatchObject({
      method: 'GET',
      path: '/instances/instance%3Aid/token/instance%2Btoken/status',
      headers: { 'Client-Token': 'client-secret' }
    })
    expect(fixture.requests[0]?.write).not.toHaveBeenCalled()
  })

  it.each([
    { connected: false, smartphoneConnected: true },
    { connected: true, smartphoneConnected: false },
    { connected: false, smartphoneConnected: false }
  ])('requires both connection indicators for configuration readiness', async (body) => {
    const fixture = client([{ body }])
    await expect(fixture.client.getStatus()).resolves.toMatchObject({
      ...body,
      configurationReady: false
    })
  })

  it.each([
    {},
    { connected: true },
    { connected: 'true', smartphoneConnected: true },
    { connected: true, smartphoneConnected: 'true' }
  ])('rejects invalid instance status responses', async (body) => {
    const fixture = client([{ body }])
    await expect(fixture.client.getStatus()).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('extracts only known webhook state and tolerates missing, empty, and heterogeneous fields', async () => {
    const secret = 'instance-token-must-not-leak'
    const fixture = client([
      {
        body: {
          token: secret,
          connectedCallbackUrl: 'https://callback.example.com/hook',
          deliveryCallbackUrl: '',
          presenceChatCallbackUrl: 'https://callback.example.com/presence',
          receivedCallbackUrl: 'https://callback.example.com/received',
          receiveCallbackSentByMe: true,
          unknownCallbackUrl: 'https://callback.example.com/unknown'
        }
      }
    ])
    const result = await fixture.client.getInstanceWebhookState()
    expect(result).toEqual({
      connectedCallbackUrl: 'https://callback.example.com/hook',
      deliveryCallbackUrl: '',
      disconnectedCallbackUrl: null,
      messageStatusCallbackUrl: null,
      presenceChatCallbackUrl: 'https://callback.example.com/presence',
      receivedAndDeliveryCallbackUrl: null,
      receivedCallbackUrl: 'https://callback.example.com/received',
      receivedStatusCallbackUrl: null,
      initialDataCallbackUrl: null,
      receiveCallbackSentByMe: true
    })
    expect(fixture.options[0]?.path).toBe('/instances/instance%3Aid/token/instance%2Btoken/me')
    expect(JSON.stringify(result)).not.toContain(secret)
    expect(JSON.stringify(result)).not.toContain('unknownCallbackUrl')
  })

  it.each([null, [], 'invalid'])('rejects non-record instance data responses', async (body) => {
    const fixture = client([{ body }])
    await expect(fixture.client.getInstanceWebhookState()).rejects.toMatchObject({
      code: 'invalid_response'
    })
  })

  it('rejects a known webhook field with an invalid type', async () => {
    const fixture = client([{ body: { receivedCallbackUrl: 42 } }])
    await expect(fixture.client.getInstanceWebhookState()).rejects.toMatchObject({
      code: 'invalid_response'
    })
  })

  it('updates every webhook with sent-by-me notifications using PUT JSON', async () => {
    const previous = uniformWebhookBody()
    delete previous.initialDataCallbackUrl
    const fixture = client([{ body: previous }, { body: { value: true } }])
    await expect(
      fixture.client.updateEveryWebhooks('https://HOOKS.example.com/orca/webhook/')
    ).resolves.toEqual({
      webhookUrl: 'https://previous.example.com/webhook',
      receiveCallbackSentByMe: false
    })
    expect(fixture.options[0]?.path).toBe('/instances/instance%3Aid/token/instance%2Btoken/me')
    expect(fixture.options[1]).toMatchObject({
      method: 'PUT',
      path: '/instances/instance%3Aid/token/instance%2Btoken/update-every-webhooks',
      headers: {
        'Client-Token': 'client-secret',
        'content-type': 'application/json'
      }
    })
    expect(fixture.requests[1]?.write).toHaveBeenCalledWith(
      JSON.stringify({
        value: 'https://hooks.example.com/orca/webhook',
        notifySentByMe: true
      })
    )
  })

  it('sets every webhook without taking a second snapshot', async () => {
    const fixture = client([{ body: { value: true } }])
    await expect(
      fixture.client.setEveryWebhooks('https://hooks.example.com/orca/webhook', false)
    ).resolves.toBeUndefined()
    expect(fixture.options).toHaveLength(1)
    expect(fixture.options[0]).toMatchObject({
      method: 'PUT',
      path: '/instances/instance%3Aid/token/instance%2Btoken/update-every-webhooks'
    })
    expect(fixture.requests[0]?.write).toHaveBeenCalledWith(
      JSON.stringify({
        value: 'https://hooks.example.com/orca/webhook',
        notifySentByMe: false
      })
    )
  })

  it.each([
    ...INVALID_REQUIRED_WEBHOOK_BODIES,
    {
      ...uniformWebhookBody(),
      receivedCallbackUrl: 'https://different.example.com/webhook'
    },
    {
      ...uniformWebhookBody(),
      initialDataCallbackUrl: 'https://different.example.com/webhook'
    }
  ])('rejects an unrestorable webhook snapshot before mutation', async (body) => {
    const fixture = client([{ body }])
    await expect(
      fixture.client.updateEveryWebhooks('https://hooks.example.com/webhook')
    ).rejects.toMatchObject({ code: 'webhook_state_conflict' })
    expect(fixture.options).toHaveLength(1)
    expect(fixture.options[0]?.method).toBe('GET')
    expect(fixture.requests[0]?.write).not.toHaveBeenCalled()
  })

  it('restores the uniform URL and previous sent-by-me setting', async () => {
    const fixture = client([{ body: { value: true } }])
    await expect(
      fixture.client.restoreEveryWebhooks({
        webhookUrl: 'https://previous.example.com/webhook',
        receiveCallbackSentByMe: false
      })
    ).resolves.toBeUndefined()
    expect(fixture.requests[0]?.write).toHaveBeenCalledWith(
      JSON.stringify({
        value: 'https://previous.example.com/webhook',
        notifySentByMe: false
      })
    )
  })

  it('clears both webhook filter arrays using PUT JSON', async () => {
    const fixture = client([{ body: { value: true } }])
    await expect(fixture.client.clearWebhookFilters()).resolves.toBeUndefined()
    expect(fixture.options[0]).toMatchObject({
      method: 'PUT',
      path: '/instances/instance%3Aid/token/instance%2Btoken/update-filters'
    })
    expect(fixture.requests[0]?.write).toHaveBeenCalledWith(
      JSON.stringify({ messageFilters: [], callbackTypeFilters: [] })
    )
  })

  it('rejects an invalid webhook-update success body', async () => {
    const fixture = client([
      { body: uniformWebhookBody() },
      { body: { value: false, token: 'must-not-leak' } }
    ])
    await expect(
      fixture.client.updateEveryWebhooks('https://hooks.example.com/webhook')
    ).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('rejects an invalid filter-update success body', async () => {
    const fixture = client([{ body: { value: false, token: 'must-not-leak' } }])
    await expect(fixture.client.clearWebhookFilters()).rejects.toMatchObject({
      code: 'invalid_response'
    })
  })

  it('sends text with an optional reply ID and returns only provider identifiers', async () => {
    const fixture = client([
      {
        body: {
          zaapId: 'zaap-1',
          messageId: 'message-1',
          id: 'message-1',
          token: 'must-not-leak'
        }
      }
    ])
    await expect(
      fixture.client.sendText({
        destination: '5511999999999',
        message: 'Resposta',
        replyMessageId: 'received-1'
      })
    ).resolves.toEqual({ zaapId: 'zaap-1', messageId: 'message-1', id: 'message-1' })
    expect(fixture.options[0]).toMatchObject({
      method: 'POST',
      path: '/instances/instance%3Aid/token/instance%2Btoken/send-text'
    })
    expect(fixture.requests[0]?.write).toHaveBeenCalledWith(
      JSON.stringify({
        phone: '5511999999999',
        message: 'Resposta',
        messageId: 'received-1'
      })
    )
  })

  it('omits the reply field for a standalone message', async () => {
    const fixture = client([
      { body: { zaapId: 'zaap-1', messageId: 'message-1', id: 'message-1' } }
    ])
    await fixture.client.sendText({ destination: 'group-id', message: 'Mensagem' })
    expect(fixture.requests[0]?.write).toHaveBeenCalledWith(
      JSON.stringify({ phone: 'group-id', message: 'Mensagem' })
    )
  })

  it('sends a group reply to the canonical phone persisted from its callback', async () => {
    const store = new MessageStore(':memory:')
    try {
      store.ingest(
        normalizeZApiCallback({
          type: 'ReceivedCallback',
          instanceId: 'instance:id',
          messageId: 'group-message-1',
          momment: 1_786_250_000_000,
          isGroup: true,
          phone: '120363019502650977-group',
          chatLid: 'group-chat@lid',
          participantLid: 'participant@lid',
          fromMe: false,
          text: { message: 'Mensagem recebida' }
        })
      )
      const conversation = store.listConversations()[0]
      expect(conversation).toMatchObject({
        address: '120363019502650977-group',
        conversationKind: 'group'
      })
      const destination = store.getReplyDestination(conversation!.id)
      if (!destination) {
        throw new Error('Missing persisted group destination.')
      }
      const fixture = client([
        { body: { zaapId: 'zaap-1', messageId: 'message-1', id: 'message-1' } }
      ])
      await fixture.client.sendText({
        destination: destination.conversationAddress,
        message: 'Resposta'
      })
      expect(fixture.requests[0]?.write).toHaveBeenCalledWith(
        JSON.stringify({ phone: '120363019502650977-group', message: 'Resposta' })
      )
    } finally {
      store.close()
    }
  })

  it.each([
    { body: {} },
    { body: { zaapId: 'zaap-1', messageId: '', id: 'message-1' } },
    { body: { zaapId: 'zaap-1', messageId: 'message-1' } },
    { rawBody: '{' },
    { rawBody: JSON.stringify({ value: 'x'.repeat(64 * 1_024) }) },
    {
      body: { zaapId: 'zaap-1', messageId: 'message-1', id: 'message-1' },
      contentType: 'text/html'
    },
    {
      body: { zaapId: 'zaap-1', messageId: 'message-1', id: 'message-1' },
      contentType: null
    }
  ])(
    'classifies an invalid post-dispatch response as ambiguous without retry',
    async (response) => {
      const fixture = client([response])
      await expect(
        fixture.client.sendText({ destination: '5511999999999', message: 'Mensagem' })
      ).rejects.toMatchObject({
        code: 'invalid_response',
        deliveryAmbiguous: true,
        retrySafe: false
      })
      expect(fixture.requests).toHaveLength(1)
    }
  )

  it('classifies a post-dispatch network failure as ambiguous and never retries', async () => {
    const fixture = client([{ requestError: true }])
    const result = fixture.client.sendText({
      destination: '5511999999999',
      message: 'Mensagem'
    })
    await expect(result).rejects.toBeInstanceOf(ZApiAmbiguousSendError)
    await expect(result.catch((error: unknown) => error)).resolves.toMatchObject({
      code: 'network_error',
      deliveryAmbiguous: true,
      retrySafe: false
    })
    expect(fixture.requests).toHaveLength(1)
  })

  it('classifies a send timeout as ambiguous and never retries', async () => {
    vi.useFakeTimers()
    const fixture = client([{ pending: true }])
    const result = fixture.client.sendText({
      destination: '5511999999999',
      message: 'Mensagem'
    })
    const expectation = expect(result).rejects.toMatchObject({
      code: 'timeout',
      deliveryAmbiguous: true,
      retrySafe: false
    })
    await vi.advanceTimersByTimeAsync(10_000)
    await expectation
    expect(fixture.requests).toHaveLength(1)
  })

  it.each([302, 500, 503])(
    'classifies HTTP %i after send as ambiguous without retry',
    async (statusCode) => {
      const fixture = client([{ statusCode }])
      await expect(
        fixture.client.sendText({ destination: '5511999999999', message: 'Mensagem' })
      ).rejects.toMatchObject({
        code: statusCode === 302 ? 'redirect_rejected' : 'provider_unavailable',
        deliveryAmbiguous: true,
        retrySafe: false
      })
      expect(fixture.requests).toHaveLength(1)
    }
  )

  it.each([
    [400, 'provider_rejected'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [429, 'rate_limited']
  ])('keeps HTTP %i as an unambiguous %s rejection', async (statusCode, code) => {
    const fixture = client([{ statusCode }])
    const result = fixture.client.sendText({
      destination: '5511999999999',
      message: 'Mensagem'
    })
    await expect(result).rejects.toMatchObject({ code })
    await expect(result.catch((error: unknown) => error)).resolves.not.toBeInstanceOf(
      ZApiAmbiguousSendError
    )
    expect(fixture.requests).toHaveLength(1)
  })

  it.each([
    [{ instanceId: '' }, 'invalid_configuration'],
    [{ instanceToken: '..' }, 'invalid_configuration'],
    [{ clientToken: '' }, 'invalid_configuration']
  ])('rejects unsafe credentials before making a request', (overrides, code) => {
    expect(() => new ZApiCommunicationClient(params(overrides))).toThrowError(
      expect.objectContaining({ code })
    )
  })
})
