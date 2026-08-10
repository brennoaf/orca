import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ZApiConversationAvatarSnapshot } from '../../shared/communication-integrations'
import type { ZApiTransactionJournalState } from './z-api-transaction-journal'

const mocks = vi.hoisted(() => ({
  clearLegacy: vi.fn(),
  avatarClear: vi.fn(),
  avatarClearConfiguration: vi.fn(),
  avatarDispose: vi.fn<() => Promise<void>>(async () => undefined),
  avatarGet: vi.fn<() => Promise<ZApiConversationAvatarSnapshot>>(async () => ({
    state: 'unavailable'
  })),
  archiveStates: vi.fn<() => Promise<ReadonlyMap<string, boolean>>>(async () => new Map()),
  archiveClear: vi.fn(),
  closeStore: vi.fn(),
  collectGarbage: vi.fn(),
  discardPreparedIngress: vi.fn(),
  factory: vi.fn(),
  getStatus: vi.fn(),
  getReplyDestination: vi.fn(),
  journalClear: vi.fn(),
  journalRead: vi.fn(),
  journalWrite: vi.fn(),
  legacy: null as null | {
    instanceId: string | null
    instanceToken: string | null
    clientToken: string | null
    baseUrl: string
    trustedCustomAuthority: string | null
  },
  listConversations: vi.fn(),
  listRecentMessages: vi.fn(),
  listeningCancel: vi.fn(),
  listeningCancelPending: vi.fn(),
  listeningClear: vi.fn(),
  listeningClearInstance: vi.fn(),
  listeningConfirmedAt: vi.fn<() => number | null>(),
  listeningRetain: vi.fn(),
  listeningStart: vi.fn(),
  listeningStatus: vi.fn(),
  prepareIngress: vi.fn(),
  recover: vi.fn(),
  remove: vi.fn(),
  saveAndConfigure: vi.fn(),
  sendText: vi.fn(),
  serviceStatus: {
    configured: false,
    verified: false,
    sendReady: false,
    receiveReady: false,
    connected: null as boolean | null,
    smartphoneConnected: null as boolean | null,
    ingress: {
      prepared: false,
      listenPort: null as number | null,
      challengeVerified: false,
      webhooksVerified: false
    },
    lastErrorCode: null as null | 'receiver_unavailable'
  },
  stopIngress: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:\\orca-user-data')
  }
}))

vi.mock('./message-store', () => ({
  MessageStore: class {
    close = mocks.closeStore
    collectGarbage = mocks.collectGarbage
    getReplyDestination = mocks.getReplyDestination
    listConversations = mocks.listConversations
    listRecentMessages = mocks.listRecentMessages
  }
}))

vi.mock('./z-api-archive-state-service', () => ({
  getZApiArchiveStates: mocks.archiveStates,
  clearZApiArchiveStates: mocks.archiveClear
}))

vi.mock('./z-api-communication-credential-store', () => ({
  clearZApiCommunicationCredentials: mocks.clearLegacy,
  emptyZApiCommunicationStatus: vi.fn((lastError = null) => ({
    provider: 'z-api',
    endpoint: {
      baseUrl: 'https://api.z-api.io',
      authority: 'api.z-api.io',
      trust: { kind: 'default' }
    },
    readiness: {
      configured: false,
      verified: false,
      sendReady: false,
      receiveReady: false,
      verifiedAt: null,
      lastError
    },
    instanceId: null,
    instanceTokenStored: false,
    clientTokenStored: false,
    instanceConnected: null,
    smartphoneConnected: null,
    ingressPrepared: false,
    listenPort: null,
    localTunnelTarget: null,
    publicWebhookBaseUrl: null,
    publicIngressVerified: false,
    webhooksConfigured: false,
    lastErrorCode: lastError?.code ?? null
  })),
  readZApiCommunicationCredentials: vi.fn(() => mocks.legacy)
}))

