import { EventEmitter } from 'node:events'
import type { RequestOptions } from 'node:https'
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_Z_API_BASE_URL } from '../../shared/communication-integrations'
import type {
  CommunicationApiRequestDependencies,
  CommunicationHttpsRequest,
  CommunicationHttpsResponse,
  CommunicationHttpsRequester
} from './communication-api-endpoint'
import {
  probeZApiCommunicationIntegration,
  type ZApiCommunicationProbeParams
} from './z-api-communication-probe'

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

function transport(fixture: { statusCode: number; body: unknown; rawBody?: string }): {
  dependencies: CommunicationApiRequestDependencies
  options: () => RequestOptions
  request: FakeRequest
} {
  const request = new FakeRequest()
  let captured: RequestOptions | null = null
  const requester: CommunicationHttpsRequester = (options, respond) => {
    captured = options
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
      resolveDns: async () => [{ address: '172.67.74.24', family: 4 }],
      request: requester
    },
    options: () => {
      if (!captured) {
        throw new Error('Request options were not captured.')
      }
      return captured
    },
    request
  }
}

function params(
  overrides: Partial<ZApiCommunicationProbeParams> = {}
): ZApiCommunicationProbeParams {
  return {
    baseUrl: DEFAULT_Z_API_BASE_URL,
    endpointTrust: { kind: 'default' },
    instanceId: 'instance:id',
    instanceToken: 'instance+token',
    clientToken: 'client-secret',
    ...overrides
  }
}

describe('probeZApiCommunicationIntegration', () => {
  it('uses GET with encoded instance path fields and the client-token header', async () => {
    const fixture = transport({ statusCode: 200, body: { connected: true } })
    await expect(
      probeZApiCommunicationIntegration(params(), fixture.dependencies)
    ).resolves.toEqual({ instanceConnected: true })
    expect(fixture.options()).toMatchObject({
      protocol: 'https:',
      method: 'GET',
      path: '/instances/instance%3Aid/token/instance%2Btoken/status',
      headers: { 'Client-Token': 'client-secret' }
    })
    expect(fixture.request.write).not.toHaveBeenCalled()
    expect(fixture.request.end).toHaveBeenCalledTimes(1)
  })

  it('treats connected false as a successful verification', async () => {
    const fixture = transport({ statusCode: 200, body: { connected: false } })
    await expect(
      probeZApiCommunicationIntegration(params(), fixture.dependencies)
    ).resolves.toEqual({ instanceConnected: false })
  })

  it.each([
    [{ instanceId: '' }, 'invalid_configuration'],
    [{ instanceToken: '' }, 'invalid_configuration'],
    [{ clientToken: '' }, 'invalid_configuration'],
    [{ instanceId: '.' }, 'invalid_configuration'],
    [{ instanceId: '..' }, 'invalid_configuration'],
    [{ instanceToken: '.' }, 'invalid_configuration'],
    [{ instanceToken: '..' }, 'invalid_configuration'],
    [{ instanceId: 'instance/id' }, 'invalid_configuration'],
    [{ instanceToken: 'instance token' }, 'invalid_configuration'],
    [{ instanceToken: 'instance\\token' }, 'invalid_configuration']
  ])('rejects unsafe configuration before making a request', async (overrides, code) => {
    const requester = vi.fn()
    await expect(
      probeZApiCommunicationIntegration(params(overrides), { request: requester })
    ).rejects.toMatchObject({ code })
    expect(requester).not.toHaveBeenCalled()
  })

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [429, 'rate_limited'],
    [500, 'provider_unavailable'],
    [418, 'provider_rejected']
  ])('maps HTTP %i to %s', async (statusCode, code) => {
    const fixture = transport({ statusCode, body: null })
    await expect(
      probeZApiCommunicationIntegration(params(), fixture.dependencies)
    ).rejects.toMatchObject({ code })
  })

  it.each([{}, { connected: 'true' }, { connected: null }])(
    'rejects JSON without a boolean connected field',
    async (body) => {
      const fixture = transport({ statusCode: 200, body })
      await expect(
        probeZApiCommunicationIntegration(params(), fixture.dependencies)
      ).rejects.toMatchObject({ code: 'invalid_response' })
    }
  )

  it('rejects malformed JSON', async () => {
    const fixture = transport({ statusCode: 200, body: null, rawBody: '{' })
    await expect(
      probeZApiCommunicationIntegration(params(), fixture.dependencies)
    ).rejects.toMatchObject({ code: 'invalid_response' })
  })

  it('never calls a send or webhook-update endpoint', async () => {
    const fixture = transport({ statusCode: 200, body: { connected: true } })
    await probeZApiCommunicationIntegration(params(), fixture.dependencies)
    const path = fixture.options().path
    expect(path).toMatch(/\/status$/)
    expect(path).not.toContain('send-text')
    expect(path).not.toContain('update-webhook')
  })

  it('never includes URL-embedded credentials in an error', async () => {
    const instanceToken = 'token-that-must-not-leak'
    const fixture = transport({ statusCode: 404, body: null })
    const result = probeZApiCommunicationIntegration(
      params({ instanceToken }),
      fixture.dependencies
    )
    await expect(result).rejects.toMatchObject({
      code: 'provider_rejected',
      message: 'Z-API rejected the verification.'
    })
    await expect(result.catch((error: unknown) => String(error))).resolves.not.toContain(
      instanceToken
    )
  })
})
