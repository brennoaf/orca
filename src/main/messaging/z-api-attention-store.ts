import type {
  ZApiAttentionSnapshot,
  ZApiConversationAttentionSnapshot
} from '../../shared/communication-integrations'
import type SyncDatabase from '../sqlite/sync-database'
import { numberField } from './message-store-schema'

type AttentionRow = {
  conversation_id: unknown
  unread_count: unknown
}

function parseAttentionRow(row: AttentionRow): ZApiConversationAttentionSnapshot {
  return {
    conversationId: numberField(row.conversation_id, 'attention conversation id'),
    unreadCount: numberField(row.unread_count, 'attention unread count')
  }
}

export function getZApiAttentionSnapshot(db: SyncDatabase): ZApiAttentionSnapshot {
  const conversations = db
    .prepare(
      `SELECT m.conversation_id, COUNT(*) AS unread_count
       FROM messages m
       LEFT JOIN conversation_attention a ON a.conversation_id = m.conversation_id
       WHERE m.direction = 'inbound' AND m.id > COALESCE(a.seen_through_message_id, 0)
       GROUP BY m.conversation_id
       ORDER BY MAX(m.id) DESC`
    )
    .all() as AttentionRow[]
  const parsed = conversations.map(parseAttentionRow)
  return {
    provider: 'z-api',
    totalUnread: parsed.reduce((total, conversation) => total + conversation.unreadCount, 0),
    conversations: parsed
  }
}

export function markZApiConversationSeen(db: SyncDatabase, conversationId: number): void {
  const row = db
    .prepare(
      `SELECT MAX(id) AS message_id FROM messages
       WHERE conversation_id = ? AND direction = 'inbound'`
    )
    .get(conversationId) as { message_id?: unknown } | undefined
  if (!row || row.message_id === null || row.message_id === undefined) {
    return
  }
  const messageId = numberField(row.message_id, 'attention message id')
  db.prepare(
    `INSERT INTO conversation_attention(conversation_id, seen_through_message_id)
     VALUES (?, ?)
     ON CONFLICT(conversation_id) DO UPDATE SET
       seen_through_message_id = MAX(seen_through_message_id, excluded.seen_through_message_id)`
  ).run(conversationId, messageId)
}

export function claimZApiInboundNotification(
  db: SyncDatabase,
  conversationId: number,
  messageId: number
): boolean {
  const result = db
    .prepare(
      `INSERT INTO conversation_attention(conversation_id, notified_through_message_id)
       VALUES (?, ?)
       ON CONFLICT(conversation_id) DO UPDATE SET
         notified_through_message_id = excluded.notified_through_message_id
       WHERE conversation_attention.notified_through_message_id < excluded.notified_through_message_id`
    )
    .run(conversationId, messageId)
  return result.changes === 1
}
