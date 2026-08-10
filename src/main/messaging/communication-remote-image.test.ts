import { EventEmitter } from 'node:events'
import type { RequestOptions } from 'node:https'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  CommunicationApiRequestDependencies,
  CommunicationHttpsRequest,
  CommunicationHttpsResponse,
  CommunicationHttpsRequester
} from './communication-api-endpoint'
import { downloadCommunicationRemoteImage } from './communication-remote-image'

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
  headers?: Readonly<Record<string, string>>
  chunks?: readonly Buffer[]
  requestError?: boolean
  responseError?: boolean
  pending?: boolean
  emitEnd?: boolean
  emitClose?: boolean
}

function transport(fixtures: readonly Fixture[]): {
  dependencies: CommunicationApiRequestDependencies
  options: readonly RequestOptions[]
  requests: readonly FakeRequest[]
  responses: readonly FakeResponse[]
  resolveDns: ReturnType<typeof vi.fn>
} {
  const options: RequestOptions[] = []
  const requests: FakeRequest[] = []
  const responses: FakeResponse[] = []
  const resolveDns = vi.fn(async () => [{ address: '8.8.8.8', family: 4 as const }])
  const requester: CommunicationHttpsRequester = (requestOptions, respond) => {
    const fixture = fixtures[options.length]
    if (!fixture) {
      throw new Error('Unexpected remote image request.')
    }
    options.push(requestOptions)
    const request = new FakeRequest()
    requests.push(request)
    if (!fixture.pending) {
      queueMicrotask(() => {
        if (fixture.requestError) {
          request.emit('error', new Error('secret-request-detail'))
          return
        }
        const response = new FakeResponse(fixture.statusCode ?? 200, fixture.headers ?? {})
        responses.push(response)
        respond(response as unknown as CommunicationHttpsResponse)
        if (fixture.responseError) {
          response.emit('error', new Error('secret-response-detail'))
          if (fixture.emitClose) {
            response.emit('close')
          }
          return
        }
        for (const chunk of fixture.chunks ?? []) {
          response.emit('data', chunk)
        }
        if (fixture.emitEnd !== false) {
          response.emit('end')
        }
        if (fixture.emitClose) {
          response.emit('close')
        }
      })
    }
    return request as unknown as CommunicationHttpsRequest
  }
  return {
    dependencies: { resolveDns, request: requester },
    options,
    requests,
    responses,
    resolveDns
  }
}

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0x00])
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const WEBP = Buffer.from('RIFF0000WEBP', 'ascii')

afterEach(() => {
  vi.useRealTimers()
})

