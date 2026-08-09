import { EventEmitter } from 'node:events'
import type { RequestOptions } from 'node:https'
import { describe, expect, it, vi } from 'vitest'
import type {
  CommunicationApiRequestDependencies,
  CommunicationHttpsRequest,
  CommunicationHttpsResponse,
  CommunicationHttpsRequester
} from './communication-api-endpoint'
import { verifyCommunicationWebhookChallenge } from './communication-webhook-challenge'

const VALID_NONCE = 'nonce_1234567890'

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

function transport(
  statusCode: number,
  responseBody: string,
  contentType = 'text/plain'
): {
  dependencies: CommunicationApiRequestDependencies
  options: () => RequestOptions
  request: FakeRequest
} {
  const request = new FakeRequest()
  let captured: RequestOptions | null = null
  const requester: CommunicationHttpsRequester = (options, respond) => {
    captured = options
    queueMicrotask(() => {
      const response = new FakeResponse(statusCode, { 'content-type': contentType })
      respond(response as unknown as CommunicationHttpsResponse)
      if (statusCode >= 200 && statusCode < 300) {
        response.emit('data', Buffer.from(responseBody, 'utf8'))
        response.emit('end')
      }
    })
    return request as unknown as CommunicationHttpsRequest
  }
  return {
    dependencies: {
      resolveDns: async () => [{ address: '104.16.123.96', family: 4 }],
      request: requester
    },
    options: () => {
      if (!captured) {
        throw new Error('Challenge request options were not captured.')
      }
      return captured
    },
    request
  }
}

describe('verifyCommunicationWebhookChallenge', () => {
  it('verifies an exact public response using only the Orca challenge header', async () => {
    const nonce = VALID_NONCE
    const fixture = transport(200, nonce)
    await expect(
      verifyCommunicationWebhookChallenge(
        {
          publicWebhookUrl: 'https://HOOKS.example.com/orca/webhook',
          nonce
        },
        fixture.dependencies
      )
    ).resolves.toEqual({ verified: true })
    expect(fixture.options()).toMatchObject({
      protocol: 'https:',
      hostname: 'hooks.example.com',
      method: 'GET',
      path: '/orca/webhook',
      headers: { 'X-Orca-Webhook-Challenge': nonce },
      servername: 'hooks.example.com'
    })
    expect(Object.keys(fixture.options().headers ?? {})).toEqual(['X-Orca-Webhook-Challenge'])
    expect(fixture.request.write).not.toHaveBeenCalled()
    expect(fixture.request.end).toHaveBeenCalledTimes(1)
  })

  it('rejects a challenge mismatch without exposing either response', async () => {
    const nonce = 'nonce_must-not-leak'
    const response = 'response-must-not-leak'
    const fixture = transport(200, response)
    const result = verifyCommunicationWebhookChallenge(
      { publicWebhookUrl: 'https://hooks.example.com/webhook', nonce },
      fixture.dependencies
    )
    await expect(result).rejects.toMatchObject({
      code: 'invalid_response',
      message: 'The webhook challenge response did not match.'
    })
    await expect(result.catch((error: unknown) => String(error))).resolves.toSatisfy(
      (message: string) => !message.includes(nonce) && !message.includes(response)
    )
  })

  it('rejects a non-text challenge response', async () => {
    const fixture = transport(200, VALID_NONCE, 'application/json')
    await expect(
      verifyCommunicationWebhookChallenge(
        { publicWebhookUrl: 'https://hooks.example.com/webhook', nonce: VALID_NONCE },
        fixture.dependencies
      )
    ).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('rejects redirects without following them', async () => {
    const fixture = transport(302, '')
    await expect(
      verifyCommunicationWebhookChallenge(
        { publicWebhookUrl: 'https://hooks.example.com/webhook', nonce: VALID_NONCE },
        fixture.dependencies
      )
    ).rejects.toMatchObject({ code: 'redirect_rejected' })
    expect(fixture.request.destroy).toHaveBeenCalledTimes(1)
  })

  it.each([
    'http://hooks.example.com/webhook',
    'https://user:password@hooks.example.com/webhook',
    'https://hooks.example.com/webhook?token=secret',
    'https://127.0.0.1/webhook',
    'https://metadata.google.internal/webhook'
  ])('rejects an unsafe public webhook URL before requesting %s', async (publicWebhookUrl) => {
    const requester = vi.fn()
    await expect(
      verifyCommunicationWebhookChallenge(
        { publicWebhookUrl, nonce: VALID_NONCE },
        { request: requester }
      )
    ).rejects.toMatchObject({ code: expect.stringMatching(/^endpoint_(invalid|blocked)$/u) })
    expect(requester).not.toHaveBeenCalled()
  })

  it('rejects a hostname resolving to a private address before requesting it', async () => {
    const requester = vi.fn()
    await expect(
      verifyCommunicationWebhookChallenge(
        { publicWebhookUrl: 'https://rebinding.example.com/webhook', nonce: VALID_NONCE },
        {
          resolveDns: async () => [{ address: '169.254.169.254', family: 4 }],
          request: requester
        }
      )
    ).rejects.toMatchObject({ code: 'endpoint_blocked' })
    expect(requester).not.toHaveBeenCalled()
  })

  it.each(['short', 'contains space___', 'invalid!character', 'x'.repeat(257)])(
    'rejects an invalid nonce before resolving the endpoint',
    async (nonce) => {
      const resolveDns = vi.fn()
      await expect(
        verifyCommunicationWebhookChallenge(
          { publicWebhookUrl: 'https://hooks.example.com/webhook', nonce },
          { resolveDns }
        )
      ).rejects.toMatchObject({ code: 'invalid_configuration' })
      expect(resolveDns).not.toHaveBeenCalled()
    }
  )
})
