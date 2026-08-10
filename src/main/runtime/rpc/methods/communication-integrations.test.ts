import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { ZApiConversationAvatarSnapshot } from '../../../../shared/communication-integrations'
import type { RpcContext } from '../core'

const mocks = vi.hoisted(() => ({
  getStatuses: vi.fn(async () => []),
  save: vi.fn<(params: unknown) => Promise<unknown>>(async () => ({ ok: true })),
  clear: vi.fn<(provider: unknown) => Promise<unknown>>(async () => ({ ok: true })),
  test: vi.fn<(provider: unknown) => Promise<unknown>>(async () => ({ ok: true })),
  zApiStatus: vi.fn(async () => ({})),
  zApiDiscard: vi.fn(async () => ({})),
  zApiPrepare: vi.fn(async () => ({})),
  zApiSave: vi.fn(async () => ({})),
  zApiConversations: vi.fn(async () => ({})),
  zApiMessages: vi.fn(async () => ({})),
  zApiAvatar: vi.fn<() => Promise<ZApiConversationAvatarSnapshot>>(async () => ({
    state: 'unavailable'
  })),
  zApiSend: vi.fn(async () => ({})),
  zApiRemove: vi.fn(async () => ({})),
  zApiStartValidation: vi.fn(async () => ({})),
  zApiCancelValidation: vi.fn(async () => ({}))
}))

vi.mock('../../../messaging/communication-integration-registry', () => ({
  COMMUNICATION_INTEGRATION_REGISTRY: {
    discord: {
      getStatus: vi.fn(() => ({
        readiness: { configured: false },
        clientId: null
      }))
    }
  },
  getCommunicationIntegrationStatuses: mocks.getStatuses,
  saveCommunicationIntegration: mocks.save,
  clearCommunicationIntegration: mocks.clear,
  testCommunicationIntegration: mocks.test,
  getZApiCommunicationIntegrationStatus: mocks.zApiStatus,
  discardPreparedZApiIngress: mocks.zApiDiscard,
  prepareZApiIngress: mocks.zApiPrepare,
  saveAndConfigureZApi: mocks.zApiSave,
  listZApiConversations: mocks.zApiConversations,
  listZApiMessages: mocks.zApiMessages,
  getZApiConversationAvatar: mocks.zApiAvatar,
  sendZApiReply: mocks.zApiSend,
  removeZApiCommunicationIntegration: mocks.zApiRemove,
  startZApiListeningValidation: mocks.zApiStartValidation,
  cancelZApiListeningValidation: mocks.zApiCancelValidation
}))

import { COMMUNICATION_INTEGRATION_METHODS } from './communication-integrations'

function method(name: string) {
  const result = COMMUNICATION_INTEGRATION_METHODS.find((candidate) => candidate.name === name)
  if (!result) {
    throw new Error(`Missing RPC method: ${name}`)
  }
  return result
}

