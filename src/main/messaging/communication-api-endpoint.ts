import { lookup as dnsLookup } from 'node:dns/promises'
import type { ClientRequest, IncomingMessage } from 'node:http'
import { request as httpsRequest, type RequestOptions } from 'node:https'
import { isIP } from 'node:net'
import type {
  CommunicationApiEndpoint,
  CommunicationApiResponse,
  CommunicationEndpointTrust,
  CommunicationIntegrationErrorCode,
  CommunicationResolvedAddress
} from '../../shared/communication-integrations'
import {
  isBlockedCommunicationAddress,
  isBlockedCommunicationHostname
} from './communication-api-address-policy'

const MAX_ENDPOINT_CHARACTERS = 2_048
const MAX_RESPONSE_BYTES = 64 * 1_024
const REQUEST_TIMEOUT_MS = 10_000

export type CommunicationDnsResolver = (
  hostname: string
) => Promise<readonly CommunicationResolvedAddress[]>

export type CommunicationHttpsRequest = Pick<ClientRequest, 'on' | 'write' | 'end' | 'destroy'>

export type CommunicationHttpsResponse = Pick<
  IncomingMessage,
  'statusCode' | 'headers' | 'on' | 'destroy' | 'resume'
>

export type CommunicationHttpsRequester = (
  options: RequestOptions,
  response: (value: CommunicationHttpsResponse) => void
) => CommunicationHttpsRequest

export type CommunicationApiRequestDependencies = {
  resolveDns?: CommunicationDnsResolver
  request?: CommunicationHttpsRequester
}

export class CommunicationApiError extends Error {
  readonly code: CommunicationIntegrationErrorCode

  constructor(code: CommunicationIntegrationErrorCode, message: string) {
    super(message)
    this.name = 'CommunicationApiError'
    this.code = code
  }
}

export function normalizeCommunicationApiEndpoint(value: string): CommunicationApiEndpoint {
  const input = value.trim()
  if (!input || input.length > MAX_ENDPOINT_CHARACTERS) {
    throw new CommunicationApiError('endpoint_invalid', 'The API endpoint is invalid.')
  }
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new CommunicationApiError('endpoint_invalid', 'The API endpoint is invalid.')
  }
  const forbiddenUrlParts = Boolean(url.username || url.password || url.search || url.hash)
  if (url.protocol !== 'https:' || !url.hostname || forbiddenUrlParts) {
    throw new CommunicationApiError('endpoint_invalid', 'The API endpoint is invalid.')
  }
  const bare = url.hostname
    .replace(/^\[|\]$/g, '')
    .toLowerCase()
    .replace(/\.$/, '')
  if (!bare || isBlockedCommunicationHostname(bare)) {
    throw new CommunicationApiError('endpoint_blocked', 'The API endpoint is not allowed.')
  }
  const hostname = isIP(bare) === 6 ? `[${bare}]` : bare
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '')
  const authority = `${hostname}${url.port ? `:${url.port}` : ''}`
  const baseUrl = `https://${authority}${path}`
  if (baseUrl.length > MAX_ENDPOINT_CHARACTERS) {
    throw new CommunicationApiError('endpoint_invalid', 'The API endpoint is invalid.')
  }
  return { baseUrl, authority, hostname: bare, port: url.port }
}

export function assertCommunicationEndpointTrust(
  endpoint: CommunicationApiEndpoint,
  trust: CommunicationEndpointTrust,
  defaultBaseUrl: string
): void {
  const trustedAuthority =
    trust.kind === 'default'
      ? normalizeCommunicationApiEndpoint(defaultBaseUrl).authority
      : trust.authority
  if (trustedAuthority !== endpoint.authority) {
    throw new CommunicationApiError(
      'endpoint_confirmation_required',
      'Confirm the API endpoint before sending credentials.'
    )
  }
}

async function resolveApprovedAddresses(
  endpoint: CommunicationApiEndpoint,
  resolver: CommunicationDnsResolver
): Promise<readonly CommunicationResolvedAddress[]> {
  if (isIP(endpoint.hostname) !== 0) {
    return [{ address: endpoint.hostname, family: isIP(endpoint.hostname) as 4 | 6 }]
  }
  let addresses: readonly CommunicationResolvedAddress[]
  try {
    addresses = await resolver(endpoint.hostname)
  } catch {
    throw new CommunicationApiError(
      'endpoint_dns_failed',
      'The API endpoint could not be resolved.'
    )
  }
  if (addresses.length === 0 || addresses.some(({ address, family }) => isIP(address) !== family)) {
    throw new CommunicationApiError(
      'endpoint_dns_failed',
      'The API endpoint could not be resolved.'
    )
  }
  if (addresses.some(({ address }) => isBlockedCommunicationAddress(address))) {
    throw new CommunicationApiError('endpoint_blocked', 'The API endpoint is not allowed.')
  }
  return addresses
}

const defaultDnsResolver: CommunicationDnsResolver = async (hostname) => {
  const addresses = await dnsLookup(hostname, { all: true, verbatim: true })
  return addresses.flatMap(({ address, family }) =>
    family === 4 || family === 6 ? [{ address, family }] : []
  )
}

