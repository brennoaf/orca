import { lookup as dnsLookup } from 'node:dns/promises'
import type { ClientRequest, IncomingMessage } from 'node:http'
import { request as httpsRequest, type RequestOptions } from 'node:https'
import { BlockList, isIP } from 'node:net'
import type {
  CommunicationApiEndpoint,
  CommunicationApiResponse,
  CommunicationEndpointTrust,
  CommunicationIntegrationErrorCode,
  CommunicationResolvedAddress
} from '../../shared/communication-integrations'

const MAX_ENDPOINT_CHARACTERS = 2_048
const MAX_RESPONSE_BYTES = 64 * 1_024
const REQUEST_TIMEOUT_MS = 10_000

const BLOCKED_IPV4_CIDRS =
  '0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 192.0.2.0/24 192.88.99.0/24 192.168.0.0/16 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/4 240.0.0.0/4'.split(
    ' '
  )
const BLOCKED_IPV6_CIDRS =
  '::/96 ::1/128 64:ff9b::/96 64:ff9b:1::/48 100::/64 2001:2::/48 2001:10::/28 2001:20::/28 2001:db8::/32 2002::/16 3fff::/20 5f00::/16 fc00::/7 fe80::/10 fec0::/10 ff00::/8'.split(
    ' '
  )
const METADATA_HOSTNAMES =
  'metadata metadata.google.internal metadata.azure.internal instance-data instance-data.ec2.internal metadata.oraclecloud.com'.split(
    ' '
  )
const blockedAddresses = new BlockList()

function addBlockedSubnets(cidrs: readonly string[], family: 'ipv4' | 'ipv6'): void {
  for (const cidr of cidrs) {
    const separator = cidr.lastIndexOf('/')
    const address = cidr.slice(0, separator)
    const prefix = Number(cidr.slice(separator + 1))
    blockedAddresses.addSubnet(address, prefix, family)
    if (family === 'ipv4') {
      blockedAddresses.addSubnet(`::ffff:${address}`, prefix + 96, 'ipv6')
    }
  }
}

addBlockedSubnets(BLOCKED_IPV4_CIDRS, 'ipv4')
addBlockedSubnets(BLOCKED_IPV6_CIDRS, 'ipv6')

export type CommunicationDnsResolver = (
  hostname: string
) => Promise<readonly CommunicationResolvedAddress[]>

export type CommunicationHttpsRequest = Pick<ClientRequest, 'on' | 'write' | 'end' | 'destroy'>

export type CommunicationHttpsResponse = Pick<
  IncomingMessage,
  'statusCode' | 'on' | 'destroy' | 'resume'
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

function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  const familyName = family === 4 ? 'ipv4' : family === 6 ? 'ipv6' : null
  return familyName === null || blockedAddresses.check(address, familyName)
}

function isBlockedHostname(hostname: string): boolean {
  const value = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return (
    value === 'localhost' ||
    value === 'local' ||
    value.endsWith('.localhost') ||
    value.endsWith('.local') ||
    METADATA_HOSTNAMES.some((blocked) => value === blocked || value.endsWith(`.${blocked}`)) ||
    (isIP(value) !== 0 && isBlockedAddress(value))
  )
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
  if (!bare || isBlockedHostname(bare)) {
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
  if (addresses.some(({ address }) => isBlockedAddress(address))) {
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
    method: 'GET' | 'POST'
    path: string
    headers?: Readonly<Record<string, string>>
    body?: string
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
          (response) => readResponse(response, request, finish)
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

function readResponse(
  response: CommunicationHttpsResponse,
  request: CommunicationHttpsRequest | null,
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
    try {
      finish({ statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) })
    } catch {
      finish(new CommunicationApiError('invalid_response', 'The provider response is invalid.'))
    }
  })
}