vi.mock('./z-api-listening-validation', () => ({
  ZApiListeningValidation: class {
    cancel = mocks.listeningCancel
    cancelPending = mocks.listeningCancelPending
    clear = mocks.listeningClear
    clearInstance = mocks.listeningClearInstance
    confirmedAt = mocks.listeningConfirmedAt
    retain = mocks.listeningRetain
    start = mocks.listeningStart
    status = mocks.listeningStatus
  }
}))

vi.mock('./z-api-conversation-avatar-service', () => ({
  ZApiConversationAvatarService: class {
    clear = mocks.avatarClear
    clearConfiguration = mocks.avatarClearConfiguration
    dispose = mocks.avatarDispose
    getConversationAvatar = mocks.avatarGet
  }
}))

vi.mock('./z-api-transaction-journal', () => ({
  ZApiTransactionJournal: class {
    clear = mocks.journalClear
    read = mocks.journalRead
    write = mocks.journalWrite
  }
}))

vi.mock('./z-api-transaction-service-factory', () => ({
  createZApiTransactionService: mocks.factory
}))

function emptyJournal(): ZApiTransactionJournalState {
  return { version: 1, provider: 'z-api', active: null, pending: null }
}

function activeJournal(): ZApiTransactionJournalState {
  return {
    version: 1,
    provider: 'z-api',
    active: {
      configuration: {
        configurationId: '11111111111111111111111111111111',
        instanceId: 'active-instance',
        instanceToken: 'active-instance-token',
        clientToken: 'active-client-token',
        baseUrl: 'https://active.example.com',
        endpointTrust: { kind: 'custom', authority: 'active.example.com' },
        publicWebhookBaseUrl: 'https://hook.example.com',
        secretPath: '/orca/z-api/secret',
        listenPort: 4321,
        hideArchivedConversations: false
      },
      originalWebhookState: {
        webhookUrl: 'https://original.example.com/webhook',
        receiveCallbackSentByMe: false
      },
      verifiedAt: '2026-08-09T00:00:00.000Z'
    },
    pending: null
  }
}

