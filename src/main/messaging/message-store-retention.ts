import type SyncDatabase from '../sqlite/sync-database'
import { numberField, type MessagingGcResult } from './message-store-schema'

type RetentionOptions = {
  now: number
  ttlMs: number
  maxMessagesPerConversation: number
  maxConversations: number
}

const OVERFLOW_CONVERSATIONS = `
  SELECT id FROM conversations
  ORDER BY last_message_at DESC, id DESC LIMIT -1 OFFSET ?
`

export function collectMessageStoreGarbage(
  db: SyncDatabase,
  options: RetentionOptions
): MessagingGcResult {
  db.exec('BEGIN IMMEDIATE')
  try {
    const expired = db
      .prepare('DELETE FROM messages WHERE occurred_at < ?')
      .run(options.now - options.ttlMs).changes
    const overflow = db
      .prepare(
        `DELETE FROM messages WHERE id IN (
           SELECT id FROM (
             SELECT id, ROW_NUMBER() OVER (
               PARTITION BY conversation_id ORDER BY occurred_at DESC, id DESC
             ) AS position
             FROM messages
           ) WHERE position > ?
         )`
      )
      .run(options.maxMessagesPerConversation).changes
    const empty = db
      .prepare(
        'DELETE FROM conversations WHERE id NOT IN (SELECT DISTINCT conversation_id FROM messages)'
      )
      .run().changes
    const cascadeRow = db
      .prepare(
        `SELECT COUNT(*) AS count FROM messages
         WHERE conversation_id IN (${OVERFLOW_CONVERSATIONS})`
      )
      .get(options.maxConversations) as { count?: unknown } | undefined
    if (!cascadeRow) {
      throw new Error('Messaging retention count failed.')
    }
    const cascadedMessages = numberField(cascadeRow.count, 'retention message count')
    const overflowConversations = db
      .prepare(`DELETE FROM conversations WHERE id IN (${OVERFLOW_CONVERSATIONS})`)
      .run(options.maxConversations).changes
    db.exec('COMMIT')
    return {
      messagesDeleted: Number(expired) + Number(overflow) + cascadedMessages,
      conversationsDeleted: Number(empty) + Number(overflowConversations)
    }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
