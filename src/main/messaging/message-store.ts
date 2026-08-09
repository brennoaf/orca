import SyncDatabase from '../sqlite/sync-database'
import type { NormalizedZApiMessage } from './z-api-message-normalizer'
import { reconcileOutboundSent } from './message-store-outbound-reconciliation'
import { collectMessageStoreGarbage } from './message-store-retention'
import {
  DEFAULT_MAX_CONVERSATIONS,
  DEFAULT_MAX_MESSAGES_PER_CONVERSATION,
  DEFAULT_TTL_MS,
  initializeMessageStoreDatabase,
  numberField,
  parseConversation,
  parseMessage,
  positiveInteger,
  stringField,
  type ConversationRow,
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
  private readonly db: SyncDatabase
  private readonly ttlMs: number
  private readonly maxMessagesPerConversation: number
  private readonly maxConversations: number
  private gcPromise: Promise<MessagingGcResult> | null = null
  private closed = false

  constructor(dbPath: string | ':memory:', options: MessageStoreOptions = {}) {
    this.ttlMs = positiveInteger(options.ttlMs, DEFAULT_TTL_MS)
    this.maxMessagesPerConversation = positiveInteger(
      options.maxMessagesPerConversation,
      DEFAULT_MAX_MESSAGES_PER_CONVERSATION
    )
    this.maxConversations = positiveInteger(options.maxConversations, DEFAULT_MAX_CONVERSATIONS)
    this.db = new SyncDatabase(dbPath)
    initializeMessageStoreDatabase(this.db, dbPath)
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new Error('Messaging database is closed.')
    }
  }

  private conversationId(
    provider: 'z-api',
    instanceId: string,
    address: string,
    displayName: string | null,
    occurredAt: number
  ): number {
    this.db
      .prepare(
        `INSERT INTO conversations(provider, instance_id, address, display_name, last_message_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(provider, instance_id, address) DO UPDATE SET
           display_name = COALESCE(excluded.display_name, conversations.display_name),
           last_message_at = MAX(conversations.last_message_at, excluded.last_message_at)`
      )
      .run(provider, instanceId, address, displayName, occurredAt)
    const row = this.db
      .prepare(
        'SELECT id FROM conversations WHERE provider = ? AND instance_id = ? AND address = ?'
      )
      .get(provider, instanceId, address) as { id?: unknown } | undefined
    if (!row) {
      throw new Error('Messaging conversation was not persisted.')
    }
    return numberField(row.id, 'conversation id')
  }

  ingest(message: NormalizedZApiMessage): { inserted: boolean; messageId: number } {
    this.ensureOpen()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const existing = this.db
        .prepare(
          'SELECT id FROM messages WHERE provider = ? AND instance_id = ? AND provider_message_id = ?'
        )
        .get(message.provider, message.instanceId, message.messageId) as
        | { id?: unknown }
        | undefined
      if (existing) {
        this.db.exec('COMMIT')
        return { inserted: false, messageId: numberField(existing.id, 'message id') }
      }
      const conversationId = this.conversationId(
        message.provider,
        message.instanceId,
        message.conversationAddress,
        message.conversationName,
        message.occurredAt
      )
      const result = this.db
        .prepare(
          `INSERT OR IGNORE INTO messages(
             conversation_id, provider, instance_id, provider_message_id, sender_address,
             sender_name, direction, content_kind, body, provider_content_type, occurred_at,
             delivery_status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          conversationId,
          message.provider,
          message.instanceId,
          message.messageId,
          message.senderAddress,
          message.senderName,
          message.direction,
          message.content.kind,
          message.content.kind === 'text' ? message.content.text : null,
          message.content.kind === 'unsupported' ? message.content.providerType : null,
          message.occurredAt,
          message.direction === 'outbound' ? 'sent' : 'received'
        )
      const row = this.db
        .prepare(
          'SELECT id FROM messages WHERE provider = ? AND instance_id = ? AND provider_message_id = ?'
        )
        .get(message.provider, message.instanceId, message.messageId) as
        | { id?: unknown }
        | undefined
      if (!row) {
        throw new Error('Messaging callback was not persisted.')
      }
      this.db.exec('COMMIT')
      return {
        inserted: result.changes > 0,
        messageId: numberField(row.id, 'message id')
      }
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
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
      const conversationId = this.conversationId(
        'z-api',
        args.instanceId,
        args.conversationAddress,
        args.conversationName ?? null,
        args.occurredAt
      )
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
    const result = this.db
      .prepare(
        `UPDATE messages SET delivery_status = 'unknown'
         WHERE provider = 'z-api' AND instance_id = ? AND client_message_id = ?`
      )
      .run(instanceId, clientMessageId)
    if (result.changes !== 1) {
      throw new Error('Outbound message was not found.')
    }
  }

  listConversations(limit = this.maxConversations): MessagingConversation[] {
    this.ensureOpen()
    const rows = this.db
      .prepare(
        `SELECT id, provider, instance_id, address, display_name, last_message_at
         FROM conversations ORDER BY last_message_at DESC, id DESC LIMIT ?`
      )
      .all(positiveInteger(limit, this.maxConversations)) as ConversationRow[]
    return rows.map(parseConversation)
  }

  listRecentMessages(conversationId: number, limit = 20): MessagingMessage[] {
    this.ensureOpen()
    const rows = this.db
      .prepare(
        `SELECT * FROM (
           SELECT id, conversation_id, provider_message_id, client_message_id, direction,
             sender_address, sender_name, content_kind, body, provider_content_type,
             occurred_at, delivery_status
           FROM messages WHERE conversation_id = ?
           ORDER BY occurred_at DESC, id DESC LIMIT ?
         ) ORDER BY occurred_at ASC, id ASC`
      )
      .all(conversationId, positiveInteger(limit, 20)) as MessageRow[]
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
