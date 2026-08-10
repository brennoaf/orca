import type SyncDatabase from '../sqlite/sync-database'
import {
  parseConversation,
  positiveInteger,
  type ConversationRow,
  type MessagingConversation
} from './message-store-schema'

export function listMessagingConversations(args: {
  db: SyncDatabase
  defaultLimit: number
  limit: number
  offset: number
  instanceId?: string
}): MessagingConversation[] {
  const query = args.instanceId
    ? `SELECT id, provider, instance_id, address, conversation_kind, display_name, last_message_at FROM conversations WHERE provider = 'z-api' AND instance_id = ? ORDER BY last_message_at DESC, id DESC LIMIT ? OFFSET ?`
    : `SELECT id, provider, instance_id, address, conversation_kind, display_name, last_message_at FROM conversations ORDER BY last_message_at DESC, id DESC LIMIT ? OFFSET ?`
  const pagination = [
    positiveInteger(args.limit, args.defaultLimit),
    positiveInteger(args.offset + 1, 1) - 1
  ] as const
  const rows = args.db
    .prepare(query)
    .all(...(args.instanceId ? [args.instanceId, ...pagination] : pagination)) as ConversationRow[]
  return rows.map(parseConversation)
}
