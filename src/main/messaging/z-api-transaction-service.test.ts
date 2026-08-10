import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommunicationApiError } from './communication-api-endpoint'
import { ZApiAmbiguousSendError } from './z-api-communication-client'
import type {
  ZApiInstanceWebhookState,
  ZApiRestorableWebhookState
} from './z-api-communication-client-contract'
import type {
  ZApiTransactionConfiguration,
  ZApiTransactionJournalState
} from './z-api-transaction-journal'
import {
  ZApiTransactionService,
  type ZApiReceiverController,
  type ZApiSaveAndConfigureParams,
  type ZApiTransactionClient,
  type ZApiTransactionMessageStore
} from './z-api-transaction-service'

const previous: ZApiRestorableWebhookState = {
  webhookUrl: 'https://previous.example.com/webhook',
  receiveCallbackSentByMe: false
}

function webhookState(
  url = 'https://hooks.example.com/orca/z-api/secret-path',
  receiveCallbackSentByMe = true
): ZApiInstanceWebhookState {
  return {
    connectedCallbackUrl: url,
    deliveryCallbackUrl: url,
    disconnectedCallbackUrl: url,
    messageStatusCallbackUrl: url,
    presenceChatCallbackUrl: url,
    receivedAndDeliveryCallbackUrl: url,
    receivedCallbackUrl: url,
    receivedStatusCallbackUrl: url,
    initialDataCallbackUrl: null,
    receiveCallbackSentByMe
  }
}

function configuration(): ZApiTransactionConfiguration {
  return {
    configurationId: '11111111111111111111111111111111',
    instanceId: 'instance-1',
    instanceToken: 'instance-token',
    clientToken: 'client-token',
    baseUrl: 'https://api.z-api.io',
    endpointTrust: { kind: 'default' },
    publicWebhookBaseUrl: 'https://hooks.example.com',
    secretPath: '/orca/z-api/secret-path',
    listenPort: 32123
  }
}

function activeJournal(): ZApiTransactionJournalState {
  return {
    version: 1,
    provider: 'z-api',
    active: {
      configuration: configuration(),
      originalWebhookState: previous,
      verifiedAt: '2026-08-09T00:00:00.000Z'
    },
    pending: null
  }
}

type Fixture = ReturnType<typeof fixture>

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => undefined
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function fixture(
  initial: ZApiTransactionJournalState = {
    version: 1,
    provider: 'z-api',
    active: null,
    pending: null
  }
) {
  let state = structuredClone(initial)
  const writes: ZApiTransactionJournalState[] = []
  const calls: string[] = []
  const receiver: ZApiReceiverController = {
    start: vi.fn(async () => ({
      host: '127.0.0.1' as const,
      port: 32123,
      path: '/orca/z-api/secret-path'
    })),
    stop: vi.fn(async () => undefined),
    armChallenge: vi.fn(() => calls.push('armChallenge')),
    setExpectedConfiguration: vi.fn(() => calls.push('setExpectedConfiguration'))
  }
  const client: ZApiTransactionClient = {
    getStatus: vi.fn(async () => {
      calls.push('getStatus')
      return {
        connected: true,
        smartphoneConnected: true,
        configurationReady: true,
        paymentStatus: 'ACTIVE',
        statusDetail: null
      }
    }),
    getRestorableWebhookState: vi.fn(async () => {
      calls.push('getRestorableWebhookState')
      return previous
    }),
    clearWebhookFilters: vi.fn(async () => {
      calls.push('clearWebhookFilters')
    }),
    setEveryWebhooks: vi.fn(async () => {
      calls.push('setEveryWebhooks')
    }),
    getInstanceWebhookState: vi.fn(async () => {
      calls.push('getInstanceWebhookState')
      return webhookState()
    }),
    restoreEveryWebhooks: vi.fn(async () => {
      calls.push('restoreEveryWebhooks')
    }),
    sendText: vi.fn(async () => {
      calls.push('sendText')
      return { zaapId: 'zaap-1', messageId: 'message-1', id: 'id-1' }
    })
  }
  const messageStore: ZApiTransactionMessageStore = {
    getReplyDestination: vi.fn(() => ({
      provider: 'z-api' as const,
      instanceId: 'instance-1',
      conversationAddress: 'conversation-address',
      conversationKind: 'private' as const
    })),
    registerOutboundPending: vi.fn(() => 1),
    markOutboundSent: vi.fn(),
    markOutboundUnknown: vi.fn(),
    markOutboundFailed: vi.fn()
  }
  const createClient = vi.fn(() => client)
  const verifyChallenge = vi.fn(async () => {
    calls.push('verifyChallenge')
  })
  const service = new ZApiTransactionService({
    journal: {
      read: () => structuredClone(state),
      write: (next) => {
        state = structuredClone(next)
        writes.push(structuredClone(next))
      },
      clear: () => {
        state = { version: 1, provider: 'z-api', active: null, pending: null }
      }
    },
    messageStore,
    createReceiver: () => receiver,
    createClient,
    verifyChallenge,
    now: () => 1_786_300_000_000,
    randomPath: () => '/orca/z-api/secret-path',
    randomNonce: () => 'nonce_1234567890123456',
    randomConfigurationId: () => '22222222222222222222222222222222',
    randomClientMessageId: () => 'client-message-1'
  })
  return {
    service,
    state: () => state,
    writes,
    calls,
    receiver,
    client,
    createClient,
    verifyChallenge,
    messageStore
  }
}

