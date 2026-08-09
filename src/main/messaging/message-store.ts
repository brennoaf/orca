import SyncDatabase from '../sqlite/sync-database'
import type { NormalizedZApiMessage } from './z-api-message-normalizer'
import {
  markOutboundDeliveryStatus,
  reconcileOutboundSent,
  recoverPendingOutbound
} from './message-store-outbound-reconciliation'
import { collectMessageStoreGarbage } from './message-store-retention'
import { listMessagingConversations } from './message-store-conversation-read'
import { upsertMessagingConversation } from './message-store-conversation-write'
import { ingestZApiMessage } from './message-store-ingest'
import { ZApiListeningValidationDatabase } from './z-api-listening-validation-database'
import type { ZApiWebhookIngestContext } from './z-api-listening-validation-store'
import {
  DEFAULT_MAX_CONVERSATIONS,
  DEFAULT_MAX_MESSAGES_PER_CONVERSATION,
  DEFAULT_TTL_MS,
  initializeMessageStoreDatabase,
  numberField,
  parseMessage,
  positiveInteger,
  stringField,
  type MessageRow,
  type MessageStoreOptions,
  type MessagingConversation,
  type MessagingGcResult,
  type MessagingMessage,
  type MessagingReplyDestination
} from './message-store-schema'

export type {
  MessageStoreOptions,
  MessagingConversation,
  MessagingGcResult,
  MessagingMessage,
  MessagingReplyDestination
} from './message-store-schema'
export class MessageStore {
  readonly listeningValidation: ZApiListeningValidationDatabase
  private readonly db: SyncDatabase
  private readonly ttlMs: number
  private readonly maxMessagesPerConversation: number
  private readonly maxConversations: number
  private gcPromise: Promise<MessagingGcResult> | null = null
  private closed = false
  private outboundRecoveryCompleted = false

  constructor(dbPath: string | ':memory:', options: MessageStoreOptions = {}) {
    this.ttlMs = positiveInteger(options.ttlMs, DEFAULT_TTL_MS)
    this.maxMessagesPerConversation = positiveInteger(
      options.maxMessagesPerConversation,
      DEFAULT_MAX_MESSAGES_PER_CONVERSATION
    )
    this.maxConversations = positiveInteger(options.maxConversations, DEFAULT_MAX_CONVERSATIONS)
    this.db = new SyncDatabase(dbPath)
    initializeMessageStoreDatabase(this.db, dbPath)
    this.listeningValidation = new ZApiListeningValidationDatabase(this.db)
    this.listeningValidation.cancelPending()
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error('Messaging database is closed.')
    }
  }

  ingest(
    message: NormalizedZApiMessage,
    context?: ZApiWebhookIngestContext
  ): { inserted: boolean; messageId: number } {
    this.ensureOpen()
    return ingestZApiMessage(this.db, message, context)
  }

  registerOutboundPending(args: {
    instanceId: string
    conversationAddress: string
    conversationName?: string | null
    clientMessageId: string
    text: string
    occurredAt: number
  }): number {
    this.ensureOpen()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const existing = this.db
        .prepare(
          `SELECT id FROM messages
           WHERE provider = 'z-api' AND instance_id = ? AND client_message_id = ?`
        )
        .get(args.instanceId, args.clientMessageId) as { id?: unknown } | undefined
      if (existing) {
        this.db.exec('COMMIT')
        return numberField(existing.id, 'message id')
      }
      const conversationId = upsertMessagingConversation(this.db, {
        provider: 'z-api',
        instanceId: args.instanceId,
        address: args.conversationAddress,
        displayName: args.conversationName ?? null,
        occurredAt: args.occurredAt
      })
      this.db
        .prepare(
          `INSERT OR IGNORE INTO messages(
             conversation_id, provider, instance_id, client_message_id, direction,
             content_kind, body, occurred_at, delivery_status
           ) VALUES (?, 'z-api', ?, ?, 'outbound', 'text', ?, ?, 'pending')`
        )
        .run(conversationId, args.instanceId, args.clientMessageId, args.text, args.occurredAt)
      const row = this.db
        .prepare(
          `SELECT id FROM messages
           WHERE provider = 'z-api' AND instance_id = ? AND client_message_id = ?`
        )
        .get(args.instanceId, args.clientMessageId) as { id?: unknown } | undefined
      if (!row) {
        throw new Error('Outbound message was not persisted.')
      }
      this.db.exec('COMMIT')
      return numberField(row.id, 'message id')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  markOutboundSent(clientMessageId: string, instanceId: string, providerMessageId: string): void {
    this.ensureOpen()
    reconcileOutboundSent(this.db, clientMessageId, instanceId, providerMessageId)
  }

  markOutboundUnknown(clientMessageId: string, instanceId: string): void {
    this.ensureOpen()
    markOutboundDeliveryStatus(this.db, clientMessageId, instanceId, 'unknown')
  }

  markOutboundFailed(clientMessageId: string, instanceId: string): void {
    this.ensureOpen()
    markOutboundDeliveryStatus(this.db, clientMessageId, instanceId, 'failed')
  }

  recoverPendingOutbound(): number {
    this.ensureOpen()
    if (this.outboundRecoveryCompleted) {
      return 0
    }
    const recovered = recoverPendingOutbound(this.db)
    this.outboundRecoveryCompleted = true
    return recovered
  }

  listConversations(
    limit = this.maxConversations,
    offset = 0,
    instanceId?: string
  ): MessagingConversation[] {
    this.ensureOpen()
    return listMessagingConversations({
      db: this.db,
      defaultLimit: this.maxConversations,
      limit,
      offset,
      ...(instanceId === undefined ? {} : { instanceId })
    })
  }

  listRecentMessages(conversationId: number, limit = 20, offset = 0): MessagingMessage[] {
    this.ensureOpen()
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT id, conversation_id, provider_message_id, client_message_id, direction,
             sender_address, sender_name, content_kind, body, provider_content_type,
             occurred_at, delivery_status
           FROM messages WHERE conversation_id = ?
           ORDER BY occurred_at DESC, id DESC LIMIT ? OFFSET ?
         ) ORDER BY occurred_at ASC, id ASC`
      )
      .all(
        conversationId,
        positiveInteger(limit, 20),
        positiveInteger(offset + 1, 1) - 1
      ) as MessageRow[]
    return rows.map(parseMessage)
  }

  getReplyDestination(conversationId: number): MessagingReplyDestination | null {
    this.ensureOpen()
    const row = this.db
      .prepare('SELECT provider, instance_id, address FROM conversations WHERE id = ?')
      .get(conversationId) as
      | { provider?: unknown; instance_id?: unknown; address?: unknown }
      | undefined
    if (!row) {
      return null
    }
    const provider = stringField(row.provider, 'provider')
    if (provider !== 'z-api') {
      throw new Error('Invalid messaging database provider.')
    }
    return {
      provider,
      instanceId: stringField(row.instance_id, 'instance id'),
      conversationAddress: stringField(row.address, 'conversation address')
    }
  }

  collectGarbage(now = Date.now()): Promise<MessagingGcResult> {
    this.ensureOpen()
    if (this.gcPromise) {
      return this.gcPromise
    }
    const operation = Promise.resolve().then(() =>
      collectMessageStoreGarbage(this.db, {
        now,
        ttlMs: this.ttlMs,
        maxMessagesPerConversation: this.maxMessagesPerConversation,
        maxConversations: this.maxConversations
      })
    )
    this.gcPromise = operation.finally(() => {
      this.gcPromise = null
    })
    return this.gcPromise
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.db.close()
    this.closed = true
  }
}
