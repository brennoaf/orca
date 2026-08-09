import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { COMMUNICATION_WEBHOOK_CHALLENGE_MARKER } from './communication-webhook-challenge'
import { routeZApiCallback, ZApiCallbackError } from './z-api-message-normalizer'
import type { MessageStore } from './message-store'

const MAX_BODY_BYTES = 64 * 1_024
const REQUEST_TIMEOUT_MS = 5_000
const DEFAULT_CHALLENGE_TTL_MS = 30_000
const LOOPBACK_HOST = '127.0.0.1'

export type ZApiWebhookReceiverEndpoint = {
  host: typeof LOOPBACK_HOST
  port: number
  path: string
}

type ReceiverOptions = {
  port: number
  path: string
  expectedInstanceId: string | null
  store: Pick<MessageStore, 'ingest'>
  onError: (error: Error) => void
  now?: () => number
}

type PendingChallenge = {
  nonce: string
  expiresAt: number
}

class BodyTooLargeError extends Error {}

function validatePath(path: string): void {
  let parsed: URL
  try {
    parsed = new URL(path, 'http://127.0.0.1')
  } catch {
    throw new Error('Z-API webhook path is invalid.')
  }
  if (
    path === '/' ||
    !path.startsWith('/') ||
    parsed.pathname !== path ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new Error('Z-API webhook path is invalid.')
  }
}

function response(
  res: ServerResponse,
  statusCode: number,
  headers?: Record<string, string>,
  body?: string
): void {
  res.writeHead(statusCode, headers)
  res.end(body)
}

function contentLength(req: IncomingMessage): number | null {
  const header = req.headers['content-length']
  if (header === undefined) {
    return null
  }
  if (!/^\d+$/u.test(header)) {
    return null
  }
  return Number(header)
}

function hasJsonContentType(req: IncomingMessage): boolean {
  const contentType = req.headers['content-type']
  if (typeof contentType !== 'string') {
    return false
  }
  const mediaType = contentType.split(';', 1)[0]?.trim().toLowerCase()
  return mediaType === 'application/json' || Boolean(mediaType?.endsWith('+json'))
}

function requestPathname(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    return url.search.length === 0 && url.hash.length === 0 ? url.pathname : null
  } catch {
    return null
  }
}

function hasChallengeMarker(req: IncomingMessage): boolean {
  return req.headers['x-orca-webhook-challenge'] === COMMUNICATION_WEBHOOK_CHALLENGE_MARKER
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > MAX_BODY_BYTES) {
      throw new BodyTooLargeError()
    }
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

export class ZApiWebhookReceiver {
  private readonly options: ReceiverOptions
  private server: Server | null = null
  private endpoint: ZApiWebhookReceiverEndpoint | null = null
  private startPromise: Promise<ZApiWebhookReceiverEndpoint> | null = null
  private stopPromise: Promise<void> | null = null
  private pendingChallenge: PendingChallenge | null = null
  private expectedInstanceId: string | null

  constructor(options: ReceiverOptions) {
    if (!Number.isSafeInteger(options.port) || options.port < 0 || options.port > 65_535) {
      throw new Error('Z-API webhook port is invalid.')
    }
    validatePath(options.path)
    if (
      options.expectedInstanceId !== null &&
      (!options.expectedInstanceId ||
        options.expectedInstanceId.trim() !== options.expectedInstanceId)
    ) {
      throw new Error('Z-API expected instance ID is invalid.')
    }
    this.options = options
    this.expectedInstanceId = options.expectedInstanceId
  }

  setExpectedInstanceId(instanceId: string | null): void {
    if (instanceId !== null && (!instanceId || instanceId.trim() !== instanceId)) {
      throw new Error('Z-API expected instance ID is invalid.')
    }
    this.expectedInstanceId = instanceId
  }