async function integration() {
  return import('./z-api-communication-integration')
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe('Z-API communication integration', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.resetModules()
    vi.clearAllMocks()
    mocks.legacy = null
    mocks.archiveStates.mockResolvedValue(new Map())
    mocks.serviceStatus = {
      configured: false,
      verified: false,
      sendReady: false,
      receiveReady: false,
      connected: null,
      smartphoneConnected: null,
      ingress: {
        prepared: false,
        listenPort: null,
        challengeVerified: false,
        webhooksVerified: false
      },
      lastErrorCode: null
    }
    mocks.journalRead.mockImplementation(emptyJournal)
    mocks.listeningConfirmedAt.mockReturnValue(null)
    mocks.listeningStatus.mockReturnValue({
      state: 'not_started',
      attemptId: null,
      code: null,
      deadline: null,
      remainingMs: null,
      confirmedAt: null,
      error: null
    })
    mocks.collectGarbage.mockResolvedValue({ messagesDeleted: 0, conversationsDeleted: 0 })
    mocks.recover.mockResolvedValue(mocks.serviceStatus)
    mocks.prepareIngress.mockResolvedValue({
      listenPort: 4321,
      localTunnelTarget: 'http://127.0.0.1:4321'
    })
    mocks.discardPreparedIngress.mockResolvedValue(mocks.serviceStatus)
    mocks.saveAndConfigure.mockResolvedValue(mocks.serviceStatus)
    mocks.remove.mockResolvedValue(undefined)
    mocks.stopIngress.mockResolvedValue(undefined)
    mocks.factory.mockReturnValue({
      discardPreparedIngress: mocks.discardPreparedIngress,
      getStatus: mocks.getStatus,
      prepareIngress: mocks.prepareIngress,
      recover: mocks.recover,
      remove: mocks.remove,
      saveAndConfigure: mocks.saveAndConfigure,
      sendText: mocks.sendText,
      stopIngress: mocks.stopIngress
    })
    mocks.getStatus.mockImplementation(() => structuredClone(mocks.serviceStatus))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('recovers and applies retention once before exposing status', async () => {
    const api = await integration()
    await api.getZApiCommunicationIntegrationStatus()
    await api.getZApiCommunicationIntegrationStatus()

    expect(mocks.factory).toHaveBeenCalledOnce()
    expect(mocks.recover).toHaveBeenCalledOnce()
    expect(mocks.recover.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.collectGarbage.mock.invocationCallOrder[0] ?? 0
    )
    expect(mocks.collectGarbage.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getStatus.mock.invocationCallOrder[0] ?? 0
    )
    expect(mocks.listeningRetain).toHaveBeenCalledExactlyOnceWith(null)
  })

  it('exposes public ingress verification independently from webhook verification', async () => {
    mocks.serviceStatus.ingress.challengeVerified = true
    mocks.serviceStatus.ingress.webhooksVerified = false
    const api = await integration()

    const status = await api.getZApiCommunicationIntegrationStatus()

    expect(status.publicIngressVerified).toBe(true)
    expect(status.webhooksConfigured).toBe(false)
    expect(JSON.stringify(status)).not.toContain('challengeVerified')
    expect(JSON.stringify(status)).not.toContain('secretPath')
  })

  it('keeps sending technical readiness independent from listening confirmation', async () => {
    mocks.journalRead.mockImplementation(activeJournal)
    mocks.serviceStatus = {
      configured: true,
      verified: true,
      sendReady: true,
      receiveReady: true,
      connected: true,
      smartphoneConnected: true,
      ingress: {
        prepared: true,
        listenPort: 4321,
        challengeVerified: true,
        webhooksVerified: true
      },
      lastErrorCode: null
    }
    const api = await integration()

    expect((await api.getZApiCommunicationIntegrationStatus()).readiness).toMatchObject({
      verified: false,
      sendReady: true,
      receiveReady: false
    })

    mocks.listeningConfirmedAt.mockReturnValue(1_786_300_000_000)
    mocks.listeningStatus.mockReturnValue({
      state: 'confirmed',
      attemptId: '11111111-1111-4111-8111-111111111111',
      code: null,
      deadline: '2026-08-09T00:05:00.000Z',
      remainingMs: 0,
      confirmedAt: '2026-08-09T00:00:00.000Z',
      error: null
    })
    expect((await api.getZApiCommunicationIntegrationStatus()).readiness).toMatchObject({
      verified: true,
      sendReady: true,
      receiveReady: true,
      verifiedAt: new Date(1_786_300_000_000).toISOString()
    })
  })

  it('starts listening validation from technical readiness without receive readiness', async () => {
    mocks.journalRead.mockImplementation(activeJournal)
    mocks.serviceStatus = {
      configured: true,
      verified: true,
      sendReady: true,
      receiveReady: true,
      connected: true,
      smartphoneConnected: true,
      ingress: {
        prepared: true,
        listenPort: 4321,
        challengeVerified: true,
        webhooksVerified: true
      },
      lastErrorCode: null
    }
    const snapshot = {
      state: 'awaiting' as const,
      attemptId: '11111111-1111-4111-8111-111111111111',
      code: 'orca-000042',
      deadline: '2026-08-09T00:05:00.000Z',
      remainingMs: 300_000,
      confirmedAt: null,
      error: null
    }
    mocks.listeningStart.mockReturnValue(snapshot)
    const api = await integration()

    await expect(api.startZApiListeningValidation()).resolves.toMatchObject({
      ok: true,
      value: snapshot
    })
    expect(mocks.listeningStart).toHaveBeenCalledWith({
      configurationId: '11111111111111111111111111111111',
      instanceId: 'active-instance'
    })
  })

  it('cleans replaced validation only after successful reconfiguration', async () => {
    const replacement = activeJournal()
    if (!replacement.active) {
      throw new Error('Missing replacement configuration.')
    }
    replacement.active.configuration.configurationId = '22222222222222222222222222222222'
    mocks.journalRead
      .mockReturnValueOnce(activeJournal())
      .mockReturnValueOnce(activeJournal())
      .mockReturnValue(replacement)
    const api = await integration()

    await expect(
      api.saveAndConfigureZApi({
        instanceId: 'active-instance',
        instanceToken: { action: 'keep' },
        clientToken: { action: 'keep' },
        apiBaseUrl: 'https://active.example.com',
        endpointTrust: { kind: 'custom', authority: 'active.example.com' },
        publicWebhookBaseUrl: 'https://hook.example.com',
        listenPort: 4321,
        hideArchivedConversations: false
      })
    ).resolves.toMatchObject({ ok: true })
    expect(mocks.listeningCancelPending).toHaveBeenCalledOnce()
    expect(mocks.listeningClear).toHaveBeenCalledExactlyOnceWith('11111111111111111111111111111111')
    expect(mocks.avatarClearConfiguration).toHaveBeenCalledExactlyOnceWith(
      '11111111111111111111111111111111'
    )
  })

  it('preserves existing validation when reconfiguration rolls back', async () => {
    mocks.journalRead.mockImplementation(activeJournal)
    const { ZApiTransactionError } = await import('./z-api-transaction-service')
    mocks.saveAndConfigure.mockRejectedValueOnce(
      new ZApiTransactionError('webhook_restore_failed', 'provider detail')
    )
    const api = await integration()

    await expect(
      api.saveAndConfigureZApi({
        instanceId: 'active-instance',
        instanceToken: { action: 'keep' },
        clientToken: { action: 'keep' },
        apiBaseUrl: 'https://active.example.com',
        endpointTrust: { kind: 'custom', authority: 'active.example.com' },
        publicWebhookBaseUrl: 'https://hook.example.com',
        listenPort: 4321,
        hideArchivedConversations: false
      })
    ).resolves.toMatchObject({ ok: false })
    expect(mocks.listeningCancelPending).toHaveBeenCalledOnce()
    expect(mocks.listeningClear).not.toHaveBeenCalled()
    expect(mocks.avatarClearConfiguration).not.toHaveBeenCalled()
  })

  it('clears every validation for the removed instance', async () => {
    mocks.journalRead.mockImplementation(activeJournal)
    const api = await integration()
    await api.removeZApiCommunicationIntegration()
    expect(mocks.listeningCancelPending).toHaveBeenCalledOnce()
    expect(mocks.listeningClearInstance).toHaveBeenCalledExactlyOnceWith('active-instance')
    expect(mocks.avatarClear).toHaveBeenCalledOnce()
  })

  it('delegates conversation avatar reads without exposing the stored destination', async () => {
    mocks.journalRead.mockImplementation(activeJournal)
    mocks.avatarGet.mockResolvedValueOnce({
      state: 'available',
      mimeType: 'image/jpeg',
      contentBase64: 'base64-content'
    })
    const api = await integration()

    const result = await api.getZApiConversationAvatar(7)

    expect(result).toEqual({
      state: 'available',
      mimeType: 'image/jpeg',
      contentBase64: 'base64-content'
    })
    expect(mocks.avatarGet).toHaveBeenCalledExactlyOnceWith(7)
    expect(JSON.stringify(result)).not.toMatch(/instance|address|phone|token|thumbnail/iu)
  })

  it('uses active journal credentials instead of divergent legacy credentials', async () => {
    mocks.journalRead.mockImplementation(activeJournal)
    mocks.legacy = {
      instanceId: 'legacy-instance',
      instanceToken: 'legacy-instance-token',
      clientToken: 'legacy-client-token',
      baseUrl: 'https://api.z-api.io',
      trustedCustomAuthority: null
    }
    const api = await integration()

    await api.prepareZApiIngress(0)
    const status = await api.getZApiCommunicationIntegrationStatus()
    mocks.listConversations.mockReturnValue([
      {
        id: 7,
        provider: 'z-api',
        instanceId: 'active-instance',
        address: '5511999999999',
        conversationKind: 'private',
        displayName: 'Customer',
        lastMessageAt: 123
      }
    ])
    const conversations = await api.listZApiConversations({ limit: 20, offset: 0 })
    const result = await api.saveAndConfigureZApi({
      instanceId: 'active-instance',
      instanceToken: { action: 'keep' },
      clientToken: { action: 'keep' },
      apiBaseUrl: 'https://active.example.com',
      endpointTrust: { kind: 'custom', authority: 'active.example.com' },
      publicWebhookBaseUrl: 'https://hook.example.com',
      listenPort: 4321,
      hideArchivedConversations: false
    })

    expect(status.instanceId).toBe('active-instance')
    expect(status.endpoint.baseUrl).toBe('https://active.example.com')
    expect(status.publicWebhookBaseUrl).toBe('https://hook.example.com')
    expect(JSON.stringify(status)).not.toContain('/orca/z-api/secret')
    expect(JSON.stringify(conversations)).not.toContain('5511999999999')
    expect(conversations.conversations[0]?.conversationKind).toBe('private')
    expect(result.ok).toBe(true)
    expect(mocks.prepareIngress).toHaveBeenNthCalledWith(1, 0)
    expect(mocks.prepareIngress).toHaveBeenNthCalledWith(2, 4321)
    expect(mocks.saveAndConfigure).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceToken: 'active-instance-token',
        clientToken: 'active-client-token'
      })
    )
    expect(mocks.clearLegacy).toHaveBeenCalledOnce()
  })

  it('filters only conversations explicitly reported as archived', async () => {
    const state = activeJournal()
    if (!state.active) {
      throw new Error('active fixture missing')
    }
    state.active.configuration.hideArchivedConversations = true
    mocks.journalRead.mockImplementation(() => state)
    mocks.listConversations.mockReturnValue([
      {
        id: 1,
        provider: 'z-api',
        instanceId: 'active-instance',
        address: 'chat-a',
        conversationKind: 'private',
        displayName: 'A',
        lastMessageAt: 3
      },
      {
        id: 2,
        provider: 'z-api',
        instanceId: 'active-instance',
        address: 'chat-b',
        conversationKind: 'private',
        displayName: 'B',
        lastMessageAt: 2
      },
      {
        id: 3,
        provider: 'z-api',
        instanceId: 'active-instance',
        address: 'chat-unknown',
        conversationKind: 'private',
        displayName: 'C',
        lastMessageAt: 1
      }
    ])
    mocks.archiveStates.mockResolvedValue(
      new Map([
        ['chat-a', true],
        ['chat-b', false]
      ])
    )
    const api = await integration()
    const page = await api.listZApiConversations({ limit: 20, offset: 0 })
    expect(page.conversations.map((conversation) => conversation.id)).toEqual([2, 3])
    expect(page.archiveFilter).toEqual({ enabled: true, state: 'applied', error: null })
  })

  it('pages filtered conversations past one thousand stored rows', async () => {
    const state = activeJournal()
    if (!state.active) {
      throw new Error('active fixture missing')
    }
    state.active.configuration.hideArchivedConversations = true
    mocks.journalRead.mockImplementation(() => state)
    const rows = Array.from({ length: 1101 }, (_value, index) => ({
      id: index,
      provider: 'z-api',
      instanceId: 'active-instance',
      address: `chat-${index}`,
      conversationKind: 'private' as const,
      displayName: `Chat ${index}`,
      lastMessageAt: index
    }))
    mocks.listConversations.mockImplementation((limit: number, offset: number) =>
      rows.slice(offset, offset + limit)
    )
    mocks.archiveStates.mockResolvedValue(new Map(rows.map((row) => [row.address, false])))
    const api = await integration()
    const page = await api.listZApiConversations({ limit: 20, offset: 1000 })
    expect(page.conversations.map((conversation) => conversation.id)).toEqual(
      Array.from({ length: 20 }, (_value, index) => 1000 + index)
    )
    expect(page.nextOffset).toBe(1020)
    expect(mocks.listConversations.mock.calls.map((call) => call[1])).toEqual([0, 500, 1000])
  })

  it('keeps current conversations visible when archive refresh fails', async () => {
    const state = activeJournal()
    if (!state.active) {
      throw new Error('active fixture missing')
    }
    state.active.configuration.hideArchivedConversations = true
    mocks.journalRead.mockImplementation(() => state)
    mocks.listConversations.mockReturnValue([
      {
        id: 1,
        provider: 'z-api',
        instanceId: 'active-instance',
        address: 'chat-a',
        conversationKind: 'private',
        displayName: 'A',
        lastMessageAt: 1
      }
    ])
    mocks.archiveStates.mockRejectedValue(new Error('provider-private-response'))
    const api = await integration()
    const page = await api.listZApiConversations({ limit: 20, offset: 0 })
    expect(page.conversations.map((conversation) => conversation.id)).toEqual([1])
    expect(page.archiveFilter).toMatchObject({ enabled: true, state: 'failed' })
    expect(JSON.stringify(page)).not.toContain('provider-private-response')
  })

  it('discards an uncommitted receiver before preparing another port', async () => {
    const api = await integration()
    await api.prepareZApiIngress(0)
    await expect(api.discardPreparedZApiIngress()).resolves.toMatchObject({ ok: true })
    mocks.prepareIngress.mockResolvedValueOnce({
      listenPort: 5432,
      localTunnelTarget: 'http://127.0.0.1:5432'
    })
    await api.prepareZApiIngress(5432)

    expect(mocks.discardPreparedIngress).toHaveBeenCalledOnce()
    expect(mocks.prepareIngress).toHaveBeenNthCalledWith(1, 0)
    expect(mocks.prepareIngress).toHaveBeenNthCalledWith(2, 5432)
  })

  it('uses legacy credentials once when no active journal exists', async () => {
    mocks.legacy = {
      instanceId: 'legacy-instance',
      instanceToken: 'legacy-instance-token',
      clientToken: 'legacy-client-token',
      baseUrl: 'https://api.z-api.io',
      trustedCustomAuthority: null
    }
    const api = await integration()

    await api.saveAndConfigureZApi({
      instanceId: 'legacy-instance',
      instanceToken: { action: 'keep' },
      clientToken: { action: 'keep' },
      apiBaseUrl: 'https://api.z-api.io',
      endpointTrust: { kind: 'default' },
      publicWebhookBaseUrl: 'https://hook.example.com',
      listenPort: 4321,
      hideArchivedConversations: false
    })

    expect(mocks.saveAndConfigure).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceToken: 'legacy-instance-token',
        clientToken: 'legacy-client-token'
      })
    )
    expect(mocks.clearLegacy).toHaveBeenCalledOnce()
  })

  it('single-flights periodic retention and cancels its timer on dispose', async () => {
    vi.useFakeTimers()
    const periodicGc = deferred<{ messagesDeleted: number; conversationsDeleted: number }>()
    mocks.collectGarbage.mockImplementationOnce(async () => ({
      messagesDeleted: 1,
      conversationsDeleted: 1
    }))
    mocks.collectGarbage.mockImplementationOnce(() => periodicGc.promise)
    const api = await integration()
    await api.getZApiCommunicationIntegrationStatus()

    await vi.advanceTimersByTimeAsync(12 * 60 * 60 * 1_000)
    expect(mocks.collectGarbage).toHaveBeenCalledTimes(2)
    periodicGc.resolve({ messagesDeleted: 0, conversationsDeleted: 0 })
    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1_000)
    expect(mocks.collectGarbage).toHaveBeenCalledTimes(3)

    await api.disposeZApiCommunicationIntegration()
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1_000)
    expect(mocks.collectGarbage).toHaveBeenCalledTimes(3)
  })

  it('fences runtime recreation while one shared dispose is in flight', async () => {
    const stopped = deferred<void>()
    mocks.stopIngress.mockReturnValueOnce(stopped.promise)
    const api = await integration()
    await api.getZApiCommunicationIntegrationStatus()

    const first = api.disposeZApiCommunicationIntegration()
    const second = api.disposeZApiCommunicationIntegration()
    await expect(api.getZApiCommunicationIntegrationStatus()).rejects.toThrow(
      'Z-API is shutting down.'
    )
    stopped.resolve(undefined)
    await Promise.all([first, second])

    expect(mocks.factory).toHaveBeenCalledOnce()
    expect(mocks.stopIngress).toHaveBeenCalledOnce()
    expect(mocks.avatarDispose).toHaveBeenCalledOnce()
    expect(mocks.closeStore).toHaveBeenCalledOnce()
  })

  it('still stops ingress when pending validation cancellation fails during shutdown', async () => {
    mocks.listeningCancelPending.mockImplementationOnce(() => {
      throw new Error('database unavailable')
    })
    const api = await integration()
    await api.getZApiCommunicationIntegrationStatus()

    await expect(api.disposeZApiCommunicationIntegration()).rejects.toThrow('Z-API shutdown failed')
    expect(mocks.stopIngress).toHaveBeenCalledOnce()
    expect(mocks.avatarDispose).toHaveBeenCalledOnce()
    expect(mocks.closeStore).toHaveBeenCalledOnce()
  })

  it('still waits for avatar disposal when another shutdown participant fails', async () => {
    const avatarDisposal = deferred<void>()
    mocks.listeningCancelPending.mockImplementationOnce(() => {
      throw new Error('database unavailable')
    })
    mocks.avatarDispose.mockReturnValueOnce(avatarDisposal.promise)
    const api = await integration()
    await api.getZApiCommunicationIntegrationStatus()

    let settled = false
    const disposal = api.disposeZApiCommunicationIntegration().finally(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    avatarDisposal.resolve(undefined)
    await expect(disposal).rejects.toThrow('Z-API shutdown failed')
    expect(mocks.stopIngress).toHaveBeenCalledOnce()
    expect(mocks.closeStore).toHaveBeenCalledOnce()
  })

  it('joins Z-API disposal to the central quit teardown barrier', () => {
    const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8')
    const capture = source.indexOf('const zApiShutdown = disposeZApiCommunicationIntegration()')
    const barrier = source.indexOf('settleTeardownWithinDeadline([')
    expect(capture).toBeGreaterThan(0)
    expect(capture).toBeLessThan(barrier)
    expect(source).toContain("{ name: 'z-api', promise: zApiShutdown }")
  })

  it('redacts transaction errors and disposes receiver before the store', async () => {
    mocks.serviceStatus.lastErrorCode = 'receiver_unavailable'
    const api = await integration()
    const { ZApiTransactionError } = await import('./z-api-transaction-service')
    mocks.prepareIngress.mockRejectedValue(
      new ZApiTransactionError('receiver_unavailable', 'secret tunnel detail')
    )

    const result = await api.prepareZApiIngress(4321)
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'receiver_unavailable', field: null }
    })
    expect(JSON.stringify(result)).not.toContain('secret tunnel detail')

    await api.removeZApiCommunicationIntegration()
    expect(mocks.remove).toHaveBeenCalledOnce()
    expect(mocks.clearLegacy).toHaveBeenCalledOnce()

    await api.disposeZApiCommunicationIntegration()
    expect(mocks.listeningCancelPending).toHaveBeenCalled()
    expect(mocks.stopIngress).toHaveBeenCalledOnce()
    expect(mocks.closeStore).toHaveBeenCalledOnce()
    expect(mocks.stopIngress.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.closeStore.mock.invocationCallOrder[0] ?? 0
    )
  })

  it('returns an actionable redacted error for conversations that cannot receive replies', async () => {
    const api = await integration()
    const { ZApiTransactionError } = await import('./z-api-transaction-service')
    mocks.sendText.mockRejectedValueOnce(
      new ZApiTransactionError('conversation_not_replyable', 'provider detail')
    )

    const result = await api.sendZApiReply({ conversationId: 7, text: 'Hello' })

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: 'conversation_not_replyable',
        message:
          'WhatsApp newsletters and broadcast lists do not support fast replies. Choose a private or group conversation.',
        field: null
      }
    })
    expect(JSON.stringify(result)).not.toContain('provider detail')
  })
})