function pinnedLookup(
  addresses: readonly CommunicationResolvedAddress[]
): RequestOptions['lookup'] {
  return (_hostname, options, callback) => {
    const family = typeof options === 'number' ? options : options.family
    const eligible =
      family === 4 || family === 6
        ? addresses.filter((item) => item.family === family)
        : [...addresses]
    const first = eligible[0]
    if (!first) {
      callback(new Error('No approved address is available.'), '', 0)
      return
    }
    if (typeof options !== 'number' && options.all) {
      callback(null, eligible)
      return
    }
    callback(null, first.address, first.family)
  }
}

export async function requestCommunicationApi(
  args: {
    endpoint: CommunicationApiEndpoint
    endpointTrust: CommunicationEndpointTrust
    defaultBaseUrl: string
    method: 'GET' | 'POST' | 'PUT'
    path: string
    headers?: Readonly<Record<string, string>>
    body?: string
    responseType?: 'json' | 'text'
  },
  dependencies: CommunicationApiRequestDependencies = {}
): Promise<CommunicationApiResponse> {
  assertCommunicationEndpointTrust(args.endpoint, args.endpointTrust, args.defaultBaseUrl)
  const resolver = dependencies.resolveDns ?? defaultDnsResolver
  const requester: CommunicationHttpsRequester =
    dependencies.request ?? ((options, response) => httpsRequest(options, response))
  return new Promise((resolve, reject) => {
    let request: CommunicationHttpsRequest | null = null
    let settled = false
    const finish = (result: CommunicationApiResponse | CommunicationApiError): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (result instanceof CommunicationApiError) {
        reject(result)
      } else {
        resolve(result)
      }
    }
    const timer = setTimeout(() => {
      request?.destroy()
      finish(new CommunicationApiError('timeout', 'The provider request timed out.'))
    }, REQUEST_TIMEOUT_MS)
    void resolveApprovedAddresses(args.endpoint, resolver)
      .then((addresses) => {
        if (settled) {
          return
        }
        const path = `${args.endpoint.baseUrl}${args.path.startsWith('/') ? args.path : `/${args.path}`}`
        const url = new URL(path)
        request = requester(
          {
            protocol: 'https:',
            hostname: args.endpoint.hostname,
            port: args.endpoint.port || 443,
            path: `${url.pathname}${url.search}`,
            method: args.method,
            headers: args.headers,
            lookup: pinnedLookup(addresses),
            servername: args.endpoint.hostname
          },
          (response) => readResponse(response, request, args.responseType ?? 'json', finish)
        )
        request.on('error', () =>
          finish(new CommunicationApiError('network_error', 'The provider request failed.'))
        )
        if (args.body !== undefined) {
          request.write(args.body)
        }
        request.end()
      })
      .catch((error: unknown) =>
        finish(
          error instanceof CommunicationApiError
            ? error
            : new CommunicationApiError(
                'endpoint_dns_failed',
                'The API endpoint could not be resolved.'
              )
        )
      )
  })
}

function hasExpectedContentType(
  headers: IncomingMessage['headers'],
  responseType: 'json' | 'text'
): boolean {
  const raw = headers['content-type']
  if (typeof raw !== 'string') {
    return false
  }
  const mediaType = raw.split(';', 1)[0]?.trim().toLowerCase()
  return responseType === 'text'
    ? mediaType === 'text/plain'
    : mediaType === 'application/json' || mediaType?.endsWith('+json') === true
}

function readResponse(
  response: CommunicationHttpsResponse,
  request: CommunicationHttpsRequest | null,
  responseType: 'json' | 'text',
  finish: (result: CommunicationApiResponse | CommunicationApiError) => void
): void {
  const statusCode = response.statusCode ?? 0
  if (statusCode >= 300 && statusCode < 400) {
    response.destroy()
    request?.destroy()
    finish(new CommunicationApiError('redirect_rejected', 'Provider redirects are not allowed.'))
    return
  }
  if (statusCode < 200 || statusCode >= 300) {
    response.destroy()
    request?.destroy()
    finish({ statusCode, body: null })
    return
  }
  if (!hasExpectedContentType(response.headers, responseType)) {
    response.destroy()
    request?.destroy()
    finish(new CommunicationApiError('invalid_response', 'Provider response type is invalid.'))
    return
  }
  const chunks: Buffer[] = []
  let bytes = 0
  response.on('data', (chunk: Buffer) => {
    bytes += chunk.length
    if (bytes > MAX_RESPONSE_BYTES) {
      response.destroy()
      request?.destroy()
      finish(new CommunicationApiError('invalid_response', 'The provider response is invalid.'))
      return
    }
    chunks.push(chunk)
  })
  response.on('error', () =>
    finish(new CommunicationApiError('network_error', 'The provider request failed.'))
  )
  response.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    try {
      finish({ statusCode, body: responseType === 'text' ? body : JSON.parse(body) })
    } catch {
      finish(new CommunicationApiError('invalid_response', 'The provider response is invalid.'))
    }
  })
}
