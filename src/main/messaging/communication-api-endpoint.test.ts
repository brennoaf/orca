import { EventEmitter } from 'node:events'
import type { RequestOptions } from 'node:https'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunicationResolvedAddress } from '../../shared/communication-integrations'
import {
  CommunicationApiError,
  normalizeCommunicationApiEndpoint,
  requestCommunicationApi,
  type CommunicationApiRequestDependencies,
  type CommunicationHttpsRequest,
  type CommunicationHttpsResponse,
  type CommunicationHttpsRequester
} from './communication-api-endpoint'

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

type ResponseFixture = {
  statusCode: number
  chunks?: readonly Buffer[]
  requestError?: boolean
  responseError?: boolean
}

function transport(fixture: ResponseFixture): {
  dependencies: CommunicationApiRequestDependencies
  request: FakeRequest
  options: () => RequestOptions
  response: () => FakeResponse
} {
  const request = new FakeRequest()
  let captured: RequestOptions | null = null
  let capturedResponse: FakeResponse | null = null
  const requester: CommunicationHttpsRequester = (options, respond) => {
    captured = options
    queueMicrotask(() => {
      if (fixture.requestError) {
        request.emit('error', new Error('contains-secret'))
        return
      }
      const response = new FakeResponse(fixture.statusCode)
      capturedResponse = response
      respond(response as unknown as CommunicationHttpsResponse)
      if (fixture.responseError) {
        response.emit('error', new Error('contains-secret'))
        return
      }
      for (const chunk of fixture.chunks ?? []) {
        response.emit('data', chunk)
      }
      response.emit('end')
    })
    return request as unknown as CommunicationHttpsRequest
  }
  return {
    dependencies: {
      resolveDns: async () => [{ address: '93.184.216.34', family: 4 }],
      request: requester
    },
    request,
    options: () => {
      if (!captured) {
        throw new Error('Request options were not captured.')
      }
      return captured
    },
    response: () => {
      if (!capturedResponse) {
        throw new Error('Response was not captured.')
      }
      return capturedResponse
    }
  }
}

function defaultRequest(
  dependencies: CommunicationApiRequestDependencies,
  overrides: Partial<Parameters<typeof requestCommunicationApi>[0]> = {}
): Promise<unknown> {
  return requestCommunicationApi(
    {
      endpoint: normalizeCommunicationApiEndpoint('https://api.example.com/base'),
      endpointTrust: { kind: 'custom', authority: 'api.example.com' },
      defaultBaseUrl: 'https://default.example.com/api',
      method: 'GET',
      path: 'status',
      ...overrides
    },
    dependencies
  )
}

function errorCode(error: unknown): string | null {
  return error instanceof CommunicationApiError ? error.code : null
}

afterEach(() => {
  vi.useRealTimers()
})

describe('normalizeCommunicationApiEndpoint', () => {
  it('normalizes host casing, the final dot, default port, and trailing slashes', () => {
    expect(normalizeCommunicationApiEndpoint('  https://SLACK.COM.:443/api///  ')).toEqual({
      baseUrl: 'https://slack.com/api',
      authority: 'slack.com',
      hostname: 'slack.com',
      port: ''
    })
  })

  it('preserves a base path and non-default port', () => {
    expect(normalizeCommunicationApiEndpoint('https://api.example.com:8443/v1')).toMatchObject({
      baseUrl: 'https://api.example.com:8443/v1',
      authority: 'api.example.com:8443'
    })
  })

  it.each([
    '',
    'https://',
    'http://api.example.com',
    '/api',
    'https://user:pass@api.example.com',
    'https://api.example.com?token=value',
    'https://api.example.com#fragment',
    `https://api.example.com/${'x'.repeat(2_048)}`
  ])('rejects invalid URL %s', (value) => {
    expect(() => normalizeCommunicationApiEndpoint(value)).toThrowError(
      expect.objectContaining({ code: 'endpoint_invalid' })
    )
  })

  it.each([
    'localhost',
    'local',
    'api.localhost',
    'service.local',
    'metadata',
    'metadata.google.internal',
    'child.metadata.google.internal',
    'metadata.azure.internal',
    'instance-data.ec2.internal',
    'metadata.oraclecloud.com'
  ])('blocks local or metadata hostname %s', (hostname) => {
    expect(() => normalizeCommunicationApiEndpoint(`https://${hostname}`)).toThrowError(
      expect.objectContaining({ code: 'endpoint_blocked' })
    )
  })

  it.each([
    '0.0.0.1',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.0.0.1',
    '192.0.2.1',
    '192.88.99.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '240.0.0.1',
    '255.255.255.255'
  ])('blocks non-public IPv4 address %s', (address) => {
    expect(() => normalizeCommunicationApiEndpoint(`https://${address}`)).toThrowError(
      expect.objectContaining({ code: 'endpoint_blocked' })
    )
  })

  it.each([
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.1',
    '::192.168.1.1',
    '64:ff9b::192.168.1.1',
    '64:ff9b:1::a00:1',
    '100::1',
    '2001:2::1',
    '2001:10::1',
    '2001:20::1',
    '2001:db8::1',
    '2002:a00:1::1',
    '3fff::1',
    '5f00::1',
    'fc00::1',
    'fd00::1',
    'fe80::1',
    'fec0::1',
    'ff02::1'
  ])('blocks non-public IPv6 address %s', (address) => {
    expect(() => normalizeCommunicationApiEndpoint(`https://[${address}]`)).toThrowError(
      expect.objectContaining({ code: 'endpoint_blocked' })
    )
  })

  it.each(['8.8.8.8', '[2606:4700:4700::1111]'])('allows public IP address %s', (address) => {
    expect(normalizeCommunicationApiEndpoint(`https://${address}`).baseUrl).toBe(
      `https://${address}`
    )
  })
})

