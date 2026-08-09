import type SyncDatabase from '../sqlite/sync-database'
import { parseMessage, type MessageRow, type MessagingMessage } from './message-store-schema'

function findMessage(db: SyncDatabase, where: string, values: string[]): MessagingMessage | null {
  const row = db
    .prepare(
      `SELECT id, conversation_id, provider_message_id, client_message_id, sender_address,
         sender_name, direction, content_kind, body, provider_content_type, occurred_at,
         delivery_status
       FROM messages WHERE provider = 'z-api' AND ${where}`
    )
    .get(...values) as MessageRow | undefined
  return row ? parseMessage(row) : null
}

export function reconcileOutboundSent(
  db: SyncDatabase,
  clientMessageId: string,
  instanceId: string,
  providerMessageId: string
): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    const pending = findMessage(db, 'instance_id = ? AND client_message_id = ?', [
      instanceId,
      clientMessageId
    ])
    if (!pending || pending.direction !== 'outbound') {
      throw new Error('Outbound message was not found.')
    }
    const callback = findMessage(db, 'instance_id = ? AND provider_message_id = ?', [
      instanceId,
      providerMessageId
    ])
    if (callback && callback.id !== pending.id) {
      if (callback.clientMessageId !== null) {
        throw new Error('Provider message ID belongs to another outbound message.')
      }
      if (callback.direction !== 'outbound' || callback.conversationId !== pending.conversationId) {
        throw new Error('Outbound callback does not match the pending message.')
      }
      const deleted = db.prepare('DELETE FROM messages WHERE id = ?').run(callback.id)
      if (deleted.changes !== 1) {
        throw new Error('Outbound callback could not be reconciled.')
      }
      db.prepare(
        `UPDATE messages SET
           sender_address = COALESCE(sender_address, ?),
           sender_name = COALESCE(sender_name, ?),
           body = COALESCE(body, ?),
           provider_content_type = COALESCE(provider_content_type, ?),
           occurred_at = MIN(occurred_at, ?)
         WHERE id = ?`
      ).run(
        callback.senderAddress,
        callback.senderName,
        callback.text,
        callback.providerContentType,
        callback.occurredAt,
        pending.id
      )
    }
    const updated = db
      .prepare(
        `UPDATE messages SET delivery_status = 'sent', provider_message_id = ?
         WHERE id = ?`
      )
      .run(providerMessageId, pending.id)
    if (updated.changes !== 1) {
      throw new Error('Outbound message was not found.')
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function markOutboundDeliveryStatus(
  db: SyncDatabase,
  clientMessageId: string,
  instanceId: string,
  status: 'unknown' | 'failed'
): void {
  const result = db
    .prepare(
      `UPDATE messages SET delivery_status = ?
       WHERE provider = 'z-api' AND instance_id = ? AND client_message_id = ?`
    )
    .run(status, instanceId, clientMessageId)
  if (result.changes !== 1) {
    throw new Error('Outbound message was not found.')
  }
}

export function recoverPendingOutbound(db: SyncDatabase): number {
  return Number(
    db
      .prepare(
        `UPDATE messages SET delivery_status = 'unknown'
         WHERE provider = 'z-api' AND direction = 'outbound' AND delivery_status = 'pending'`
      )
      .run().changes
  )
}