  armChallenge(nonce: string, ttlMs = DEFAULT_CHALLENGE_TTL_MS): void {
    if (!/^[A-Za-z0-9_-]{16,256}$/u.test(nonce)) {
      throw new Error('Z-API webhook challenge is invalid.')
    }
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
      throw new Error('Z-API webhook challenge TTL is invalid.')
    }
    this.pendingChallenge = {
      nonce,
      expiresAt: (this.options.now ?? Date.now)() + ttlMs
    }
  }

  start(): Promise<ZApiWebhookReceiverEndpoint> {
    if (this.endpoint) {
      return Promise.resolve(this.endpoint)
    }
    if (this.startPromise) {
      return this.startPromise
    }
    this.startPromise = new Promise<ZApiWebhookReceiverEndpoint>((resolve, reject) => {
      const server = createServer((req, res) => {
        void this.handleRequest(req, res)
      })
      this.server = server
      const onStartupError = (error: Error): void => {
        server.off('listening', onListening)
        this.server = null
        this.startPromise = null
        reject(error)
      }
      const onListening = (): void => {
        server.off('error', onStartupError)
        server.on('error', this.options.onError)
        const address = server.address()
        if (!address || typeof address === 'string') {
          server.close()
          this.server = null
          this.startPromise = null
          reject(new Error('Z-API webhook receiver did not expose a TCP port.'))
          return
        }
        this.endpoint = { host: LOOPBACK_HOST, port: address.port, path: this.options.path }
        resolve(this.endpoint)
      }
      server.once('error', onStartupError)
      server.once('listening', onListening)
      server.listen(this.options.port, LOOPBACK_HOST)
    })
    return this.startPromise
  }

  stop(): Promise<void> {
    if (this.stopPromise) {
      return this.stopPromise
    }
    const server = this.server
    if (!server) {
      this.endpoint = null
      this.startPromise = null
      this.pendingChallenge = null
      return Promise.resolve()
    }
    this.stopPromise = new Promise<void>((resolve, reject) => {
      server.close((error) => {
        this.server = null
        this.endpoint = null
        this.startPromise = null
        this.stopPromise = null
        this.pendingChallenge = null
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
    return this.stopPromise
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const pathname = requestPathname(req)
    if (pathname !== this.options.path) {
      response(res, 404)
      return
    }
    if (req.method === 'HEAD') {
      response(res, hasChallengeMarker(req) ? 204 : 403)
      return
    }
    if (req.method === 'GET') {
      this.handleChallenge(req, res)
      return
    }
    if (req.method !== 'POST') {
      response(res, 405, { Allow: 'GET, HEAD, POST' })
      return
    }
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy()
    })
    const declaredLength = contentLength(req)
    if (declaredLength !== null && declaredLength > MAX_BODY_BYTES) {
      req.resume()
      response(res, 413)
      return
    }
    if (!hasJsonContentType(req)) {
      req.resume()
      response(res, 415)
      return
    }
    if (this.expectedInstanceId === null) {
      req.resume()
      response(res, 503)
      return
    }
    try {
      const payload = await readJson(req)
      const routed = routeZApiCallback(payload)
      if (routed.instanceId !== this.expectedInstanceId) {
        response(res, 403)
        return
      }
      if (routed.kind === 'message') {
        this.options.store.ingest(routed.message)
      }
      response(res, 204)
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        response(res, 413)
        return
      }
      if (error instanceof SyntaxError || error instanceof ZApiCallbackError) {
        response(res, 400)
        return
      }
      this.options.onError(error instanceof Error ? error : new Error('Webhook ingestion failed.'))
      response(res, 500)
    }
  }

  private handleChallenge(req: IncomingMessage, res: ServerResponse): void {
    if (!hasChallengeMarker(req)) {
      response(res, 403)
      return
    }
    const challenge = this.pendingChallenge
    if (!challenge) {
      response(res, 403)
      return
    }
    if ((this.options.now ?? Date.now)() >= challenge.expiresAt) {
      this.pendingChallenge = null
      response(res, 410)
      return
    }
    this.pendingChallenge = null
    response(
      res,
      200,
      {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': String(Buffer.byteLength(challenge.nonce)),
        'Cache-Control': 'no-store'
      },
      challenge.nonce
    )
  }
}
