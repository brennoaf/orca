import { EventEmitter } from 'node:events'
import type { RequestOptions } from 'node:https'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SLACK_API_BASE_URL } from '../../shared/communication-integrations'
import type {
  CommunicationApiRequestDependencies,
  CommunicationHttpsRequest,
  CommunicationHttpsResponse,
  CommunicationHttpsRequester
} from './communication-api-endpoint'
import {
  probeSlackCommunicationIntegration,
  type SlackCommunicationProbeParams
} from './slack-communication-probe'

class FakeRequest extends EventEmitter {
  readonly destroy = vi.fn()
  readonly end = vi.fn()
  readonly write = vi.fn()
}

class FakeResponse extends EventEmitter {
  readonly destroy = vi.fn()
  readonly resume = vi.fn()

  constructor(readonly statusCode: number) {
    super()
  }
}

type Fixture = {
  statusCode: number
  body: unknown
  rawBody?: string
}

function transport(fixtures: readonly Fixture[]): {
  dependencies: CommunicationApiRequestDependencies
  options: readonly RequestOptions[]
  requests: readonly FakeRequest[]
} {
  const options: RequestOptions[] = []
  const requests: FakeRequest[] = []
  const requester: CommunicationHttpsRequester = (requestOptions, respond) => {
    const index = options.length
    const fixture = fixtures[index]
    if (!fixture) {
      throw new Error('Unexpected provider request.')
    }
    options.push(requestOptions)
    const request = new FakeRequest()
    requests.push(request)
    queueMicrotask(() => {
      const response = new FakeResponse(fixture.statusCode)
      respond(response as unknown as CommunicationHttpsResponse)
      if (fixture.statusCode >= 200 && fixture.statusCode < 300) {
        response.emit('data', Buffer.from(fixture.rawBody ?? JSON.stringify(fixture.body), 'utf8'))
        response.emit('end')
      }
    })
    return request as unknown as CommunicationHttpsRequest
  }
  return {
    dependencies: {
      resolveDns: async () => [{ address: '13.107.42.16', family: 4 }],
      request: requester
    },
    options,
    requests
  }
}

function params(
  overrides: Partial<SlackCommunicationProbeParams> = {}
): SlackCommunicationProbeParams {
  return {
    baseUrl: DEFAULT_SLACK_API_BASE_URL,
    endpointTrust: { kind: 'default' },
    appToken: 'xapp-app-secret',
    userToken: 'xoxp-user-secret',
    ...overrides
  }
}

const authSuccess = {
  ok: true,
  team_id: 'T123',
  team: 'EGB',
  user_id: 'U123',
  user: 'Brenno'
}

describe('probeSlackCommunicationIntegration', () => {
  it('uses the user token for auth and the app token only for Socket Mode verification', async () => {
    const fixture = transport([
      { statusCode: 200, body: authSuccess },
      { statusCode: 200, body: { ok: true, url: 'wss://secret.socket.example/link' } }
    ])
    const result = await probeSlackCommunicationIntegration(params(), fixture.dependencies)

    expect(result).toEqual({
      workspace: { teamId: 'T123', teamName: 'EGB', userId: 'U123', userName: 'Brenno' }
    })
    expect(fixture.options).toHaveLength(2)
    expect(fixture.options[0]).toMatchObject({
      protocol: 'https:',
      method: 'POST',
      path: '/api/auth.test',
      headers: {
        authorization: 'Bearer xoxp-user-secret',
        'content-type': 'application/x-www-form-urlencoded'
      }
    })
    expect(fixture.options[1]).toMatchObject({
      protocol: 'https:',
      method: 'POST',
      path: '/api/apps.connections.open',
      headers: {
        authorization: 'Bearer xapp-app-secret',
        'content-type': 'application/x-www-form-urlencoded'
      }
    })
    expect(fixture.requests[0]?.write).toHaveBeenCalledWith('')
    expect(fixture.requests[1]?.write).toHaveBeenCalledWith('')
    expect(JSON.stringify(result)).not.toContain('wss://')
  })

  it.each([
    [{ appToken: 'invalid' }, 'invalid_configuration'],
    [{ userToken: 'invalid' }, 'invalid_configuration'],
    [{ userToken: 'xoxb-bot-token' }, 'invalid_configuration']
  ])('rejects invalid token prefixes', async (overrides, code) => {
    const requester = vi.fn()
    await expect(
      probeSlackCommunicationIntegration(params(overrides), { request: requester })
    ).rejects.toMatchObject({ code })
    expect(requester).not.toHaveBeenCalled()
  })

  it('maps an auth ok false response without exposing the provider body', async () => {
    const token = 'xoxp-user-secret'
    const fixture = transport([
      { statusCode: 200, body: { ok: false, error: 'invalid_auth', detail: token } }
    ])
    const result = probeSlackCommunicationIntegration(
      params({ userToken: token }),
      fixture.dependencies
    )
    await expect(result).rejects.toMatchObject({
      code: 'unauthorized',
      message: 'Slack rejected the credentials.'
    })
    await expect(result.catch((error: unknown) => String(error))).resolves.not.toContain(token)
  })

  it('maps an app-token ok false response', async () => {
    const fixture = transport([
      { statusCode: 200, body: authSuccess },
      { statusCode: 200, body: { ok: false, error: 'not_allowed_token_type' } }
    ])
    await expect(
      probeSlackCommunicationIntegration(params(), fixture.dependencies)
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [429, 'rate_limited'],
    [500, 'provider_unavailable'],
    [418, 'provider_rejected']
  ])('maps HTTP %i to %s', async (statusCode, code) => {
    const fixture = transport([{ statusCode, body: null }])
    await expect(
      probeSlackCommunicationIntegration(params(), fixture.dependencies)
    ).rejects.toMatchObject({ code })
  })

  it('rejects malformed JSON', async () => {
    const fixture = transport([{ statusCode: 200, body: null, rawBody: '{' }])
    await expect(
      probeSlackCommunicationIntegration(params(), fixture.dependencies)
    ).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('requires public workspace and user IDs', async () => {
    const fixture = transport([
      { statusCode: 200, body: { ok: true, team: 'EGB', user: 'Brenno' } }
    ])
    await expect(
      probeSlackCommunicationIntegration(params(), fixture.dependencies)
    ).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it.each([
    [{ ok: true }],
    [{ ok: true, url: 'https://socket-mode.example/link' }],
    [{ ok: true, url: 'not-a-url' }]
  ])('requires a parseable wss Socket Mode URL', async (socketBody) => {
    const fixture = transport([
      { statusCode: 200, body: authSuccess },
      { statusCode: 200, body: socketBody }
    ])
    await expect(
      probeSlackCommunicationIntegration(params(), fixture.dependencies)
    ).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('never opens a socket or follows the returned Socket Mode URL', async () => {
    const socketUrl = 'wss://socket-mode.example/secret'
    const fixture = transport([
      { statusCode: 200, body: authSuccess },
      { statusCode: 200, body: { ok: true, url: socketUrl } }
    ])
    await probeSlackCommunicationIntegration(params(), fixture.dependencies)
    expect(fixture.options).toHaveLength(2)
    expect(fixture.options.every((options) => options.protocol === 'https:')).toBe(true)
    expect(JSON.stringify(fixture.options)).not.toContain(socketUrl)
  })
})
