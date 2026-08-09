import { normalizeCommunicationApiEndpoint } from './communication-api-endpoint'
import type {
  ZApiTransactionActive,
  ZApiTransactionConfiguration
} from './z-api-transaction-journal'
import {
  matchesZApiWebhookState,
  validZApiSecret,
  ZApiTransactionError,
  zApiFullWebhookUrl,
  zApiTransactionErrorCode,
  type ZApiSaveAndConfigureParams,
  type ZApiTransactionServiceDependencies,
  type ZApiTransactionStatus
} from './z-api-transaction-contract'
import type { ZApiTransactionIngress } from './z-api-transaction-ingress'
import { recoverZApiPendingTransaction } from './z-api-transaction-recovery'

function configuration(
  params: ZApiSaveAndConfigureParams,
  ingressController: ZApiTransactionIngress
): ZApiTransactionConfiguration {
  const ingress = ingressController.require(params.listenPort)
  if (
    params.preparedIngress.listenPort !== ingress.endpoint.port ||
    params.preparedIngress.localTunnelTarget !== `http://127.0.0.1:${ingress.endpoint.port}` ||
    !validZApiSecret(params.instanceId) ||
    !validZApiSecret(params.instanceToken) ||
    !validZApiSecret(params.clientToken)
  ) {
    throw new ZApiTransactionError('invalid_configuration', 'Z-API configuration is invalid.')
  }
  return {
    instanceId: params.instanceId,
    instanceToken: params.instanceToken,
    clientToken: params.clientToken,
    baseUrl: normalizeCommunicationApiEndpoint(params.baseUrl).baseUrl,
    endpointTrust: params.endpointTrust,
    publicWebhookBaseUrl: normalizeCommunicationApiEndpoint(params.publicWebhookBaseUrl).baseUrl,
    secretPath: ingress.path,
    listenPort: ingress.endpoint.port
  }
}

function readyStatus(listenPort: number): ZApiTransactionStatus {
  return {
    configured: true,
    verified: true,
    sendReady: true,
    receiveReady: true,
    connected: true,
    smartphoneConnected: true,
    ingress: {
      prepared: true,
      listenPort,
      challengeVerified: true,
      webhooksVerified: true
    },
    lastErrorCode: null
  }
}

function recoveryFailure(original: unknown, recovery: unknown): unknown {
  const cause = new AggregateError([original, recovery], 'Z-API save and recovery both failed.')
  return recovery instanceof ZApiTransactionError
    ? new ZApiTransactionError(recovery.code, recovery.message, { cause })
    : new ZApiTransactionError('provider_unavailable', 'Z-API save recovery failed.', { cause })
}

export async function saveAndConfigureZApiTransaction(args: {
  params: ZApiSaveAndConfigureParams
  dependencies: ZApiTransactionServiceDependencies
  ingress: ZApiTransactionIngress
  status: ZApiTransactionStatus
}): Promise<ZApiTransactionStatus> {
  const { dependencies, ingress, status } = args
  const nextConfiguration = configuration(args.params, ingress)
  const current = dependencies.journal.read()
  if (current.active && current.active.configuration.instanceId !== nextConfiguration.instanceId) {
    throw new ZApiTransactionError(
      'invalid_configuration',
      'Remove the active Z-API instance before configuring another instance.'
    )
  }
  dependencies.journal.write({
    ...current,
    pending: {
      phase: 'pre_mutation',
      configuration: nextConfiguration,
      rollbackWebhookState: null
    }
  })
  status.verified = false
  status.sendReady = false
  status.receiveReady = false
  try {
    const client = dependencies.createClient(nextConfiguration)
    const providerStatus = await client.getStatus()
    status.connected = providerStatus.connected
    status.smartphoneConnected = providerStatus.smartphoneConnected
    if (!providerStatus.connected || !providerStatus.smartphoneConnected) {
      throw new ZApiTransactionError(
        'provider_unavailable',
        'Z-API instance and smartphone must be connected.'
      )
    }
    const receiver = ingress.require(nextConfiguration.listenPort).receiver
    receiver.setExpectedInstanceId(nextConfiguration.instanceId)
    await ingress.challenge(nextConfiguration, status)
    const providerWebhookState = await client.getRestorableWebhookState()
    if (
      current.active &&
      (providerWebhookState.webhookUrl !== zApiFullWebhookUrl(current.active.configuration) ||
        !providerWebhookState.receiveCallbackSentByMe)
    ) {
      throw new ZApiTransactionError(
        'webhook_state_conflict',
        'Z-API webhooks drifted from the active Orca configuration.'
      )
    }
    const pending = {
      phase: 'filters_clear_intent' as const,
      configuration: nextConfiguration,
      rollbackWebhookState: providerWebhookState
    }
    dependencies.journal.write({ ...current, pending })
    await client.clearWebhookFilters()
    dependencies.journal.write({
      ...current,
      pending: { ...pending, phase: 'filters_cleared' }
    })
    dependencies.journal.write({
      ...current,
      pending: { ...pending, phase: 'callback_mutation_intent' }
    })
    await client.setEveryWebhooks(zApiFullWebhookUrl(nextConfiguration), true)
    const webhooks = await client.getInstanceWebhookState()
    if (!matchesZApiWebhookState(webhooks, zApiFullWebhookUrl(nextConfiguration), true)) {
      throw new ZApiTransactionError(
        'webhook_state_conflict',
        'Z-API did not retain the configured webhooks.'
      )
    }
    const active: ZApiTransactionActive = {
      configuration: nextConfiguration,
      originalWebhookState: current.active?.originalWebhookState ?? providerWebhookState,
      verifiedAt: new Date((dependencies.now ?? Date.now)()).toISOString()
    }
    dependencies.journal.write({ ...current, active, pending: null })
    return readyStatus(nextConfiguration.listenPort)
  } catch (error) {
    status.lastErrorCode = zApiTransactionErrorCode(error)
    let failure: unknown = error
    try {
      const journal = dependencies.journal.read()
      if (journal.pending) {
        await recoverZApiPendingTransaction({
          pending: journal.pending,
          active: journal.active,
          status,
          dependencies
        })
      }
    } catch (recoveryError) {
      failure = recoveryFailure(error, recoveryError)
    } finally {
      try {
        ingress
          .require(nextConfiguration.listenPort)
          .receiver.setExpectedInstanceId(current.active?.configuration.instanceId ?? null)
      } catch (receiverError) {
        failure = recoveryFailure(
          failure,
          new ZApiTransactionError('receiver_unavailable', 'Webhook receiver reset failed.', {
            cause: receiverError
          })
        )
      }
    }
    throw failure
  }
}