async function prepare(value: Fixture): Promise<ZApiSaveAndConfigureParams> {
  const ingress = await value.service.prepareIngress(0)
  return {
    instanceId: 'instance-1',
    instanceToken: 'instance-token',
    clientToken: 'client-token',
    baseUrl: 'https://api.z-api.io',
    endpointTrust: { kind: 'default' },
    publicWebhookBaseUrl: 'https://hooks.example.com',
    listenPort: ingress.listenPort,
    preparedIngress: ingress
  }
}

describe('ZApiTransactionService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('reuses an ephemeral ingress by effective port and rejects a conflicting port', async () => {
    const value = fixture()
    const first = await value.service.prepareIngress(0)
    const second = await value.service.prepareIngress(0)
    const effective = await value.service.prepareIngress(32123)
    expect(first).toEqual({ listenPort: 32123, localTunnelTarget: 'http://127.0.0.1:32123' })
    expect(second).toEqual(first)
    expect(effective).toEqual(first)
    expect(JSON.stringify(first)).not.toContain('secret-path')
    expect(value.receiver.start).toHaveBeenCalledTimes(1)
    await expect(value.service.prepareIngress(32124)).rejects.toMatchObject({
      code: 'receiver_unavailable'
    })
  })

  it('discards an uncommitted ingress before binding another port', async () => {
    const value = fixture()
    vi.mocked(value.receiver.start)
      .mockResolvedValueOnce({
        host: '127.0.0.1',
        port: 32123,
        path: '/orca/z-api/secret-path'
      })
      .mockResolvedValueOnce({
        host: '127.0.0.1',
        port: 32124,
        path: '/orca/z-api/secret-path'
      })

    await value.service.prepareIngress(0)
    await expect(value.service.discardPreparedIngress()).resolves.toMatchObject({
      configured: false,
      ingress: { prepared: false, listenPort: null }
    })
    await expect(value.service.prepareIngress(32124)).resolves.toEqual({
      listenPort: 32124,
      localTunnelTarget: 'http://127.0.0.1:32124'
    })

    expect(value.receiver.stop).toHaveBeenCalledOnce()
    expect(value.receiver.start).toHaveBeenCalledTimes(2)
  })

  it('never discards the receiver owned by an active configuration', async () => {
    const value = fixture(activeJournal())
    await value.service.recover()

    await expect(value.service.discardPreparedIngress()).rejects.toMatchObject({
      code: 'active_ingress_locked'
    })
    expect(value.receiver.start).toHaveBeenCalledOnce()
    expect(value.receiver.stop).not.toHaveBeenCalled()
    expect(value.state()).toEqual(activeJournal())
  })

  it('preserves pending repair state when discard is requested', async () => {
    const initial: ZApiTransactionJournalState = {
      version: 1,
      provider: 'z-api',
      active: null,
      pending: {
        phase: 'repair_required',
        configuration: configuration(),
        rollbackWebhookState: previous
      }
    }
    const value = fixture(initial)

    await expect(value.service.discardPreparedIngress()).rejects.toMatchObject({
      code: 'webhook_restore_failed'
    })
    expect(value.receiver.stop).not.toHaveBeenCalled()
    expect(value.state()).toEqual(initial)
  })

  it('single-flights concurrent ephemeral ingress preparation', async () => {
    const value = fixture()
    const startup = deferred<{
      host: '127.0.0.1'
      port: number
      path: string
    }>()
    vi.mocked(value.receiver.start).mockImplementationOnce(() => startup.promise)
    const first = value.service.prepareIngress(0)
    const second = value.service.prepareIngress(0)
    await vi.waitFor(() => expect(value.receiver.start).toHaveBeenCalledTimes(1))
    startup.resolve({ host: '127.0.0.1', port: 32123, path: '/orca/z-api/secret-path' })
    await expect(Promise.all([first, second])).resolves.toEqual([
      { listenPort: 32123, localTunnelTarget: 'http://127.0.0.1:32123' },
      { listenPort: 32123, localTunnelTarget: 'http://127.0.0.1:32123' }
    ])
    expect(value.receiver.start).toHaveBeenCalledTimes(1)
  })

  it('persists pending before effects and configures in the exact safe sequence', async () => {
    const value = fixture()
    const params = await prepare(value)
    await expect(value.service.saveAndConfigure(params)).resolves.toMatchObject({
      configured: true,
      verified: true,
      sendReady: true,
      receiveReady: true,
      ingress: { challengeVerified: true, webhooksVerified: true }
    })
    expect(value.writes[0]?.pending?.phase).toBe('pre_mutation')
    expect(value.writes.map((write) => write.pending?.phase ?? 'promoted')).toEqual([
      'pre_mutation',
      'filters_clear_intent',
      'filters_cleared',
      'callback_mutation_intent',
      'promoted'
    ])
    expect(value.calls).toEqual([
      'getStatus',
      'setExpectedConfiguration',
      'armChallenge',
      'verifyChallenge',
      'getRestorableWebhookState',
      'clearWebhookFilters',
      'setEveryWebhooks',
      'getInstanceWebhookState'
    ])
    expect(value.state().active?.configuration.secretPath).toBe('/orca/z-api/secret-path')
    expect(value.state().active?.configuration.configurationId).toBe(
      '22222222222222222222222222222222'
    )
    expect(value.state().pending).toBeNull()
    expect(JSON.stringify(value.service.getStatus())).not.toContain('secret')
    expect(JSON.stringify(value.service.getStatus())).not.toContain('hooks.example.com')
  })

  it('does not become ready until the public reachability proof completes', async () => {
    const value = fixture()
    const proof = deferred<void>()
    value.verifyChallenge.mockImplementationOnce(() => proof.promise)
    const save = value.service.saveAndConfigure(await prepare(value))
    await vi.waitFor(() => expect(value.verifyChallenge).toHaveBeenCalledTimes(1))
    expect(value.service.getStatus()).toMatchObject({
      verified: false,
      sendReady: false,
      receiveReady: false,
      ingress: { challengeVerified: false, webhooksVerified: false }
    })
    expect(value.client.clearWebhookFilters).not.toHaveBeenCalled()
    expect(value.client.setEveryWebhooks).not.toHaveBeenCalled()
    proof.resolve(undefined)
    await expect(save).resolves.toMatchObject({
      verified: true,
      sendReady: true,
      receiveReady: true,
      ingress: { challengeVerified: true, webhooksVerified: true }
    })
  })

  it('fails disconnected before challenge, filters, or callback mutation', async () => {
    const value = fixture()
    vi.mocked(value.client.getStatus).mockResolvedValue({
      connected: false,
      smartphoneConnected: true,
      configurationReady: false,
      paymentStatus: null,
      statusDetail: 'offline'
    })
    await expect(value.service.saveAndConfigure(await prepare(value))).rejects.toMatchObject({
      code: 'provider_unavailable'
    })
    expect(value.client.clearWebhookFilters).not.toHaveBeenCalled()
    expect(value.client.setEveryWebhooks).not.toHaveBeenCalled()
    expect(value.state().pending).toBeNull()
  })

  it('does not mutate callbacks when challenge, uniform-state gate, or filters fail', async () => {
    const value = fixture()
    vi.mocked(value.client.getRestorableWebhookState).mockRejectedValue(
      new CommunicationApiError('webhook_state_conflict', 'conflict')
    )
    await expect(value.service.saveAndConfigure(await prepare(value))).rejects.toMatchObject({
      code: 'webhook_state_conflict'
    })
    expect(value.client.clearWebhookFilters).not.toHaveBeenCalled()
    expect(value.client.setEveryWebhooks).not.toHaveBeenCalled()
    expect(value.state().pending).toBeNull()

    const filters = fixture()
    vi.mocked(filters.client.clearWebhookFilters).mockRejectedValueOnce(
      new CommunicationApiError('provider_rejected', 'rejected')
    )
    await expect(filters.service.saveAndConfigure(await prepare(filters))).rejects.toMatchObject({
      code: 'provider_rejected'
    })
    expect(filters.client.setEveryWebhooks).not.toHaveBeenCalled()
    expect(filters.state().pending).toBeNull()

    const persistentFilters = fixture()
    vi.mocked(persistentFilters.client.clearWebhookFilters).mockRejectedValue(
      new CommunicationApiError('provider_rejected', 'rejected')
    )
    await expect(
      persistentFilters.service.saveAndConfigure(await prepare(persistentFilters))
    ).rejects.toMatchObject({ code: 'provider_unavailable' })
    expect(persistentFilters.client.clearWebhookFilters).toHaveBeenCalledTimes(2)
    expect(persistentFilters.state().pending?.phase).toBe('filters_clear_intent')
    expect(persistentFilters.receiver.setExpectedConfiguration).toHaveBeenLastCalledWith(null)
    expect(persistentFilters.service.getStatus()).toMatchObject({
      sendReady: false,
      receiveReady: false
    })
  })

  it('restores and confirms the snapshot after PUT success followed by verify failure', async () => {
    const value = fixture()
    vi.mocked(value.client.getInstanceWebhookState)
      .mockResolvedValueOnce(webhookState('https://unexpected.example.com/hook'))
      .mockResolvedValueOnce(webhookState())
      .mockResolvedValueOnce(webhookState(previous.webhookUrl, false))
    await expect(value.service.saveAndConfigure(await prepare(value))).rejects.toMatchObject({
      code: 'webhook_state_conflict'
    })
    expect(value.client.setEveryWebhooks).toHaveBeenCalledTimes(1)
    expect(value.client.restoreEveryWebhooks).toHaveBeenCalledExactlyOnceWith(previous)
    expect(value.state().pending).toBeNull()
  })

  it('inspects ambiguous PUT state and leaves repair_required when restore fails', async () => {
    const value = fixture()
    vi.mocked(value.client.setEveryWebhooks).mockRejectedValue(
      new CommunicationApiError('network_error', 'failed')
    )
    vi.mocked(value.client.getInstanceWebhookState).mockResolvedValue(webhookState())
    vi.mocked(value.client.restoreEveryWebhooks).mockRejectedValue(
      new CommunicationApiError('provider_unavailable', 'failed')
    )
    await expect(value.service.saveAndConfigure(await prepare(value))).rejects.toMatchObject({
      code: 'webhook_restore_failed'
    })
    expect(value.client.setEveryWebhooks).toHaveBeenCalledTimes(1)
    expect(value.client.restoreEveryWebhooks).toHaveBeenCalledTimes(1)
    expect(value.state().pending?.phase).toBe('repair_required')
    expect(value.service.getStatus()).toMatchObject({
      sendReady: false,
      receiveReady: false,
      lastErrorCode: 'webhook_restore_failed'
    })
    expect(value.receiver.setExpectedConfiguration).toHaveBeenLastCalledWith(null)
  })

  it('resets the receiver to the previous active instance when repair becomes required', async () => {
    const value = fixture(activeJournal())
    const activeWebhookUrl = 'https://hooks.example.com/orca/z-api/secret-path'
    const replacementWebhookUrl = 'https://new-hooks.example.com/orca/z-api/secret-path'
    vi.mocked(value.client.getRestorableWebhookState).mockResolvedValue({
      webhookUrl: activeWebhookUrl,
      receiveCallbackSentByMe: true
    })
    vi.mocked(value.client.setEveryWebhooks).mockRejectedValue(
      new CommunicationApiError('network_error', 'failed')
    )
    vi.mocked(value.client.getInstanceWebhookState).mockResolvedValue(
      webhookState(replacementWebhookUrl, true)
    )
    vi.mocked(value.client.restoreEveryWebhooks).mockRejectedValue(
      new CommunicationApiError('provider_unavailable', 'restore failed')
    )
    const params = await prepare(value)
    params.publicWebhookBaseUrl = 'https://new-hooks.example.com'
    await expect(value.service.saveAndConfigure(params)).rejects.toMatchObject({
      code: 'webhook_restore_failed'
    })
    expect(value.state().pending?.phase).toBe('repair_required')
    expect(value.receiver.setExpectedConfiguration).toHaveBeenLastCalledWith({
      instanceId: 'instance-1',
      configurationId: '11111111111111111111111111111111'
    })
    expect(value.service.getStatus()).toMatchObject({
      sendReady: false,
      receiveReady: false,
      lastErrorCode: 'webhook_restore_failed'
    })
  })

  it('discards pre-mutation recovery and revalidates active state on restart', async () => {
    const preMutation = activeJournal()
    preMutation.pending = {
      phase: 'pre_mutation',
      configuration: configuration(),
      rollbackWebhookState: null
    }
    const value = fixture(preMutation)
    await expect(value.service.recover()).resolves.toMatchObject({
      verified: true,
      sendReady: true,
      receiveReady: true
    })
    expect(value.state().pending).toBeNull()
    expect(value.calls).toEqual([
      'getStatus',
      'setExpectedConfiguration',
      'armChallenge',
      'verifyChallenge',
      'getInstanceWebhookState'
    ])
  })

  it.each(['filters_clear_intent', 'filters_cleared'] as const)(
    'replays persistent filter clearing from %s without mutating callbacks',
    async (phase) => {
      const journal = activeJournal()
      journal.active = null
      journal.pending = {
        phase,
        configuration: configuration(),
        rollbackWebhookState: previous
      }
      const value = fixture(journal)
      await expect(value.service.recover()).resolves.toMatchObject({ configured: false })
      expect(value.client.clearWebhookFilters).toHaveBeenCalledTimes(1)
      expect(value.client.setEveryWebhooks).not.toHaveBeenCalled()
      expect(value.client.restoreEveryWebhooks).not.toHaveBeenCalled()
      expect(value.writes.map((write) => write.pending?.phase ?? 'cleared')).toEqual([
        'filters_cleared',
        'cleared'
      ])
    }
  )

  it('restores before removal and preserves repair journal on failure', async () => {
    const value = fixture(activeJournal())
    vi.mocked(value.client.getInstanceWebhookState)
      .mockResolvedValueOnce(webhookState())
      .mockResolvedValueOnce(webhookState(previous.webhookUrl, false))
    await expect(value.service.remove()).resolves.toBeUndefined()
    expect(value.client.restoreEveryWebhooks).toHaveBeenCalledExactlyOnceWith(previous)
    expect(value.state().active).toBeNull()

    const failed = fixture(activeJournal())
    vi.mocked(failed.client.getInstanceWebhookState).mockResolvedValue(webhookState())
    vi.mocked(failed.client.restoreEveryWebhooks).mockRejectedValue(new Error('restore failed'))
    await expect(failed.service.remove()).rejects.toMatchObject({ code: 'webhook_restore_failed' })
    expect(failed.state().active).not.toBeNull()
    expect(failed.state().pending?.phase).toBe('repair_required')
  })

  it('preserves initial-setup repair state on remove failure, then cleans after recovery succeeds', async () => {
    const initial: ZApiTransactionJournalState = {
      version: 1,
      provider: 'z-api',
      active: null,
      pending: {
        phase: 'repair_required',
        configuration: configuration(),
        rollbackWebhookState: previous
      }
    }
    const value = fixture(initial)
    vi.mocked(value.client.getInstanceWebhookState).mockResolvedValue(webhookState())
    vi.mocked(value.client.restoreEveryWebhooks).mockRejectedValueOnce(
      new CommunicationApiError('provider_unavailable', 'restore failed')
    )
    await expect(value.service.remove()).rejects.toMatchObject({
      code: 'webhook_restore_failed'
    })
    expect(value.state()).toEqual(initial)
    expect(value.receiver.stop).not.toHaveBeenCalled()

    vi.mocked(value.client.getInstanceWebhookState)
      .mockResolvedValueOnce(webhookState())
      .mockResolvedValueOnce(webhookState(previous.webhookUrl, false))
    await expect(value.service.remove()).resolves.toBeUndefined()
    expect(value.state()).toEqual({ version: 1, provider: 'z-api', active: null, pending: null })
  })

  it('does not overwrite active reconfiguration repair state when remove recovery fails', async () => {
    const initial = activeJournal()
    const activeWebhookUrl = 'https://hooks.example.com/orca/z-api/secret-path'
    const replacementConfiguration = {
      ...configuration(),
      publicWebhookBaseUrl: 'https://new-hooks.example.com'
    }
    initial.pending = {
      phase: 'repair_required',
      configuration: replacementConfiguration,
      rollbackWebhookState: {
        webhookUrl: activeWebhookUrl,
        receiveCallbackSentByMe: true
      }
    }
    const value = fixture(initial)
    vi.mocked(value.client.getInstanceWebhookState).mockResolvedValue(
      webhookState('https://new-hooks.example.com/orca/z-api/secret-path', true)
    )
    vi.mocked(value.client.restoreEveryWebhooks).mockRejectedValue(
      new CommunicationApiError('provider_unavailable', 'restore failed')
    )
    await expect(value.service.remove()).rejects.toMatchObject({
      code: 'webhook_restore_failed'
    })
    expect(value.state()).toEqual(initial)
    expect(value.writes).toEqual([initial])
    expect(value.receiver.stop).not.toHaveBeenCalled()
  })

  it('blocks a different active instance before persistence or provider effects', async () => {
    const value = fixture(activeJournal())
    const params = await prepare(value)
    params.instanceId = 'instance-2'
    await expect(value.service.saveAndConfigure(params)).rejects.toMatchObject({
      code: 'invalid_configuration'
    })
    expect(value.writes).toHaveLength(0)
    expect(value.client.getStatus).not.toHaveBeenCalled()
    expect(value.client.setEveryWebhooks).not.toHaveBeenCalled()
    expect(value.state()).toEqual(activeJournal())
  })

  it('reconfigures the same instance while preserving its original webhook snapshot', async () => {
    const value = fixture(activeJournal())
    vi.mocked(value.client.getRestorableWebhookState).mockResolvedValue({
      webhookUrl: 'https://hooks.example.com/orca/z-api/secret-path',
      receiveCallbackSentByMe: true
    })
    const params = await prepare(value)
    params.instanceToken = 'replacement-token'
    await expect(value.service.saveAndConfigure(params)).resolves.toMatchObject({ verified: true })
    expect(value.state().active).toMatchObject({
      configuration: { instanceToken: 'replacement-token' },
      originalWebhookState: previous
    })
    expect(value.state().pending).toBeNull()
  })

  it('restores the previous active callback when same-instance reconfiguration fails', async () => {
    const value = fixture(activeJournal())
    const activeWebhookUrl = 'https://hooks.example.com/orca/z-api/secret-path'
    const replacementWebhookUrl = 'https://new-hooks.example.com/orca/z-api/secret-path'
    vi.mocked(value.client.getRestorableWebhookState).mockResolvedValue({
      webhookUrl: activeWebhookUrl,
      receiveCallbackSentByMe: true
    })
    vi.mocked(value.client.setEveryWebhooks).mockRejectedValue(
      new CommunicationApiError('network_error', 'failed')
    )
    vi.mocked(value.client.getInstanceWebhookState)
      .mockResolvedValueOnce(webhookState(replacementWebhookUrl, true))
      .mockResolvedValueOnce(webhookState(activeWebhookUrl, true))
    const params = await prepare(value)
    params.publicWebhookBaseUrl = 'https://new-hooks.example.com'
    await expect(value.service.saveAndConfigure(params)).rejects.toMatchObject({
      code: 'network_error'
    })
    expect(value.client.restoreEveryWebhooks).toHaveBeenCalledExactlyOnceWith({
      webhookUrl: activeWebhookUrl,
      receiveCallbackSentByMe: true
    })
    expect(value.state().active).toEqual(activeJournal().active)
    expect(value.state().active?.originalWebhookState).toEqual(previous)
    expect(value.state().pending).toBeNull()
  })

  it('sends once via the stored conversation and reconciles happy, ambiguous, and rejected results', async () => {
    const happy = fixture()
    await happy.service.saveAndConfigure(await prepare(happy))
    await expect(
      happy.service.sendText({ conversationId: 7, text: 'Resposta', replyTo: 'received-1' })
    ).resolves.toMatchObject({ messageId: 'message-1' })
    expect(happy.client.sendText).toHaveBeenCalledExactlyOnceWith({
      destination: 'conversation-address',
      message: 'Resposta',
      replyMessageId: 'received-1'
    })
    expect(happy.messageStore.markOutboundSent).toHaveBeenCalledExactlyOnceWith(
      'client-message-1',
      'instance-1',
      'message-1'
    )

    const ambiguous = fixture()
    await ambiguous.service.saveAndConfigure(await prepare(ambiguous))
    vi.mocked(ambiguous.client.sendText).mockRejectedValue(
      new ZApiAmbiguousSendError('network_error')
    )
    await expect(
      ambiguous.service.sendText({ conversationId: 7, text: 'Resposta' })
    ).rejects.toMatchObject({ retrySafe: false })
    expect(ambiguous.client.sendText).toHaveBeenCalledTimes(1)
    expect(ambiguous.messageStore.markOutboundUnknown).toHaveBeenCalledTimes(1)

    const rejected = fixture()
    await rejected.service.saveAndConfigure(await prepare(rejected))
    vi.mocked(rejected.client.sendText).mockRejectedValue(
      new CommunicationApiError('provider_rejected', 'rejected')
    )
    await expect(
      rejected.service.sendText({ conversationId: 7, text: 'Resposta' })
    ).rejects.toMatchObject({ code: 'provider_rejected' })
    expect(rejected.client.sendText).toHaveBeenCalledTimes(1)
    expect(rejected.messageStore.markOutboundFailed).toHaveBeenCalledTimes(1)
  })

  it('marks unknown instead of failed when local reconciliation fails after provider acceptance', async () => {
    const value = fixture()
    await value.service.saveAndConfigure(await prepare(value))
    vi.mocked(value.messageStore.markOutboundSent).mockImplementation(() => {
      throw new Error('local conflict')
    })
    await expect(
      value.service.sendText({ conversationId: 7, text: 'Resposta' })
    ).rejects.toMatchObject({
      code: 'message_persistence_failed',
      retrySafe: false,
      providerAccepted: true
    })
    expect(value.client.sendText).toHaveBeenCalledTimes(1)
    expect(value.messageStore.markOutboundUnknown).toHaveBeenCalledTimes(1)
    expect(value.messageStore.markOutboundFailed).not.toHaveBeenCalled()
  })

  it('rejects a stored group destination that is not a canonical group phone', async () => {
    const value = fixture()
    vi.mocked(value.messageStore.getReplyDestination).mockReturnValue({
      provider: 'z-api',
      instanceId: 'instance-1',
      conversationAddress: 'group-chat@lid',
      conversationKind: 'group'
    })
    await value.service.saveAndConfigure(await prepare(value))
    await expect(
      value.service.sendText({ conversationId: 7, text: 'Resposta' })
    ).rejects.toMatchObject({ code: 'invalid_configuration' })
    expect(value.messageStore.registerOutboundPending).not.toHaveBeenCalled()
    expect(value.client.sendText).not.toHaveBeenCalled()
  })

  it.each(['newsletter', 'broadcast'] as const)(
    'rejects a stored %s before pending persistence or provider construction',
    async (conversationKind) => {
      const value = fixture()
      await value.service.saveAndConfigure(await prepare(value))
      vi.mocked(value.messageStore.getReplyDestination).mockReturnValue({
        provider: 'z-api',
        instanceId: 'instance-1',
        conversationAddress:
          conversationKind === 'newsletter' ? '120363418284553@newsletter' : '1774895799-broadcast',
        conversationKind
      })
      value.createClient.mockClear()
      vi.mocked(value.client.sendText).mockClear()

      await expect(
        value.service.sendText({ conversationId: 7, text: 'Resposta' })
      ).rejects.toMatchObject({ code: 'conversation_not_replyable' })
      expect(value.messageStore.registerOutboundPending).not.toHaveBeenCalled()
      expect(value.createClient).not.toHaveBeenCalled()
      expect(value.client.sendText).not.toHaveBeenCalled()
    }
  )

  it('cleans pending and status when client construction fails after journaling', async () => {
    const value = fixture()
    vi.mocked(value.createClient).mockImplementationOnce(() => {
      throw new CommunicationApiError('invalid_configuration', 'invalid')
    })
    await expect(value.service.saveAndConfigure(await prepare(value))).rejects.toMatchObject({
      code: 'invalid_configuration'
    })
    expect(value.writes[0]?.pending?.phase).toBe('pre_mutation')
    expect(value.state().pending).toBeNull()
    expect(value.service.getStatus()).toMatchObject({
      verified: false,
      sendReady: false,
      receiveReady: false
    })
  })

  it('queues stop behind save and never remains ready with a stopped receiver', async () => {
    const value = fixture()
    const params = await prepare(value)
    const callbackUpdate = deferred<void>()
    vi.mocked(value.client.setEveryWebhooks).mockImplementationOnce(() => callbackUpdate.promise)
    const save = value.service.saveAndConfigure(params)
    await vi.waitFor(() => expect(value.client.setEveryWebhooks).toHaveBeenCalledTimes(1))
    const stop = value.service.stopIngress()
    expect(value.receiver.stop).not.toHaveBeenCalled()
    callbackUpdate.resolve(undefined)
    await expect(save).resolves.toMatchObject({ sendReady: true, receiveReady: true })
    await expect(stop).resolves.toBeUndefined()
    expect(value.receiver.stop).toHaveBeenCalledTimes(1)
    expect(value.service.getStatus()).toMatchObject({
      verified: false,
      sendReady: false,
      receiveReady: false,
      ingress: { prepared: false }
    })
  })

  it('queues removal behind an in-flight send without a second provider POST', async () => {
    const value = fixture()
    await value.service.saveAndConfigure(await prepare(value))
    const providerSend = deferred<{ zaapId: string; messageId: string; id: string }>()
    vi.mocked(value.client.sendText).mockImplementationOnce(() => providerSend.promise)
    const send = value.service.sendText({ conversationId: 7, text: 'Resposta' })
    await vi.waitFor(() => expect(value.client.sendText).toHaveBeenCalledTimes(1))
    vi.mocked(value.client.getInstanceWebhookState).mockResolvedValue(
      webhookState(previous.webhookUrl, false)
    )
    const remove = value.service.remove()
    expect(value.receiver.stop).not.toHaveBeenCalled()
    providerSend.resolve({ zaapId: 'zaap-2', messageId: 'message-2', id: 'id-2' })
    await expect(send).resolves.toMatchObject({ messageId: 'message-2' })
    await expect(remove).resolves.toBeUndefined()
    expect(value.client.sendText).toHaveBeenCalledTimes(1)
    expect(value.receiver.stop).toHaveBeenCalledTimes(1)
    expect(value.service.getStatus().sendReady).toBe(false)
  })
})