describe('requestCommunicationApi', () => {
  it('rejects a default trust record for a different authority before DNS or request', async () => {
    const resolveDns = vi.fn()
    const requester = vi.fn()
    await expect(
      defaultRequest({ resolveDns, request: requester }, { endpointTrust: { kind: 'default' } })
    ).rejects.toMatchObject({ code: 'endpoint_confirmation_required' })
    expect(resolveDns).not.toHaveBeenCalled()
    expect(requester).not.toHaveBeenCalled()
  })

  it('requires exact custom authority equality', async () => {
    await expect(
      defaultRequest({}, { endpointTrust: { kind: 'custom', authority: 'API.example.com' } })
    ).rejects.toMatchObject({ code: 'endpoint_confirmation_required' })
  })

  it.each([
    [{ address: '10.0.0.1', family: 4 }],
    [{ address: '64:ff9b::a00:1', family: 6 }],
    [{ address: '2002:a00:1::1', family: 6 }]
  ] as const)('rejects a DNS snapshot mixing a public and blocked address', async (blocked) => {
    const requester = vi.fn()
    await expect(
      defaultRequest({
        resolveDns: async () => [{ address: '93.184.216.34', family: 4 }, blocked],
        request: requester
      })
    ).rejects.toMatchObject({ code: 'endpoint_blocked' })
    expect(requester).not.toHaveBeenCalled()
  })

  it('destroys a non-success response without reading its body', async () => {
    const fixture = transport({ statusCode: 401, chunks: [Buffer.from('must-not-be-read')] })
    await expect(defaultRequest(fixture.dependencies)).resolves.toEqual({
      statusCode: 401,
      body: null
    })
    expect(fixture.response().destroy).toHaveBeenCalledTimes(1)
    expect(fixture.request.destroy).toHaveBeenCalledTimes(1)
    expect(fixture.response().resume).not.toHaveBeenCalled()
    expect(fixture.response().listenerCount('data')).toBe(0)
  })

  it.each([
    ['empty', async (): Promise<readonly CommunicationResolvedAddress[]> => []],
    [
      'failed',
      async (): Promise<readonly CommunicationResolvedAddress[]> => {
        throw new Error('contains-hostname')
      }
    ]
  ])('maps %s DNS resolution to a redacted error', async (_name, resolveDns) => {
    await expect(defaultRequest({ resolveDns })).rejects.toMatchObject({
      code: 'endpoint_dns_failed',
      message: 'The API endpoint could not be resolved.'
    })
  })

  it('pins the HTTPS lookup to the approved DNS snapshot', async () => {
    const snapshot: readonly CommunicationResolvedAddress[] = [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 }
    ]
    const fixture = transport({ statusCode: 200, chunks: [Buffer.from('{}')] })
    const response = defaultRequest({ ...fixture.dependencies, resolveDns: async () => snapshot })
    await expect(response).resolves.toMatchObject({ statusCode: 200 })
    const lookup = fixture.options().lookup
    if (!lookup) {
      throw new Error('Pinned lookup was not installed.')
    }
    const addresses = await new Promise<readonly CommunicationResolvedAddress[]>(
      (resolve, reject) => {
        lookup('api.example.com', { all: true }, (error, values) => {
          if (error) {
            reject(error)
          } else if (Array.isArray(values)) {
            resolve(
              values.flatMap(({ address, family }) =>
                family === 4 || family === 6 ? [{ address, family }] : []
              )
            )
          } else {
            reject(new Error('Pinned lookup did not return the approved snapshot.'))
          }
        })
      }
    )
    expect(addresses).toEqual(snapshot)
    expect(fixture.options()).toMatchObject({
      hostname: 'api.example.com',
      servername: 'api.example.com',
      path: '/base/status'
    })
  })

  it('rejects redirects without following them', async () => {
    const fixture = transport({ statusCode: 302 })
    await expect(defaultRequest(fixture.dependencies)).rejects.toMatchObject({
      code: 'redirect_rejected'
    })
    expect(fixture.request.destroy).toHaveBeenCalledTimes(1)
  })

  it('applies one total timeout that includes DNS', async () => {
    vi.useFakeTimers()
    const pending = defaultRequest({ resolveDns: () => new Promise(() => undefined) })
    const expectation = expect(pending).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(10_000)
    await expectation
  })

  it('rejects a response larger than 64 KiB', async () => {
    const fixture = transport({ statusCode: 200, chunks: [Buffer.alloc(64 * 1_024 + 1)] })
    await expect(defaultRequest(fixture.dependencies)).rejects.toMatchObject({
      code: 'invalid_response'
    })
    expect(fixture.request.destroy).toHaveBeenCalledTimes(1)
  })

  it('does not expose credentials from request or response errors', async () => {
    const token = 'xoxp-secret-value'
    const fixture = transport({ statusCode: 200, requestError: true })
    const result = defaultRequest(fixture.dependencies, {
      headers: { authorization: `Bearer ${token}` }
    })
    await expect(result).rejects.toMatchObject({
      code: 'network_error',
      message: 'The provider request failed.'
    })
    await expect(result.catch((error: unknown) => String(error))).resolves.not.toContain(token)
  })

  it('maps a malformed successful JSON response without including its body', async () => {
    const secret = 'response-secret-value'
    const fixture = transport({ statusCode: 200, chunks: [Buffer.from(secret)] })
    await expect(defaultRequest(fixture.dependencies)).rejects.toSatisfy(
      (error: unknown) => errorCode(error) === 'invalid_response' && !String(error).includes(secret)
    )
  })
})
