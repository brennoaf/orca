import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ZApiTransactionConfiguration } from './z-api-transaction-journal'

const mocks = vi.hoisted(() => ({ listChatArchiveStates: vi.fn() }))

vi.mock('./z-api-communication-client', () => ({
  ZApiCommunicationClient: class {
    listChatArchiveStates = mocks.listChatArchiveStates
  }
}))

import { clearZApiArchiveStates, getZApiArchiveStates } from './z-api-archive-state-service'

const configuration = {
  configurationId: 'configuration-a',
  baseUrl: 'https://api.z-api.io',
  endpointTrust: { kind: 'default' },
  instanceId: 'instance-a',
  instanceToken: 'instance-token',
  clientToken: 'client-token',
  publicWebhookBaseUrl: 'https://hook.example.com',
  listenPort: 4321,
  hideArchivedConversations: true
} as ZApiTransactionConfiguration

afterEach(() => {
  clearZApiArchiveStates()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('Z-API archive state service', () => {
  it('single-flights and caches archive states for sixty seconds', async () => {
    vi.useFakeTimers()
    const resolve = Promise.withResolvers<readonly { address: string; archived: boolean }[]>()
    mocks.listChatArchiveStates.mockReturnValueOnce(resolve.promise)
    const first = getZApiArchiveStates(configuration)
    const second = getZApiArchiveStates(configuration)
    expect(mocks.listChatArchiveStates).toHaveBeenCalledOnce()
    resolve.resolve([{ address: 'chat-a', archived: true }])
    await expect(first).resolves.toEqual(new Map([['chat-a', true]]))
    await expect(second).resolves.toEqual(new Map([['chat-a', true]]))
    await getZApiArchiveStates(configuration)
    expect(mocks.listChatArchiveStates).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(60_001)
    mocks.listChatArchiveStates.mockResolvedValueOnce([{ address: 'chat-a', archived: false }])
    await expect(getZApiArchiveStates(configuration)).resolves.toEqual(new Map([['chat-a', false]]))
    expect(mocks.listChatArchiveStates).toHaveBeenCalledTimes(2)
  })

  it('invalidates cached state explicitly', async () => {
    mocks.listChatArchiveStates.mockResolvedValueOnce([{ address: 'chat-a', archived: true }])
    await getZApiArchiveStates(configuration)
    clearZApiArchiveStates()
    mocks.listChatArchiveStates.mockResolvedValueOnce([{ address: 'chat-a', archived: false }])
    await expect(getZApiArchiveStates(configuration)).resolves.toEqual(new Map([['chat-a', false]]))
    expect(mocks.listChatArchiveStates).toHaveBeenCalledTimes(2)
  })

  it('does not restore a cache invalidated while a request is in flight', async () => {
    const deferred = Promise.withResolvers<readonly { address: string; archived: boolean }[]>()
    mocks.listChatArchiveStates.mockReturnValueOnce(deferred.promise)
    const request = getZApiArchiveStates(configuration)
    clearZApiArchiveStates()
    deferred.resolve([{ address: 'chat-a', archived: true }])
    await request
    mocks.listChatArchiveStates.mockResolvedValueOnce([{ address: 'chat-a', archived: false }])
    await expect(getZApiArchiveStates(configuration)).resolves.toEqual(new Map([['chat-a', false]]))
    expect(mocks.listChatArchiveStates).toHaveBeenCalledTimes(2)
  })
})
