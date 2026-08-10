import { request as httpsRequest, type RequestOptions } from 'node:https'
import {
  defaultDnsResolver,
  normalizeCommunicationApiEndpoint,
  pinnedLookup,
  resolveApprovedAddresses,
  type CommunicationApiRequestDependencies,
  type CommunicationHttpsRequest,
  type CommunicationHttpsResponse,
  type CommunicationHttpsRequester
} from './communication-api-endpoint'

const MAX_IMAGE_BYTES = 512 * 1024
const MAX_REDIRECTS = 2
const REQUEST_TIMEOUT_MS = 5_000

export type CommunicationRemoteImage = {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  content: Buffer
}

export class CommunicationRemoteImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CommunicationRemoteImageError'
  }
}

function invalidRemoteImage(): CommunicationRemoteImageError {
  return new CommunicationRemoteImageError('The remote image response is invalid.')
}

function remoteImageRequestFailed(): CommunicationRemoteImageError {
  return new CommunicationRemoteImageError('The remote image request failed.')
}

function destroyRemoteImageResponse(response: CommunicationHttpsResponse): void {
  response.on('error', () => undefined)
  response.destroy()
}

function parseRemoteImageUrl(value: string): {
  url: URL
  endpoint: ReturnType<typeof normalizeCommunicationApiEndpoint>
} {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new CommunicationRemoteImageError('The remote image URL is invalid.')
  }
  if (
    url.protocol !== 'https:' ||
    !url.hostname ||
    Boolean(url.username || url.password || url.hash)
  ) {
    throw new CommunicationRemoteImageError('The remote image URL is invalid.')
  }
  try {
    return { url, endpoint: normalizeCommunicationApiEndpoint(url.origin) }
  } catch {
    throw new CommunicationRemoteImageError('The remote image URL is not allowed.')
  }
}

function responseHeader(
  response: CommunicationHttpsResponse,
  name: 'content-length' | 'content-type' | 'location'
): string | null {
  const value = response.headers[name]
  return typeof value === 'string' ? value : null
}

function responseMimeType(
  response: CommunicationHttpsResponse
): CommunicationRemoteImage['mimeType'] | null {
  const value = responseHeader(response, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  return value === 'image/jpeg' || value === 'image/png' || value === 'image/webp' ? value : null
}

function declaredLength(response: CommunicationHttpsResponse): number | null {
  const value = responseHeader(response, 'content-length')
  if (value === null) {
    return null
  }
  if (!/^\d+$/u.test(value)) {
    throw invalidRemoteImage()
  }
  const length = Number(value)
  if (!Number.isSafeInteger(length) || length > MAX_IMAGE_BYTES) {
    throw invalidRemoteImage()
  }
  return length
}

function hasCompatibleMagicBytes(
  mimeType: CommunicationRemoteImage['mimeType'],
  content: Buffer
): boolean {
  if (mimeType === 'image/jpeg') {
    return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff
  }
  if (mimeType === 'image/png') {
    return (
      content.length >= 8 &&
      content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    )
  }
  return (
    content.length >= 12 &&
    content.subarray(0, 4).toString('ascii') === 'RIFF' &&
    content.subarray(8, 12).toString('ascii') === 'WEBP'
  )
}

export function downloadCommunicationRemoteImage(
  initialUrl: string,
  dependencies: CommunicationApiRequestDependencies = {}
): Promise<CommunicationRemoteImage> {
  const resolver = dependencies.resolveDns ?? defaultDnsResolver
  const requester: CommunicationHttpsRequester =
    dependencies.request ?? ((options, response) => httpsRequest(options, response))
  return new Promise((resolve, reject) => {
    let request: CommunicationHttpsRequest | null = null
    let response: CommunicationHttpsResponse | null = null
    let settled = false
    const finish = (result: CommunicationRemoteImage | CommunicationRemoteImageError): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      if (result instanceof CommunicationRemoteImageError) {
        reject(result)
      } else {
        resolve(result)
      }
    }
    const timer = setTimeout(() => {
      finish(new CommunicationRemoteImageError('The remote image request timed out.'))
      request?.destroy()
      if (response) {
        destroyRemoteImageResponse(response)
      }
    }, REQUEST_TIMEOUT_MS)

    const visit = async (value: string, redirects: number): Promise<void> => {
      let target: ReturnType<typeof parseRemoteImageUrl>
      try {
        target = parseRemoteImageUrl(value)
        const addresses = await resolveApprovedAddresses(target.endpoint, resolver)
        if (settled) {
          return
        }
        const options: RequestOptions = {
          protocol: 'https:',
          hostname: target.endpoint.hostname,
          port: target.endpoint.port || 443,
          path: `${target.url.pathname}${target.url.search}`,
          method: 'GET',
          lookup: pinnedLookup(addresses),
          servername: target.endpoint.hostname
        }
        let attemptRequest: CommunicationHttpsRequest | null = null
        let retired = false
        attemptRequest = requester(options, (incoming) => {
          response = incoming
          let ended = false
          const retire = (): void => {
            if (retired) {
              return
            }
            retired = true
            if (response === incoming) {
              response = null
            }
            destroyRemoteImageResponse(incoming)
            attemptRequest?.destroy()
          }
          const fail = (error: CommunicationRemoteImageError): void => {
            retire()
            finish(error)
          }
          incoming.on('error', () => {
            if (!retired) {
              fail(remoteImageRequestFailed())
            }
          })
          incoming.on('aborted', () => {
            if (!retired) {
              fail(remoteImageRequestFailed())
            }
          })
          incoming.on('close', () => {
            if (!retired && !ended) {
              fail(remoteImageRequestFailed())
            }
          })
          const statusCode = incoming.statusCode ?? 0
          if (statusCode >= 300 && statusCode < 400) {
            const location = responseHeader(incoming, 'location')
            if (!location || redirects >= MAX_REDIRECTS) {
              fail(invalidRemoteImage())
              return
            }
            let next: string
            try {
              next = new URL(location, target.url).toString()
            } catch {
              fail(invalidRemoteImage())
              return
            }
            retire()
            void visit(next, redirects + 1)
            return
          }
          if (statusCode < 200 || statusCode >= 300) {
            fail(remoteImageRequestFailed())
            return
          }
          const mimeType = responseMimeType(incoming)
          let expectedLength: number | null
          try {
            expectedLength = declaredLength(incoming)
          } catch {
            fail(invalidRemoteImage())
            return
          }
          if (!mimeType) {
            fail(invalidRemoteImage())
            return
          }
          const chunks: Buffer[] = []
          let bytes = 0
          incoming.on('data', (chunk: Buffer) => {
            bytes += chunk.length
            if (bytes > MAX_IMAGE_BYTES) {
              fail(invalidRemoteImage())
              return
            }
            chunks.push(chunk)
          })
          incoming.on('end', () => {
            ended = true
            if (retired) {
              return
            }
            if (expectedLength !== null && expectedLength !== bytes) {
              fail(invalidRemoteImage())
              return
            }
            const content = Buffer.concat(chunks, bytes)
            retired = true
            if (response === incoming) {
              response = null
            }
            finish(
              hasCompatibleMagicBytes(mimeType, content)
                ? { mimeType, content }
                : invalidRemoteImage()
            )
          })
        })
        request = attemptRequest
        attemptRequest.on('error', () => {
          if (!retired) {
            retired = true
            finish(remoteImageRequestFailed())
          }
        })
        if (retired) {
          attemptRequest.destroy()
        }
        attemptRequest.end()
      } catch {
        finish(remoteImageRequestFailed())
      }
    }

    void visit(initialUrl, 0)
  })
}