describe('downloadCommunicationRemoteImage', () => {
  it.each([
    ['image/jpeg', JPEG],
    ['image/png', PNG],
    ['image/webp', WEBP]
  ] as const)('accepts a bounded %s response with matching magic bytes', async (mimeType, body) => {
    const fixture = transport([
      {
        headers: { 'content-type': mimeType, 'content-length': String(body.length) },
        chunks: [body]
      }
    ])

    await expect(
      downloadCommunicationRemoteImage(
        'https://cdn.example.com/avatar?signature=value',
        fixture.dependencies
      )
    ).resolves.toEqual({ mimeType, content: body })
    expect(fixture.options[0]).toMatchObject({
      protocol: 'https:',
      hostname: 'cdn.example.com',
      path: '/avatar?signature=value',
      method: 'GET'
    })
    expect(fixture.options[0]?.headers).toBeUndefined()
    expect(fixture.options[0]?.auth).toBeUndefined()
  })

  it.each([
    'http://cdn.example.com/avatar.jpg',
    'https://user:password@cdn.example.com/avatar.jpg',
    'https://cdn.example.com/avatar.jpg#secret',
    'https://localhost/avatar.jpg',
    'https://169.254.169.254/avatar.jpg'
  ])('rejects the unsafe image URL %s before issuing a request', async (url) => {
    const fixture = transport([])
    await expect(downloadCommunicationRemoteImage(url, fixture.dependencies)).rejects.toThrow()
    expect(fixture.options).toHaveLength(0)
  })

  it('pins DNS independently after each allowed redirect', async () => {
    const fixture = transport([
      { statusCode: 302, headers: { location: 'https://images.example.net/final.png' } },
      { headers: { 'content-type': 'image/png' }, chunks: [PNG] }
    ])

    await expect(
      downloadCommunicationRemoteImage('https://cdn.example.com/start', fixture.dependencies)
    ).resolves.toEqual({ mimeType: 'image/png', content: PNG })
    expect(fixture.resolveDns.mock.calls.map(([hostname]) => hostname)).toEqual([
      'cdn.example.com',
      'images.example.net'
    ])
    expect(fixture.options).toHaveLength(2)
  })

  it('destroys a redirect response before continuing and ignores its late error and close', async () => {
    const fixture = transport([
      {
        statusCode: 302,
        headers: { location: 'https://images.example.net/final.png' },
        responseError: true,
        emitEnd: false,
        emitClose: true
      },
      { headers: { 'content-type': 'image/png' }, chunks: [PNG] }
    ])

    await expect(
      downloadCommunicationRemoteImage('https://cdn.example.com/start', fixture.dependencies)
    ).resolves.toEqual({ mimeType: 'image/png', content: PNG })
    expect(fixture.responses[0]?.destroy).toHaveBeenCalledOnce()
    expect(fixture.requests[0]?.destroy).toHaveBeenCalledOnce()
  })

  it('destroys a non-success response without draining an endless body', async () => {
    const fixture = transport([
      {
        statusCode: 503,
        headers: { 'content-type': 'application/octet-stream' },
        chunks: [Buffer.alloc(64 * 1024)],
        emitEnd: false
      }
    ])

    await expect(
      downloadCommunicationRemoteImage('https://cdn.example.com/avatar', fixture.dependencies)
    ).rejects.toThrow('request failed')
    expect(fixture.responses[0]?.destroy).toHaveBeenCalledOnce()
    expect(fixture.responses[0]?.resume).not.toHaveBeenCalled()
    expect(fixture.requests[0]?.destroy).toHaveBeenCalledOnce()
  })

  it('rejects a blocked redirect and more than two redirects', async () => {
    const blocked = transport([
      { statusCode: 302, headers: { location: 'https://127.0.0.1/avatar.png' } }
    ])
    await expect(
      downloadCommunicationRemoteImage('https://cdn.example.com/start', blocked.dependencies)
    ).rejects.toThrow()
    expect(blocked.options).toHaveLength(1)

    const excessive = transport([
      { statusCode: 301, headers: { location: 'https://one.example.com/a' } },
      { statusCode: 302, headers: { location: 'https://two.example.com/a' } },
      { statusCode: 307, headers: { location: 'https://three.example.com/a' } }
    ])
    await expect(
      downloadCommunicationRemoteImage('https://zero.example.com/a', excessive.dependencies)
    ).rejects.toThrow()
    expect(excessive.options).toHaveLength(3)
  })

  it('enforces one total timeout while DNS is pending', async () => {
    vi.useFakeTimers()
    const resolveDns = vi.fn(() => new Promise<never>(() => undefined))
    const promise = downloadCommunicationRemoteImage('https://cdn.example.com/avatar.jpg', {
      resolveDns,
      request: vi.fn()
    })
    const rejection = expect(promise).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(5_000)
    await rejection
  })

  it('rejects declared and streamed bodies above 512 KiB', async () => {
    const declared = transport([
      {
        headers: { 'content-type': 'image/jpeg', 'content-length': String(512 * 1024 + 1) },
        chunks: [JPEG]
      }
    ])
    await expect(
      downloadCommunicationRemoteImage('https://cdn.example.com/avatar.jpg', declared.dependencies)
    ).rejects.toThrow('invalid')
    expect(declared.requests[0]?.destroy).toHaveBeenCalled()

    const streamed = transport([
      {
        headers: { 'content-type': 'image/jpeg' },
        chunks: [Buffer.alloc(512 * 1024, 0xff), Buffer.from([0x00])]
      }
    ])
    await expect(
      downloadCommunicationRemoteImage('https://cdn.example.com/avatar.jpg', streamed.dependencies)
    ).rejects.toThrow('invalid')
    expect(streamed.requests[0]?.destroy).toHaveBeenCalled()
  })

  it.each([
    [{ 'content-type': 'text/html' }, JPEG],
    [{ 'content-type': 'image/png' }, JPEG],
    [{ 'content-type': 'image/jpeg', 'content-length': 'invalid' }, JPEG]
  ] as const)('rejects incompatible response metadata or bytes', async (headers, body) => {
    const fixture = transport([{ headers, chunks: [body] }])
    await expect(
      downloadCommunicationRemoteImage('https://cdn.example.com/avatar', fixture.dependencies)
    ).rejects.toThrow('invalid')
  })

  it('redacts request, response, DNS, and URL details from failures', async () => {
    const requestFailure = transport([{ requestError: true }])
    const first = await downloadCommunicationRemoteImage(
      'https://cdn.example.com/avatar?secret=query',
      requestFailure.dependencies
    ).catch((error: unknown) => error)
    expect(String(first)).not.toMatch(/secret|cdn\.example|query/u)

    const responseFailure = transport([
      { responseError: true, headers: { 'content-type': 'image/jpeg' } }
    ])
    const second = await downloadCommunicationRemoteImage(
      'https://cdn.example.com/avatar',
      responseFailure.dependencies
    ).catch((error: unknown) => error)
    expect(String(second)).not.toMatch(/secret|cdn\.example/u)

    const third = await downloadCommunicationRemoteImage('https://cdn.example.com/avatar', {
      resolveDns: vi.fn(async () => {
        throw new Error('secret-dns-detail')
      }),
      request: vi.fn()
    }).catch((error: unknown) => error)
    expect(String(third)).not.toMatch(/secret|cdn\.example/u)
  })
})
