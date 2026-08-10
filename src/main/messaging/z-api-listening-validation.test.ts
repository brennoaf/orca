import { mkdtempSync, rmSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SyncDatabase from '../sqlite/sync-database'
import { MessageStore } from './message-store'
import type { NormalizedZApiMessage } from './z-api-message-normalizer'
import { ZApiListeningValidation } from './z-api-listening-validation'
import { ZApiWebhookReceiver } from './z-api-webhook-receiver'

const CONFIGURATION_ID = '11111111111111111111111111111111'
const OTHER_CONFIGURATION_ID = '22222222222222222222222222222222'
const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111'
const CODE_NUMBER = 42
const CODE = 'orca-000042'
const INSTANCE_ID = 'instance-1'
const stores: MessageStore[] = []
const receivers: ZApiWebhookReceiver[] = []
const directories: string[] = []

function message(
  messageId: string,
  text: string,
  overrides: Partial<NormalizedZApiMessage> = {}
): NormalizedZApiMessage {
  return {
    provider: 'z-api',
    instanceId: INSTANCE_ID,
    messageId,
    conversationAddress: 'private-chat',
    conversationKind: 'private',
    senderAddress: null,
    conversationName: null,
    senderName: null,
    direction: 'inbound',
    occurredAt: 1,
    content: { kind: 'text', text },
    ...overrides
  }
}

function harness(
  path: string | ':memory:' = ':memory:',
  firstAttemptId = ATTEMPT_ID,
  randomNumber = CODE_NUMBER
) {
  let wallNow = 1_000
  let monotonicNow = 500
  let attemptSequence = 0
  const store = new MessageStore(path, { ttlMs: 1 })
  stores.push(store)
  const validation = new ZApiListeningValidation(store.listeningValidation, {
    wallNow: () => wallNow,
    monotonicNow: () => monotonicNow,
    randomNumber: () => randomNumber,
    randomAttemptId: () => {
      const sequence = attemptSequence++
      return sequence === 0
        ? firstAttemptId
        : `${sequence.toString(16).padStart(8, '0')}-2222-4222-8222-222222222222`
    }
  })
  return {
    store,
    validation,
    wallNow: () => wallNow,
    monotonicNow: () => monotonicNow,
    setWallNow: (value: number) => {
      wallNow = value
    },
    setMonotonicNow: (value: number) => {
      monotonicNow = value
    },
    context: (configurationId = CONFIGURATION_ID) => ({
      configurationId,
      persistedAt: wallNow,
      monotonicNow
    }),
    start: () => validation.start({ configurationId: CONFIGURATION_ID, instanceId: INSTANCE_ID })
  }
}

function post(port: number, path: string, payload: Record<string, unknown>): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      (response) => {
        response.resume()
        response.once('end', () => resolve(response.statusCode ?? 0))
      }
    )
    request.once('error', reject)
    request.end(JSON.stringify(payload))
  })
}

