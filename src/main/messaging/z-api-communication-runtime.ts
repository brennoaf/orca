import { app } from 'electron'
import { join } from 'node:path'
import {
  DEFAULT_Z_API_BASE_URL,
  type CommunicationIntegrationRedactedError,
  type ZApiCommunicationIntegrationStatus,
  type ZApiCommunicationOperationResult
} from '../../shared/communication-integrations'
import { normalizeCommunicationApiEndpoint } from './communication-api-endpoint'
import { redactCommunicationIntegrationError } from './communication-integration-credential-file'
import { MessageStore } from './message-store'
import {
  emptyZApiCommunicationStatus,
  readZApiCommunicationCredentials
} from './z-api-communication-credential-store'
import { ZApiAmbiguousSendError } from './z-api-communication-client'
import { ZApiConversationAvatarService } from './z-api-conversation-avatar-service'
import { ZApiListeningValidation } from './z-api-listening-validation'
import type { ZApiTransactionConfiguration } from './z-api-transaction-journal'
import { ZApiTransactionJournal } from './z-api-transaction-journal'
import { createZApiTransactionService } from './z-api-transaction-service-factory'
import {
  ZApiPostAcceptPersistenceError,
  ZApiTransactionError,
  type ZApiTransactionErrorCode,
  type ZApiTransactionService
} from './z-api-transaction-service'

export type ZApiCommunicationRuntime = {
  service: ZApiTransactionService
  store: MessageStore
  journal: ZApiTransactionJournal
  listeningValidation: ZApiListeningValidation
  avatarService: ZApiConversationAvatarService
  gcTimer: ReturnType<typeof setInterval> | null
  gcPromise: Promise<void> | null
}

const GC_INTERVAL_MS = 6 * 60 * 60 * 1_000

const TRANSACTION_ERROR_MESSAGES: Record<ZApiTransactionErrorCode, string> = {
  invalid_configuration: 'The Z-API configuration is invalid.',
  not_configured: 'Z-API is not configured.',
  provider_unavailable: 'Z-API is unavailable.',
  receiver_unavailable: 'The Z-API webhook receiver is unavailable.',
  active_ingress_locked: 'Remove the active Z-API integration before changing its local port.',
  webhook_challenge_failed: 'The public webhook challenge failed.',
  webhook_state_conflict: 'The Z-API webhook configuration changed unexpectedly.',
  webhook_restore_failed: 'The previous Z-API webhook configuration could not be restored.',
  conversation_not_replyable:
    'WhatsApp newsletters and broadcast lists do not support fast replies. Choose a private or group conversation.',
  ambiguous_send: 'Z-API message delivery is ambiguous.',
  message_persistence_failed: 'The message could not be persisted safely.'
}

let runtimePromise: Promise<ZApiCommunicationRuntime> | null = null
let disposePromise: Promise<void> | null = null
let shuttingDown = false

function transactionError(code: ZApiTransactionErrorCode): CommunicationIntegrationRedactedError {
  return { code, message: TRANSACTION_ERROR_MESSAGES[code], field: null }
}

function redactZApiError(error: unknown): CommunicationIntegrationRedactedError | null {
  if (error instanceof ZApiAmbiguousSendError) {
    return transactionError('ambiguous_send')
  }
  if (error instanceof ZApiPostAcceptPersistenceError) {
    return transactionError('message_persistence_failed')
  }
  if (error instanceof ZApiTransactionError) {
    return transactionError(error.code)
  }
  return redactCommunicationIntegrationError(error)
}

function collectRuntimeGarbage(runtime: ZApiCommunicationRuntime): Promise<void> {
  runtime.gcPromise ??= runtime.store.collectGarbage().then(() => undefined)
  return runtime.gcPromise.finally(() => {
    runtime.gcPromise = null
  })
}

async function createRuntime(): Promise<ZApiCommunicationRuntime> {
  const store = new MessageStore(join(app.getPath('userData'), 'orca-messaging.db'))
  const journal = new ZApiTransactionJournal()
  const service = createZApiTransactionService({
    messageStore: store,
    journal,
    onReceiverError: () => {
      console.error('[z-api] Webhook receiver failed.')
    }
  })
  const listeningValidation = new ZApiListeningValidation(store.listeningValidation)
  const avatarService = new ZApiConversationAvatarService({
    messageStore: store,
    getConfiguration: () => journal.read().active?.configuration ?? null
  })
  const runtime: ZApiCommunicationRuntime = {
    service,
    store,
    journal,
    listeningValidation,
    avatarService,
    gcTimer: null,
    gcPromise: null
  }
  try {
    await service.recover()
  } catch (error) {
    if (!redactZApiError(error)) {
      store.close()
      throw error
    }
  }
  try {
    listeningValidation.retain(journal.read().active?.configuration.configurationId ?? null)
    await collectRuntimeGarbage(runtime)
  } catch (error) {
    try {
      await service.stopIngress()
    } finally {
      store.close()
    }
    throw error
  }
  const gcTimer = setInterval(() => {
    void collectRuntimeGarbage(runtime).catch(() => {
      console.error('[z-api] Messaging retention failed.')
    })
  }, GC_INTERVAL_MS)
  gcTimer.unref()
  runtime.gcTimer = gcTimer
  return runtime
}

