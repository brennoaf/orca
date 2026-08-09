import type SyncDatabase from '../sqlite/sync-database'
import { numberField } from './message-store-schema'

export function upsertMessagingConversation(
  db: SyncDatabase,
  args: {
    provider: 'z-api'
    instanceId: string
    address: string
    displayName: string | null
    occurredAt: number
  }
): number {
  db.prepare(
    `INSERT INTO conversations(provider, instance_id, address, display_name, last_message_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(provider, instance_id, address) DO UPDATE SET
       display_name = COALESCE(excluded.display_name, conversations.display_name),
       last_message_at = MAX(conversations.last_message_at, excluded.last_message_at)`
  ).run(args.provider, args.instanceId, args.address, args.displayName, args.occurredAt)
  const row = db
    .prepare('SELECT id FROM conversations WHERE provider = ? AND instance_id = ? AND address = ?')
    .get(args.provider, args.instanceId, args.address) as { id?: unknown } | undefined
  if (!row) {
    throw new Error('Messaging conversation was not persisted.')
  }
  return numberField(row.id, 'conversation id')
}