describe('communication integration RPC methods', () => {
  beforeEach(() => {
    mocks.getStatuses.mockClear()
    mocks.save.mockClear()
    mocks.clear.mockClear()
    mocks.test.mockClear()
    mocks.zApiDiscard.mockClear()
    mocks.zApiPrepare.mockClear()
    mocks.zApiSave.mockClear()
    mocks.zApiStartValidation.mockClear()
    mocks.zApiCancelValidation.mockClear()
    mocks.zApiAvatar.mockClear()
  })

  it('registers the communication integration methods exactly once in its manifest', () => {
    expect(COMMUNICATION_INTEGRATION_METHODS.map(({ name }) => name)).toEqual([
      'communicationIntegrations.getStatuses',
      'communicationIntegrations.save',
      'communicationIntegrations.clear',
      'communicationIntegrations.test',
      'communicationIntegrations.zApi.prepareIngress',
      'communicationIntegrations.zApi.discardPreparedIngress',
      'communicationIntegrations.zApi.saveAndConfigure',
      'communicationIntegrations.zApi.getStatus',
      'communicationIntegrations.zApi.startListeningValidation',
      'communicationIntegrations.zApi.cancelListeningValidation',
      'communicationIntegrations.zApi.listConversations',
      'communicationIntegrations.zApi.listMessages',
      'communicationIntegrations.zApi.getConversationAvatar',
      'communicationIntegrations.zApi.sendReply',
      'communicationIntegrations.zApi.remove'
    ])
    expect(new Set(COMMUNICATION_INTEGRATION_METHODS.map(({ name }) => name)).size).toBe(15)
    const indexSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
    expect(indexSource.match(/\.\.\.COMMUNICATION_INTEGRATION_METHODS/g)).toHaveLength(1)
  })

  it('uses null params for getStatuses and delegates locally', async () => {
    const candidate = method('communicationIntegrations.getStatuses')
    expect(candidate.params).toBeNull()
    expect(await candidate.handler(undefined, {} as RpcContext)).toEqual([])
    expect(mocks.getStatuses).toHaveBeenCalledOnce()
  })

  it.each(['communicationIntegrations.clear', 'communicationIntegrations.test'])(
    'accepts only a strict known-provider object for %s',
    (name) => {
      const schema = method(name).params
      expect(schema?.safeParse({ provider: 'discord' }).success).toBe(true)
      expect(schema?.safeParse({ provider: 'unknown' }).success).toBe(false)
      expect(schema?.safeParse({ provider: 'slack', extra: true }).success).toBe(false)
    }
  )

  it('strictly validates legacy save variants and excludes Z-API', () => {
    const schema = method('communicationIntegrations.save').params
    const discord = {
      provider: 'discord',
      clientId: '12345678901234567',
      clientSecret: { action: 'replace', value: 'secret' }
    }
    const slack = {
      provider: 'slack',
      baseUrl: 'https://slack.com/api',
      endpointTrust: { kind: 'default' },
      appToken: { action: 'keep' },
      userToken: { action: 'clear' }
    }
    const zApi = {
      provider: 'z-api',
      baseUrl: 'https://api.z-api.io',
      endpointTrust: { kind: 'custom', authority: 'api.z-api.io' },
      instanceId: 'instance-1',
      instanceToken: { action: 'replace', value: 'instance-token' },
      clientToken: { action: 'replace', value: 'client-token' }
    }
    expect(schema?.safeParse(discord).success).toBe(true)
    expect(schema?.safeParse(slack).success).toBe(true)
    expect(schema?.safeParse(zApi).success).toBe(false)
    expect(schema?.safeParse({ ...discord, extra: true }).success).toBe(false)
    expect(
      schema?.safeParse({ ...discord, clientSecret: { action: 'keep', value: 'unexpected' } })
        .success
    ).toBe(false)
    expect(
      schema?.safeParse({ ...slack, endpointTrust: { kind: 'default', authority: 'unexpected' } })
        .success
    ).toBe(false)
    expect(schema?.safeParse({ ...discord, clientId: '1234567890123456' }).success).toBe(false)
    expect(schema?.safeParse({ ...discord, clientId: '123456789012345678901' }).success).toBe(false)
    expect(
      schema?.safeParse({
        ...discord,
        clientSecret: { action: 'replace', value: 'x'.repeat(4_097) }
      }).success
    ).toBe(false)
    expect(schema?.safeParse({ ...slack, baseUrl: 'x'.repeat(2_049) }).success).toBe(false)
  })

  it('strictly validates the transactional Z-API save contract', () => {
    const schema = method('communicationIntegrations.zApi.saveAndConfigure').params
    const input = {
      instanceId: 'instance-1',
      instanceToken: { action: 'keep' },
      clientToken: { action: 'replace', value: 'client-token' },
      apiBaseUrl: 'https://api.z-api.io',
      endpointTrust: { kind: 'default' },
      publicWebhookBaseUrl: 'https://webhook.example.com',
      listenPort: 4321
    }
    expect(schema?.safeParse(input).success).toBe(true)
    expect(schema?.safeParse({ ...input, extra: true }).success).toBe(false)
    expect(schema?.safeParse({ ...input, instanceToken: { action: 'clear' } }).success).toBe(false)
    expect(schema?.safeParse({ ...input, listenPort: 0 }).success).toBe(false)
    expect(schema?.safeParse({ ...input, instanceId: 'x'.repeat(257) }).success).toBe(false)
  })

  it('keeps phone numbers out of Z-API send params and bounds pagination', () => {
    const send = method('communicationIntegrations.zApi.sendReply').params
    const conversations = method('communicationIntegrations.zApi.listConversations').params
    expect(send?.safeParse({ conversationId: 1, text: 'hello' }).success).toBe(true)
    expect(
      send?.safeParse({ conversationId: 1, text: 'hello', phone: '5511999999999' }).success
    ).toBe(false)
    expect(send?.safeParse({ conversationId: 1, text: 'x'.repeat(4_097) }).success).toBe(false)
    expect(conversations?.safeParse({}).success).toBe(true)
    expect(conversations?.safeParse({ limit: 101, offset: 0 }).success).toBe(false)
    expect(conversations?.safeParse({ limit: 20, offset: -1 }).success).toBe(false)
  })

  it('strictly validates and locally delegates conversation avatar requests', async () => {
    const candidate = method('communicationIntegrations.zApi.getConversationAvatar')
    expect(candidate.params?.safeParse({ conversationId: 1 }).success).toBe(true)
    expect(candidate.params?.safeParse({ conversationId: 0 }).success).toBe(false)
    expect(
      candidate.params?.safeParse({ conversationId: Number.MAX_SAFE_INTEGER + 1 }).success
    ).toBe(false)
    expect(candidate.params?.safeParse({ conversationId: 1, phone: 'hidden' }).success).toBe(false)
    mocks.zApiAvatar.mockResolvedValueOnce({
      state: 'available',
      mimeType: 'image/webp',
      contentBase64: 'base64-content'
    })
    await expect(
      candidate.handler(candidate.params?.parse({ conversationId: 7 }), {} as RpcContext)
    ).resolves.toEqual({
      state: 'available',
      mimeType: 'image/webp',
      contentBase64: 'base64-content'
    })
    expect(mocks.zApiAvatar).toHaveBeenCalledExactlyOnceWith(7)
  })

  it('flows an ephemeral prepared port into transactional Z-API save', async () => {
    mocks.zApiPrepare.mockResolvedValueOnce({
      ok: true,
      value: { listenPort: 4321, localTunnelTarget: 'http://127.0.0.1:4321' }
    })
    const prepare = method('communicationIntegrations.zApi.prepareIngress')
    const prepared = await prepare.handler(
      prepare.params?.parse({ listenPort: 0 }),
      {} as RpcContext
    )
    const listenPort = (prepared as { value: { listenPort: number } }).value.listenPort
    const save = method('communicationIntegrations.zApi.saveAndConfigure')
    const input = save.params?.parse({
      instanceId: 'instance-1',
      instanceToken: { action: 'replace', value: 'instance-token' },
      clientToken: { action: 'replace', value: 'client-token' },
      apiBaseUrl: 'https://api.z-api.io',
      endpointTrust: { kind: 'default' },
      publicWebhookBaseUrl: 'https://webhook.example.com',
      listenPort
    })
    await save.handler(input, {} as RpcContext)

    expect(mocks.zApiPrepare).toHaveBeenCalledWith(0)
    expect(mocks.zApiSave).toHaveBeenCalledWith(expect.objectContaining({ listenPort: 4321 }))
  })

  it('uses null params when discarding an uncommitted Z-API receiver', async () => {
    const candidate = method('communicationIntegrations.zApi.discardPreparedIngress')
    expect(candidate.params).toBeNull()
    await candidate.handler(undefined, {} as RpcContext)
    expect(mocks.zApiDiscard).toHaveBeenCalledOnce()
  })

  it('starts validation without user-declared evidence and cancels only by attempt id', async () => {
    const snapshot = {
      state: 'awaiting',
      attemptId: '11111111-1111-4111-8111-111111111111',
      code: 'orca-000042',
      deadline: '2026-08-09T00:05:00.000Z',
      remainingMs: 300_000,
      confirmedAt: null,
      error: null
    }
    mocks.zApiStartValidation.mockResolvedValueOnce({ ok: true, value: snapshot })
    const start = method('communicationIntegrations.zApi.startListeningValidation')
    expect(start.params).toBeNull()
    const result = await start.handler(undefined, {} as RpcContext)
    expect(mocks.zApiStartValidation).toHaveBeenCalledOnce()
    expect(JSON.stringify(result)).not.toMatch(
      /phone|conversation|direction|receivedText|messageId|providerMessageId/iu
    )

    const cancel = method('communicationIntegrations.zApi.cancelListeningValidation')
    const attempt = { attemptId: '11111111-1111-4111-8111-111111111111' }
    expect(cancel.params?.safeParse(attempt).success).toBe(true)
    expect(cancel.params?.safeParse({ ...attempt, success: true }).success).toBe(false)
    expect(cancel.params?.safeParse({ ...attempt, messages: [] }).success).toBe(false)
    expect(cancel.params?.safeParse({ attemptId: 'not-a-uuid' }).success).toBe(false)
    await cancel.handler(cancel.params?.parse(attempt), {} as RpcContext)
    expect(mocks.zApiCancelValidation).toHaveBeenCalledExactlyOnceWith(attempt.attemptId)
  })

  it('rejects every method for paired and runtime clients before delegation', async () => {
    const remoteContext = { clientKind: 'runtime' } as RpcContext
    for (const candidate of COMMUNICATION_INTEGRATION_METHODS) {
      const params =
        candidate.name === 'communicationIntegrations.getStatuses'
          ? undefined
          : candidate.name === 'communicationIntegrations.save'
            ? {
                provider: 'discord',
                clientId: '12345678901234567',
                clientSecret: { action: 'keep' }
              }
            : { provider: 'discord' }
      await expect(
        Promise.resolve().then(() => candidate.handler(params, remoteContext))
      ).rejects.toThrow('only available to local windows')
    }
    expect(mocks.getStatuses).not.toHaveBeenCalled()
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.clear).not.toHaveBeenCalled()
    expect(mocks.test).not.toHaveBeenCalled()
  })

  it('delegates parsed save input without returning the secret itself', async () => {
    const candidate = method('communicationIntegrations.save')
    const parsed = candidate.params?.parse({
      provider: 'discord',
      clientId: '12345678901234567',
      clientSecret: { action: 'replace', value: 'sensitive-secret' }
    })
    mocks.save.mockResolvedValueOnce({
      ok: true,
      status: {
        provider: 'discord',
        endpoint: null,
        readiness: {
          configured: true,
          verified: false,
          sendReady: false,
          receiveReady: false,
          verifiedAt: null,
          lastError: null
        },
        clientId: '12345678901234567',
        clientSecretStored: true
      }
    })
    const result = await candidate.handler(parsed, {} as RpcContext)
    expect(mocks.save).toHaveBeenCalledWith(parsed)
    expect(JSON.stringify(result)).not.toContain('sensitive-secret')
  })
})