afterEach(async () => {
  await Promise.all(receivers.splice(0).map((receiver) => receiver.stop()))
  for (const store of stores.splice(0)) {
    store.close()
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('ZApiListeningValidation', () => {
  it('creates one idempotent 300 second attempt without persisting plaintext', () => {
    const value = harness()
    const first = value.start()
    const second = value.start()

    expect(first).toEqual({
      state: 'awaiting',
      attemptId: ATTEMPT_ID,
      code: CODE,
      deadline: new Date(301_000).toISOString(),
      remainingMs: 300_000,
      confirmedAt: null,
      error: null
    })
    expect(second).toEqual(first)
    expect(value.store.listeningValidation.readAttempt(ATTEMPT_ID)?.codeHash).not.toContain(CODE)
  })

  it.each([
    [0, 'orca-000000'],
    [42, 'orca-000042'],
    [999_999, 'orca-999999']
  ])('formats validation code boundary %i as %s', (randomNumber, expected) => {
    const value = harness(':memory:', ATTEMPT_ID, randomNumber)
    expect(value.start().code).toBe(expected)
  })

  it('uses monotonic time across forward and backward wall-clock jumps', () => {
    const value = harness()
    value.start()

    value.setWallNow(9_999_999_999_999)
    expect(value.validation.status(CONFIGURATION_ID)).toMatchObject({
      state: 'awaiting',
      remainingMs: 300_000
    })
    value.setWallNow(1)
    value.setMonotonicNow(300_499)
    expect(value.validation.status(CONFIGURATION_ID)).toMatchObject({
      state: 'awaiting',
      remainingMs: 1
    })

    value.store.ingest(message('wall-clock-skew', CODE), value.context())
    expect(value.validation.status(CONFIGURATION_ID)).toMatchObject({
      state: 'confirmed',
      confirmedAt: new Date(1).toISOString(),
      remainingMs: 0
    })
  })

  it('orders attempts by sequence after wall-clock rollback and prunes superseded terminals', () => {
    const value = harness()
    const first = value.start()
    if (first.state !== 'awaiting') {
      throw new Error('Expected awaiting validation.')
    }
    expect(value.validation.cancel(first.attemptId)).toMatchObject({
      state: 'cancelled',
      remainingMs: 0
    })
    expect(value.store.listeningValidation.readAttempt(first.attemptId)?.codeHash).toBeNull()

    value.setWallNow(100)
    value.setMonotonicNow(600)
    const second = value.start()
    expect(second).toMatchObject({ state: 'awaiting', remainingMs: 300_000 })
    expect(value.store.listeningValidation.readAttempt(first.attemptId)).toBeNull()
    expect(value.store.listeningValidation.readLatestAttempt(CONFIGURATION_ID)?.attemptId).toBe(
      second.attemptId
    )
  })

  it.each([
    ['inbound private', 'inbound', 'private-chat', null],
    ['outbound self', 'outbound', 'private-chat', 'self-address'],
    ['inbound group', 'inbound', 'group@g.us', 'participant-address'],
    ['outbound group', 'outbound', 'group@g.us', 'self-address']
  ] as const)(
    'confirms an exact new %s text callback',
    (_name, direction, address, senderAddress) => {
      const value = harness()
      value.start()
      const result = value.store.ingest(
        message(`message-${direction}-${address}`, CODE, {
          direction,
          conversationAddress: address,
          senderAddress
        }),
        value.context()
      )

      expect(result.inserted).toBe(true)
      expect(value.validation.status(CONFIGURATION_ID)).toMatchObject({
        state: 'confirmed',
        attemptId: ATTEMPT_ID,
        code: null,
        confirmedAt: new Date(value.wallNow()).toISOString()
      })
      expect(value.store.listeningValidation.readAttempt(ATTEMPT_ID)?.codeHash).toBeNull()
    }
  )

  it('rejects old and replayed messages but uses receipt time instead of provider time', () => {
    const value = harness()
    value.store.ingest(message('replayed-message', CODE, { occurredAt: 9_999_999_999_999 }))
    value.start()

    expect(value.store.ingest(message('replayed-message', CODE), value.context()).inserted).toBe(
      false
    )
    expect(value.validation.status(CONFIGURATION_ID).state).toBe('awaiting')

    value.store.ingest(message('new-message', CODE, { occurredAt: 0 }), value.context())
    expect(value.validation.status(CONFIGURATION_ID).state).toBe('confirmed')
  })

  it.each([
    ['wrong code', 'orca-999999'],
    ['case', CODE.toUpperCase()],
    ['space', `${CODE} `],
    ['unicode', CODE.replace('o', '\u043e')]
  ])('does not confirm %s', (_name, text) => {
    const value = harness()
    value.start()
    value.store.ingest(message(`message-${_name}`, text), value.context())
    expect(value.validation.status(CONFIGURATION_ID).state).toBe('awaiting')
  })

  it.each(['image', 'reaction'])('does not confirm unsupported %s content', (kind) => {
    const value = harness()
    value.start()
    value.store.ingest(
      message(`message-${kind}`, CODE, {
        content: { kind: 'unsupported', providerType: kind }
      }),
      value.context()
    )
    expect(value.validation.status(CONFIGURATION_ID).state).toBe('awaiting')
  })

  it('does not confirm a message status callback', async () => {
    const value = harness()
    value.start()
    const receiver = new ZApiWebhookReceiver({
      port: 0,
      path: '/webhook/status',
      expectedConfiguration: {
        instanceId: INSTANCE_ID,
        configurationId: CONFIGURATION_ID
      },
      store: value.store,
      onError: vi.fn(),
      now: value.wallNow,
      monotonicNow: value.monotonicNow
    })
    receivers.push(receiver)
    const endpoint = await receiver.start()

    expect(
      await post(endpoint.port, endpoint.path, {
        type: 'MessageStatusCallback',
        instanceId: INSTANCE_ID,
        status: 'SENT',
        ids: ['provider-message'],
        phone: 'private-chat',
        momment: 1
      })
    ).toBe(204)
    expect(value.store.listConversations()).toEqual([])
    expect(value.validation.status(CONFIGURATION_ID).state).toBe('awaiting')
  })

  it('requires matching instance and configuration identities', () => {
    const value = harness()
    value.start()
    value.store.ingest(
      message('other-instance', CODE, { instanceId: 'instance-2' }),
      value.context()
    )
    value.store.ingest(message('other-configuration', CODE), value.context(OTHER_CONFIGURATION_ID))
    expect(value.validation.status(CONFIGURATION_ID).state).toBe('awaiting')
  })

  it('does not confirm expired or cancelled attempts', () => {
    const expired = harness()
    expired.start()
    expired.setMonotonicNow(300_500)
    expired.store.ingest(message('expired', CODE), expired.context())
    expect(expired.validation.status(CONFIGURATION_ID).state).toBe('expired')
    expect(expired.store.listeningValidation.readAttempt(ATTEMPT_ID)?.codeHash).toBeNull()

    const cancelled = harness()
    const snapshot = cancelled.start()
    if (snapshot.state !== 'awaiting') {
      throw new Error('Expected awaiting validation.')
    }
    cancelled.validation.cancel(snapshot.attemptId)
    cancelled.store.ingest(message('cancelled', CODE), cancelled.context())
    expect(cancelled.validation.status(CONFIGURATION_ID).state).toBe('cancelled')
  })

  it('expires instead of cancelling at the exact monotonic deadline', () => {
    const value = harness()
    const awaiting = value.start()
    if (awaiting.state !== 'awaiting') {
      throw new Error('Expected awaiting validation.')
    }
    value.setWallNow(1)
    value.setMonotonicNow(300_500)
    expect(value.validation.cancel(awaiting.attemptId)).toMatchObject({
      state: 'expired',
      remainingMs: 0
    })
  })

  it('cancels pending plaintext on restart and restores confirmed state', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-z-api-validation-'))
    directories.push(directory)
    const path = join(directory, 'messaging.db')
    const first = harness(path)
    first.start()
    first.store.close()
    stores.splice(stores.indexOf(first.store), 1)

    const second = harness(path, '33333333-3333-4333-8333-333333333333')
    expect(second.validation.status(CONFIGURATION_ID)).toMatchObject({
      state: 'cancelled',
      code: null
    })
    expect(second.store.listeningValidation.readAttempt(ATTEMPT_ID)?.codeHash).toBeNull()
    const awaiting = second.start()
    if (awaiting.state !== 'awaiting') {
      throw new Error('Expected awaiting validation.')
    }
    second.store.ingest(message('confirmed-before-restart', awaiting.code), second.context())
    second.store.close()
    stores.splice(stores.indexOf(second.store), 1)

    const third = harness(path)
    expect(third.validation.status(CONFIGURATION_ID)).toMatchObject({
      state: 'confirmed',
      code: null,
      confirmedAt: new Date(third.wallNow()).toISOString()
    })
  })

  it('preserves confirmation through message retention', async () => {
    const value = harness()
    value.start()
    value.store.ingest(message('garbage-collected', CODE), value.context())
    await value.store.collectGarbage(value.wallNow() + 10)
    expect(value.store.listConversations()).toEqual([])
    expect(value.validation.confirmedAt(CONFIGURATION_ID)).toBe(value.wallNow())
  })

  it('bounds repeated retries to the latest terminal record without terminal hashes', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-z-api-validation-retries-'))
    directories.push(directory)
    const path = join(directory, 'messaging.db')
    const value = harness(path)
    for (let retry = 0; retry < 25; retry += 1) {
      const current = value.start()
      if (current.state !== 'awaiting') {
        throw new Error('Expected awaiting validation.')
      }
      value.validation.cancel(current.attemptId)
    }

    const latest = value.store.listeningValidation.readLatestAttempt(CONFIGURATION_ID)
    expect(latest).toMatchObject({ state: 'cancelled', codeHash: null })
    expect(latest?.sequence).toBe(25)
    const external = new SyncDatabase(path)
    const retained = external
      .prepare(
        `SELECT COUNT(*) AS count, COUNT(code_hash) AS hashes
         FROM z_api_listening_validation_attempts WHERE configuration_id = ?`
      )
      .get(CONFIGURATION_ID) as { count: number; hashes: number }
    external.close()
    expect(retained).toEqual({ count: 1, hashes: 0 })
  })

  it('invalidates the prior confirmation when the user explicitly starts again', () => {
    const value = harness()
    value.start()
    value.store.ingest(message('first-confirmation', CODE), value.context())
    expect(value.validation.confirmedAt(CONFIGURATION_ID)).toBe(value.wallNow())
    value.validation.status(CONFIGURATION_ID)

    const retry = value.start()
    expect(retry).toMatchObject({ state: 'awaiting', remainingMs: 300_000 })
    expect(value.validation.confirmedAt(CONFIGURATION_ID)).toBeNull()
    expect(value.store.listeningValidation.readAttempt(ATTEMPT_ID)).toBeNull()
  })

  it('retains only the active configuration across lifecycle cleanup', () => {
    const value = harness()
    const old = value.start()
    if (old.state !== 'awaiting') {
      throw new Error('Expected awaiting validation.')
    }
    value.validation.cancel(old.attemptId)
    const current = value.validation.start({
      configurationId: OTHER_CONFIGURATION_ID,
      instanceId: INSTANCE_ID
    })

    value.validation.retain(OTHER_CONFIGURATION_ID)
    expect(value.store.listeningValidation.readAttempt(old.attemptId)).toBeNull()
    expect(
      value.store.listeningValidation.readLatestAttempt(OTHER_CONFIGURATION_ID)?.attemptId
    ).toBe(current.attemptId)
  })

  it('serializes concurrent starts to one attempt', async () => {
    const value = harness()
    const snapshots = await Promise.all([
      Promise.resolve().then(value.start),
      Promise.resolve().then(value.start)
    ])
    expect(snapshots[0]).toEqual(snapshots[1])
    expect(value.store.listeningValidation.readLatestAttempt(CONFIGURATION_ID)?.attemptId).toBe(
      ATTEMPT_ID
    )
  })

  it('confirms once across concurrent duplicate callbacks', async () => {
    const value = harness()
    value.start()
    const receiver = new ZApiWebhookReceiver({
      port: 0,
      path: '/webhook/concurrent',
      expectedConfiguration: {
        instanceId: INSTANCE_ID,
        configurationId: CONFIGURATION_ID
      },
      store: value.store,
      onError: vi.fn(),
      now: value.wallNow,
      monotonicNow: value.monotonicNow
    })
    receivers.push(receiver)
    const endpoint = await receiver.start()
    const callback = {
      type: 'ReceivedCallback',
      instanceId: INSTANCE_ID,
      messageId: 'concurrent-message',
      momment: 1,
      phone: 'private-chat',
      fromMe: true,
      text: { message: CODE }
    }

    await expect(
      Promise.all([
        post(endpoint.port, endpoint.path, callback),
        post(endpoint.port, endpoint.path, callback)
      ])
    ).resolves.toEqual([204, 204])
    const conversation = value.store.listConversations()[0]
    expect(conversation).toBeDefined()
    expect(value.store.listRecentMessages(conversation!.id)).toHaveLength(1)
    expect(value.validation.status(CONFIGURATION_ID).state).toBe('confirmed')
  })

  it('rolls back insertion and returns 500 when atomic confirmation fails', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-z-api-validation-atomic-'))
    directories.push(directory)
    const path = join(directory, 'messaging.db')
    const value = harness(path)
    value.start()
    const external = new SyncDatabase(path)
    external.exec(
      `CREATE TRIGGER reject_validation_confirmation
       BEFORE UPDATE OF state ON z_api_listening_validation_attempts
       WHEN NEW.state = 'confirmed'
       BEGIN SELECT RAISE(ABORT, 'confirmation failed'); END`
    )
    external.close()
    const receiver = new ZApiWebhookReceiver({
      port: 0,
      path: '/webhook/secret',
      expectedConfiguration: {
        instanceId: INSTANCE_ID,
        configurationId: CONFIGURATION_ID
      },
      store: value.store,
      onError: vi.fn(),
      now: value.wallNow,
      monotonicNow: value.monotonicNow
    })
    receivers.push(receiver)
    const endpoint = await receiver.start()
    const callback = {
      type: 'ReceivedCallback',
      instanceId: INSTANCE_ID,
      messageId: 'atomic-message',
      momment: 0,
      phone: 'private-chat',
      fromMe: false,
      text: { message: CODE }
    }

    expect(await post(endpoint.port, endpoint.path, callback)).toBe(500)
    expect(value.store.listConversations()).toEqual([])
    expect(value.validation.status(CONFIGURATION_ID).state).toBe('awaiting')

    const cleanup = new SyncDatabase(path)
    cleanup.exec('DROP TRIGGER reject_validation_confirmation')
    cleanup.close()
    expect(await post(endpoint.port, endpoint.path, callback)).toBe(204)
    expect(value.store.listConversations()).toHaveLength(1)
    expect(value.validation.status(CONFIGURATION_ID).state).toBe('confirmed')
  })
})