export function getZApiCommunicationRuntime(): Promise<ZApiCommunicationRuntime> {
  if (shuttingDown) {
    return Promise.reject(
      new ZApiTransactionError('provider_unavailable', 'Z-API is shutting down.')
    )
  }
  runtimePromise ??= createRuntime().catch((error: unknown) => {
    runtimePromise = null
    throw error
  })
  return runtimePromise
}

export function currentZApiConfiguration(
  zApiRuntime: ZApiCommunicationRuntime
): ZApiTransactionConfiguration | null {
  return zApiRuntime.journal.read().active?.configuration ?? null
}

export function zApiStatusFromRuntime(
  zApiRuntime: ZApiCommunicationRuntime
): ZApiCommunicationIntegrationStatus {
  const serviceStatus = zApiRuntime.service.getStatus()
  const active = zApiRuntime.journal.read().active
  const configuration = active?.configuration ?? null
  let listeningValidation = zApiRuntime.listeningValidation.status(
    configuration?.configurationId ?? null
  )
  let listeningConfirmedAt: number | null = null
  try {
    listeningConfirmedAt =
      listeningValidation.state === 'failed'
        ? null
        : zApiRuntime.listeningValidation.confirmedAt(configuration?.configurationId ?? null)
  } catch (error) {
    if (!(error instanceof ZApiTransactionError)) {
      throw error
    }
    listeningValidation = {
      state: 'failed',
      attemptId: null,
      code: null,
      deadline: null,
      remainingMs: null,
      confirmedAt: null,
      error: transactionError(error.code)
    }
  }
  const listeningConfirmed = listeningConfirmedAt !== null
  const legacy = configuration ? null : readZApiCommunicationCredentials()
  const normalized = normalizeCommunicationApiEndpoint(
    configuration?.baseUrl ?? legacy?.baseUrl ?? DEFAULT_Z_API_BASE_URL
  )
  const lastError = serviceStatus.lastErrorCode
    ? transactionError(serviceStatus.lastErrorCode)
    : null
  const listenPort = serviceStatus.ingress.prepared ? serviceStatus.ingress.listenPort : null
  return {
    provider: 'z-api',
    endpoint: {
      baseUrl: normalized.baseUrl,
      authority: normalized.authority,
      trust: configuration
        ? configuration.endpointTrust
        : legacy?.trustedCustomAuthority
          ? { kind: 'custom', authority: legacy.trustedCustomAuthority }
          : { kind: 'default' }
    },
    readiness: {
      configured: serviceStatus.configured,
      verified: serviceStatus.verified && listeningConfirmed,
      sendReady: serviceStatus.sendReady,
      receiveReady: serviceStatus.receiveReady && listeningConfirmed,
      verifiedAt:
        serviceStatus.verified && listeningConfirmedAt !== null
          ? new Date(listeningConfirmedAt).toISOString()
          : null,
      lastError
    },
    instanceId: configuration?.instanceId ?? legacy?.instanceId ?? null,
    instanceTokenStored: Boolean(configuration?.instanceToken ?? legacy?.instanceToken),
    clientTokenStored: Boolean(configuration?.clientToken ?? legacy?.clientToken),
    instanceConnected: serviceStatus.connected,
    smartphoneConnected: serviceStatus.smartphoneConnected,
    ingressPrepared: serviceStatus.ingress.prepared,
    listenPort,
    localTunnelTarget: listenPort === null ? null : `http://127.0.0.1:${listenPort}`,
    publicWebhookBaseUrl: configuration?.publicWebhookBaseUrl ?? null,
    publicIngressVerified: serviceStatus.ingress.challengeVerified,
    webhooksConfigured: serviceStatus.ingress.webhooksVerified,
    listeningValidation,
    lastErrorCode: serviceStatus.lastErrorCode
  }
}

export async function runZApiCommunicationOperation<T>(
  run: (zApiRuntime: ZApiCommunicationRuntime) => Promise<T> | T
): Promise<ZApiCommunicationOperationResult<T>> {
  let zApiRuntime: ZApiCommunicationRuntime | null = null
  try {
    zApiRuntime = await getZApiCommunicationRuntime()
    const value = await run(zApiRuntime)
    return { ok: true, status: zApiStatusFromRuntime(zApiRuntime), value }
  } catch (error) {
    const safeError = redactZApiError(error)
    if (!safeError) {
      throw error
    }
    const status = zApiRuntime
      ? zApiStatusFromRuntime(zApiRuntime)
      : emptyZApiCommunicationStatus(safeError)
    return { ok: false, status, error: safeError }
  }
}

export async function disposeZApiCommunicationRuntime(): Promise<void> {
  if (disposePromise) {
    return disposePromise
  }
  shuttingDown = true
  const pendingRuntime = runtimePromise
  disposePromise = (async () => {
    if (!pendingRuntime) {
      return
    }
    const runtime = await pendingRuntime
    if (runtime.gcTimer) {
      clearInterval(runtime.gcTimer)
      runtime.gcTimer = null
    }
    try {
      const results = await Promise.allSettled([
        Promise.resolve().then(() => runtime.listeningValidation.cancelPending()),
        runtime.avatarService.dispose(),
        runtime.gcPromise ?? Promise.resolve(),
        runtime.service.stopIngress()
      ])
      const failures: unknown[] = []
      for (const result of results) {
        if (result.status === 'rejected') {
          failures.push(result.reason as unknown)
        }
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Z-API shutdown failed.')
      }
    } finally {
      runtime.store.close()
    }
  })()
  return disposePromise
}
