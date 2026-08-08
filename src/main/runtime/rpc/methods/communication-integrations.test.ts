import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { RpcContext } from '../core'

const mocks = vi.hoisted(() => ({
  getStatuses: vi.fn(async () => []),
  save: vi.fn<(params: unknown) => Promise<unknown>>(async () => ({ ok: true })),
  clear: vi.fn<(provider: unknown) => Promise<unknown>>(async () => ({ ok: true })),
  test: vi.fn<(provider: unknown) => Promise<unknown>>(async () => ({ ok: true }))
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
  testCommunicationIntegration: mocks.test
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
  })

  it('registers the four expected methods exactly once in its manifest', () => {
    expect(COMMUNICATION_INTEGRATION_METHODS.map(({ name }) => name)).toEqual([
      'communicationIntegrations.getStatuses',
      'communicationIntegrations.save',
      'communicationIntegrations.clear',
      'communicationIntegrations.test'
    ])
    expect(new Set(COMMUNICATION_INTEGRATION_METHODS.map(({ name }) => name)).size).toBe(4)
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

  it('strictly validates all save variants and nested discriminated unions', () => {
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
    expect(schema?.safeParse(zApi).success).toBe(true)
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
    expect(schema?.safeParse({ ...zApi, instanceId: 'x'.repeat(257) }).success).toBe(false)
    expect(schema?.safeParse({ ...slack, baseUrl: 'x'.repeat(2_049) }).success).toBe(false)
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
