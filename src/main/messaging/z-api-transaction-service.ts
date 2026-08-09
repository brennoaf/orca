import type { ZApiInstanceStatus, ZApiSendTextResult } from './z-api-communication-client-contract'
import type { ZApiTransactionActive, ZApiTransactionPending } from './z-api-transaction-journal'
import {
  emptyZApiTransactionStatus,
  matchesZApiWebhookState,
  ZApiTransactionError,
  zApiFullWebhookUrl,
  zApiTransactionErrorCode,
  type ZApiPreparedIngress,
  type ZApiSaveAndConfigureParams,
  type ZApiTransactionServiceDependencies,
  type ZApiTransactionStatus
} from './z-api-transaction-contract'
import { ZApiTransactionIngress } from './z-api-transaction-ingress'
import { ZApiTransactionLock } from './z-api-transaction-lock'
import { recoverZApiPendingTransaction } from './z-api-transaction-recovery'
import { saveAndConfigureZApiTransaction } from './z-api-transaction-save'
import { sendZApiTransactionText } from './z-api-transaction-send'

export { ZApiTransactionError } from './z-api-transaction-contract'
export { ZApiPostAcceptPersistenceError } from './z-api-transaction-send'
export type {
  ZApiPreparedIngress,
  ZApiReceiverController,
  ZApiReceiverEndpoint,
  ZApiSaveAndConfigureParams,
  ZApiTransactionClient,
  ZApiTransactionErrorCode,
  ZApiTransactionJournalPort,
  ZApiTransactionMessageStore,
  ZApiTransactionServiceDependencies,
  ZApiTransactionStatus
} from './z-api-transaction-contract'

export class ZApiTransactionService {
  private status = emptyZApiTransactionStatus()
  private readonly ingress: ZApiTransactionIngress
  private readonly lock = new ZApiTransactionLock()

  constructor(private readonly dependencies: ZApiTransactionServiceDependencies) {
    this.ingress = new ZApiTransactionIngress(dependencies)
  }

  getStatus(): ZApiTransactionStatus {
    return structuredClone(this.status)
  }

  prepareIngress(requestedPort: number): Promise<ZApiPreparedIngress> {
    return this.lock.run(() => this.ingress.prepare(requestedPort, this.status))
  }

  stopIngress(): Promise<void> {
    return this.lock.run(() => this.ingress.stop(this.status))
  }

  discardPreparedIngress(): Promise<ZApiTransactionStatus> {
    return this.lock.run(async () => {
      const journal = this.dependencies.journal.read()
      if (journal.active) {
        throw new ZApiTransactionError(
          'active_ingress_locked',
          'Remove the active Z-API integration before changing its local port.'
        )
      }
      if (journal.pending) {
        throw new ZApiTransactionError(
          'webhook_restore_failed',
          'Resolve the pending Z-API webhook repair before changing its local port.'
        )
      }
      await this.ingress.stop(this.status)
      this.status.lastErrorCode = null
      return this.getStatus()
    })
  }

  async saveAndConfigure(params: ZApiSaveAndConfigureParams): Promise<ZApiTransactionStatus> {
    return this.lock.run(async () => {
      this.status = await saveAndConfigureZApiTransaction({
        params,
        dependencies: this.dependencies,
        ingress: this.ingress,
        status: this.status
      })
      return this.getStatus()
    })
  }

  async recover(): Promise<ZApiTransactionStatus> {
    return this.lock.run(async () => {
      let journal = this.dependencies.journal.read()
      if (journal.pending) {
        await recoverZApiPendingTransaction({
          pending: journal.pending,
          active: journal.active,
          status: this.status,
          dependencies: this.dependencies
        })
        journal = this.dependencies.journal.read()
      }
      if (!journal.active) {
        this.status = emptyZApiTransactionStatus()
        return this.getStatus()
      }
      await this.revalidateActive(journal.active)
      return this.getStatus()
    })
  }

  async remove(): Promise<void> {
    await this.lock.run(async () => {
      let journal = this.dependencies.journal.read()
      if (journal.pending) {
        await recoverZApiPendingTransaction({
          pending: journal.pending,
          active: journal.active,
          status: this.status,
          dependencies: this.dependencies
        })
        journal = this.dependencies.journal.read()
      }
      if (journal.pending) {
        throw new ZApiTransactionError(
          'webhook_restore_failed',
          'Z-API recovery must complete before removal.'
        )
      }
      const active = journal.active
      if (active) {
        const pending: ZApiTransactionPending = {
          phase: 'callback_mutation_intent',
          configuration: active.configuration,
          rollbackWebhookState: active.originalWebhookState
        }
        this.dependencies.journal.write({ ...journal, pending })
        await recoverZApiPendingTransaction({
          pending,
          active,
          status: this.status,
          dependencies: this.dependencies
        })
        journal = this.dependencies.journal.read()
        if (journal.pending) {
          throw new ZApiTransactionError(
            'webhook_restore_failed',
            'Z-API webhook restoration must complete before removal.'
          )
        }
      }
      this.dependencies.journal.clear()
      await this.ingress.stop(this.status)
      this.status = emptyZApiTransactionStatus()
    })
  }

  async sendText(args: {
    conversationId: number
    text: string
    replyTo?: string
  }): Promise<ZApiSendTextResult> {
    return this.lock.run(async () => {
      if (!this.status.sendReady) {
        throw new ZApiTransactionError('not_configured', 'Z-API sending is not ready.')
      }
      const active = this.dependencies.journal.read().active
      if (!active) {
        throw new ZApiTransactionError('not_configured', 'Z-API is not configured.')
      }
      return sendZApiTransactionText({ ...args, active, dependencies: this.dependencies })
    })
  }

  private async revalidateActive(active: ZApiTransactionActive): Promise<void> {
    try {
      const receiver = await this.ingress.ensureActive(active.configuration, this.status)
      const client = this.dependencies.createClient(active.configuration)
      const providerStatus = await client.getStatus()
      this.setProviderStatus(providerStatus)
      if (!providerStatus.connected || !providerStatus.smartphoneConnected) {
        throw new ZApiTransactionError('provider_unavailable', 'Z-API is disconnected.')
      }
      receiver.setExpectedConfiguration({
        instanceId: active.configuration.instanceId,
        configurationId: active.configuration.configurationId
      })
      await this.ingress.challenge(active.configuration, this.status)
      const webhooks = await client.getInstanceWebhookState()
      if (!matchesZApiWebhookState(webhooks, zApiFullWebhookUrl(active.configuration), true)) {
        throw new ZApiTransactionError(
          'webhook_state_conflict',
          'Z-API webhooks no longer match the active configuration.'
        )
      }
      this.status = this.readyStatus(active.configuration.listenPort)
    } catch (error) {
      this.status.configured = true
      this.status.verified = false
      this.status.sendReady = false
      this.status.receiveReady = false
      this.status.lastErrorCode = zApiTransactionErrorCode(error)
    }
  }

  private readyStatus(listenPort: number): ZApiTransactionStatus {
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

  private setProviderStatus(status: ZApiInstanceStatus): void {
    this.status.connected = status.connected
    this.status.smartphoneConnected = status.smartphoneConnected
  }
}
