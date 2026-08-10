import type SyncDatabase from '../sqlite/sync-database'
import { upsertMessagingConversation } from './message-store-conversation-write'
import { numberField } from './message-store-schema'
import type { NormalizedZApiMessage } from './z-api-message-normalizer'
import {
  confirmZApiListeningValidation,
  validateZApiWebhookIngestContext,
  type ZApiWebhookIngestContext
} from './z-api-listening-validation-store'

export function ingestZApiMessage(
  db: SyncDatabase,
  message: NormalizedZApiMessage,
  context?: ZApiWebhookIngestContext
): { inserted: boolean; messageId: number } {
  validateZApiWebhookIngestContext(context)
  db.exec('BEGIN IMMEDIATE')
  try {
    const existing = db
      .prepare(
        'SELECT id FROM messages WHERE provider = ? AND instance_id = ? AND provider_message_id = ?'
      )
      .get(message.provider, message.instanceId, message.messageId) as { id?: unknown } | undefined
    if (existing) {
      db.exec('COMMIT')
      return { inserted: false, messageId: numberField(existing.id, 'message id') }
    }
    const persistedConversationId = upsertMessagingConversation(db, {
      provider: message.provider,
      instanceId: message.instanceId,
      address: message.conversationAddress,
      conversationKind: message.conversationKind,
      displayName: message.conversationName,
      occurredAt: message.occurredAt
    })
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO messages(
           conversation_id, provider, instance_id, provider_message_id, sender_address,
           sender_name, direction, content_kind, body, provider_content_type, occurred_at,
           delivery_status
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        persistedConversationId,
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
    const row = db
      .prepare(
        'SELECT id FROM messages WHERE provider = ? AND instance_id = ? AND provider_message_id = ?'
      )
      .get(message.provider, message.instanceId, message.messageId) as { id?: unknown } | undefined
    if (!row) {
      throw new Error('Messaging callback was not persisted.')
    }
    const messageId = numberField(row.id, 'message id')
    if (result.changes > 0 && context && message.content.kind === 'text') {
      confirmZApiListeningValidation(db, {
        configurationId: context.configurationId,
        instanceId: message.instanceId,
        code: message.content.text,
        messageId,
        persistedAt: context.persistedAt,
        monotonicNow: context.monotonicNow
      })
    }
    db.exec('COMMIT')
    return { inserted: result.changes > 0, messageId }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
