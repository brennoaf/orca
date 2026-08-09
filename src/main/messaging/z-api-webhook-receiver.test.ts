import { request as httpRequest } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ZApiWebhookReceiver } from './z-api-webhook-receiver'
import type { NormalizedZApiMessage } from './z-api-message-normalizer'

const receivers: ZApiWebhookReceiver[] = []

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'ReceivedCallback',
    instanceId: 'instance-1',
    messageId: 'message-1',
    momment: 1_786_250_000_000,
    phone: '5511999999999',
    fromMe: false,
    text: { message: 'oi' },
    ...overrides
  }
}

function receiver(
  options: {
    ingest?: (message: NormalizedZApiMessage) => { inserted: boolean; messageId: number }
    now?: () => number
  } = {}
) {
  const onError = vi.fn()
  const value = new ZApiWebhookReceiver({
    port: 0,
    path: '/webhook/secret-path',
    expectedInstanceId: 'instance-1',
    store: {
      ingest: options.ingest ?? (() => ({ inserted: true, messageId: 1 }))
    },
    onError,
    now: options.now
  })
  receivers.push(value)
  return { value, onError }
}

async function post(
  port: number,
  path: string,
  body: string,
  headers: Record<string, string> = { 'Content-Type': 'application/json' }
): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { hostname: '127.0.0.1', port, path, method: 'POST', headers },
      (response) => {
        response.resume()
        response.once('end', () => resolve(response.statusCode ?? 0))
      }
    )
    request.once('error', reject)
    request.end(body)
  })
}

afterEach(async () => {
  await Promise.all(receivers.splice(0).map((value) => value.stop()))
})

describe('ZApiWebhookReceiver', () => {
  it('binds loopback, exposes health, and starts and stops idempotently', async () => {
    const { value } = receiver()
    const first = await value.start()
    const second = await value.start()
    expect(first).toEqual(second)
    expect(first).toMatchObject({ host: '127.0.0.1', path: '/webhook/secret-path' })
    expect(
      await fetch(`http://127.0.0.1:${first.port}${first.path}`, { method: 'HEAD' }).then(
        (response) => response.status
      )
    ).toBe(204)
    await expect(Promise.all([value.stop(), value.stop()])).resolves.toEqual([undefined, undefined])
  })

  it('persists before returning 2xx and acknowledges duplicates', async () => {
    const persisted: string[] = []
    const { value } = receiver({
      ingest: (message) => {
        persisted.push(message.messageId)
        return { inserted: persisted.length === 1, messageId: 1 }
      }
    })
    const endpoint = await value.start()
    const body = JSON.stringify(payload())
    expect(await post(endpoint.port, endpoint.path, body)).toBe(204)
    expect(persisted).toEqual(['message-1'])
    expect(await post(endpoint.port, endpoint.path, body)).toBe(204)
    expect(persisted).toEqual(['message-1', 'message-1'])
  })

  it.each([
    {
      type: 'DeliveryCallback',
      instanceId: 'instance-1',
      messageId: 'message-1',
      phone: '5511999999999',
      momment: 1
    },
    {
      type: 'MessageStatusCallback',
      instanceId: 'instance-1',
      status: 'SENT',
      ids: ['message-1'],
      phone: '5511999999999',
      momment: 1
    },
    {
      type: 'ConnectedCallback',
      instanceId: 'instance-1',
      connected: true,
      phone: '5511999999999',
      momment: 1
    },
    {
      type: 'DisconnectedCallback',
      instanceId: 'instance-1',
      disconnected: true,
      error: 'offline',
      momment: 1
    },
    {
      type: 'PresenceChatCallback',
      instanceId: 'instance-1',
      status: 'AVAILABLE',
      phone: '5511999999999',
      lastSeen: null
    },
    {
      type: 'ReceivedCallback',
      instanceId: 'instance-1',
      notification: 'PROFILE_PICTURE_UPDATED',
      phone: '5511999999999',
      fromMe: true,
      momment: 1
    }
  ])('acknowledges a known provider event without persisting it', async (event) => {
    const ingest = vi.fn(() => ({ inserted: true, messageId: 1 }))
    const { value } = receiver({ ingest })
    const endpoint = await value.start()
    expect(await post(endpoint.port, endpoint.path, JSON.stringify(event))).toBe(204)
    expect(ingest).not.toHaveBeenCalled()
  })

  it('rejects a callback from another instance before persistence', async () => {
    const ingest = vi.fn(() => ({ inserted: true, messageId: 1 }))
    const { value } = receiver({ ingest })
    const endpoint = await value.start()
    expect(
      await post(endpoint.port, endpoint.path, JSON.stringify(payload({ instanceId: 'other' })))
    ).toBe(403)
    expect(ingest).not.toHaveBeenCalled()
  })

  it('proves reachability with a single-use expiring challenge', async () => {
    let now = 100
    const { value } = receiver({ now: () => now })
    const endpoint = await value.start()
    const url = `http://127.0.0.1:${endpoint.port}${endpoint.path}`
    expect(await fetch(url).then((response) => response.status)).toBe(403)
    value.armChallenge('challenge_nonce_123456', 10)
    expect(await fetch(url, { method: 'HEAD' }).then((response) => response.status)).toBe(204)
    expect(
      await fetch(url, { headers: { 'X-Orca-Webhook-Challenge': 'wrong_nonce_123456' } }).then(
        (response) => response.status
      )
    ).toBe(403)
    const accepted = await fetch(url, {
      headers: { 'X-Orca-Webhook-Challenge': 'challenge_nonce_123456' }
    })
    expect(accepted.status).toBe(200)
    expect(accepted.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(accepted.headers.get('content-length')).toBe(
      String(Buffer.byteLength('challenge_nonce_123456'))
    )
    expect(await accepted.text()).toBe('challenge_nonce_123456')
    expect(
      await fetch(url, {
        headers: { 'X-Orca-Webhook-Challenge': 'challenge_nonce_123456' }
      }).then((response) => response.status)
    ).toBe(403)
    value.armChallenge('challenge_nonce_654321', 10)
    now = 111
    expect(
      await fetch(url, {
        headers: { 'X-Orca-Webhook-Challenge': 'challenge_nonce_654321' }
      }).then((response) => response.status)
    ).toBe(410)
  })

  it('returns explicit route, method, media-type, payload, and size errors', async () => {
    const { value } = receiver()
    const endpoint = await value.start()
    expect(await post(endpoint.port, '/wrong', JSON.stringify(payload()))).toBe(404)
    expect(
      await fetch(`http://127.0.0.1:${endpoint.port}${endpoint.path}`, { method: 'DELETE' }).then(
        (response) => response.status
      )
    ).toBe(405)
    expect(await post(endpoint.port, endpoint.path, '{}', { 'Content-Type': 'text/plain' })).toBe(
      415
    )
    expect(await post(endpoint.port, endpoint.path, '{')).toBe(400)
    expect(
      await post(endpoint.port, endpoint.path, 'x', {
        'Content-Type': 'application/json',
        'Content-Length': String(64 * 1_024 + 1)
      })
    ).toBe(413)
  })

  it('returns 500 only after a persistence failure and reports the safe error', async () => {
    const { value, onError } = receiver({
      ingest: () => {
        throw new Error('database unavailable')
      }
    })
    const endpoint = await value.start()
    expect(await post(endpoint.port, endpoint.path, JSON.stringify(payload()))).toBe(500)
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'database unavailable' })
    )
  })
})
