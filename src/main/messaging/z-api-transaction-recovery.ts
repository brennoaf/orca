import type { ZApiTransactionActive, ZApiTransactionPending } from './z-api-transaction-journal'
import {
  matchesZApiWebhookState,
  ZApiTransactionError,
  zApiFullWebhookUrl,
  zApiTransactionErrorCode,
  type ZApiTransactionServiceDependencies,
  type ZApiTransactionStatus
} from './z-api-transaction-contract'

export async function recoverZApiPendingTransaction(args: {
  pending: ZApiTransactionPending
  active: ZApiTransactionActive | null
  status: ZApiTransactionStatus
  dependencies: ZApiTransactionServiceDependencies
}): Promise<void> {
  const { pending, active, status, dependencies } = args
  if (pending.phase === 'pre_mutation') {
    dependencies.journal.write({ version: 1, provider: 'z-api', active, pending: null })
    return
  }
  if (pending.phase === 'filters_clear_intent' || pending.phase === 'filters_cleared') {
    try {
      const client = dependencies.createClient(pending.configuration)
      await client.clearWebhookFilters()
      dependencies.journal.write({
        version: 1,
        provider: 'z-api',
        active,
        pending: { ...pending, phase: 'filters_cleared' }
      })
      dependencies.journal.write({ version: 1, provider: 'z-api', active, pending: null })
      return
    } catch (error) {
      status.verified = false
      status.sendReady = false
      status.receiveReady = false
      status.lastErrorCode = zApiTransactionErrorCode(error)
      throw error
    }
  }
  await restoreZApiPendingTransaction(args)
}

export async function restoreZApiPendingTransaction(args: {
  pending: ZApiTransactionPending
  active: ZApiTransactionActive | null
  status: ZApiTransactionStatus
  dependencies: ZApiTransactionServiceDependencies
}): Promise<void> {
  const { pending, active, status, dependencies } = args
  if (!pending.rollbackWebhookState) {
    dependencies.journal.write({
      version: 1,
      provider: 'z-api',
      active,
      pending: null
    })
    return
  }
  const client = dependencies.createClient(pending.configuration)
  try {
    const current = await client.getInstanceWebhookState()
    const fullUrl = zApiFullWebhookUrl(pending.configuration)
    const previous = pending.rollbackWebhookState
    if (!matchesZApiWebhookState(current, previous.webhookUrl, previous.receiveCallbackSentByMe)) {
      if (!matchesZApiWebhookState(current, fullUrl, true)) {
        throw new Error('Webhook state is neither previous nor Orca-owned.')
      }
      await client.restoreEveryWebhooks(previous)
      const restored = await client.getInstanceWebhookState()
      if (
        !matchesZApiWebhookState(restored, previous.webhookUrl, previous.receiveCallbackSentByMe)
      ) {
        throw new Error('Webhook restore verification failed.')
      }
    }
    dependencies.journal.write({
      version: 1,
      provider: 'z-api',
      active,
      pending: null
    })
  } catch {
    dependencies.journal.write({
      version: 1,
      provider: 'z-api',
      active,
      pending: { ...pending, phase: 'repair_required' }
    })
    status.configured = active !== null
    status.verified = false
    status.sendReady = false
    status.receiveReady = false
    status.lastErrorCode = 'webhook_restore_failed'
    throw new ZApiTransactionError(
      'webhook_restore_failed',
      'Z-API webhooks require repair before continuing.'
    )
  }
}
