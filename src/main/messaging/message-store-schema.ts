import { chmodSync, existsSync } from 'node:fs'
import type { ZApiConversationKind } from '../../shared/communication-integrations'
import type SyncDatabase from '../sqlite/sync-database'
import { migrateMessageStoreV4 } from './message-store-migrate-v4'

const SCHEMA_VERSION = 5

export const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1_000
export const DEFAULT_MAX_MESSAGES_PER_CONVERSATION = 200
export const DEFAULT_MAX_CONVERSATIONS = 50

export type MessagingConversation = {
  id: number
  provider: 'z-api'
  instanceId: string
  address: string
  conversationKind: ZApiConversationKind
  displayName: string | null
  lastMessageAt: number
}

export type MessagingMessage = {
  id: number
  conversationId: number
  providerMessageId: string | null
  clientMessageId: string | null
  senderAddress: string | null
  senderName: string | null
  direction: 'inbound' | 'outbound'
  contentKind: 'text' | 'unsupported'
  text: string | null
  providerContentType: string | null
  occurredAt: number
  deliveryStatus: 'received' | 'pending' | 'sent' | 'unknown' | 'failed'
}

export type MessagingReplyDestination = {
  provider: 'z-api'
  instanceId: string
  conversationAddress: string
  conversationKind: ZApiConversationKind
}

export type MessagingGcResult = {
  messagesDeleted: number
  conversationsDeleted: number
}

export type MessageStoreOptions = {
  ttlMs?: number
  maxMessagesPerConversation?: number
  maxConversations?: number
}

export type ConversationRow = {
  id: number
  provider: string
  instance_id: string
  address: string
  conversation_kind: string
  display_name: string | null
  last_message_at: number
}

export type MessageRow = {
  id: number
  conversation_id: number
  provider_message_id: string | null
  client_message_id: string | null
  sender_address: string | null
  sender_name: string | null
  direction: string
  content_kind: string
  body: string | null
  provider_content_type: string | null
  occurred_at: number
  delivery_status: string
}

export function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Messaging limit must be a positive integer.')
  }
  return value
}

export function numberField(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`Invalid messaging database ${field}.`)
  }
  return value
}

export function stringField(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid messaging database ${field}.`)
  }
  return value
}

function nullableStringField(value: unknown, field: string): string | null {
  if (value === null) {
    return null
  }
  return stringField(value, field)
}

export function parseMessagingConversationKind(value: unknown): ZApiConversationKind {
  const kind = stringField(value, 'conversation kind')
  if (!['group', 'private', 'newsletter', 'broadcast', 'unknown'].includes(kind)) {
    throw new Error('Invalid messaging database conversation kind.')
  }
  return kind as ZApiConversationKind
}

export function parseConversation(row: ConversationRow): MessagingConversation {
  const provider = stringField(row.provider, 'provider')
  if (provider !== 'z-api') {
    throw new Error('Invalid messaging database provider.')
  }
  return {
    id: numberField(row.id, 'conversation id'),
    provider,
    instanceId: stringField(row.instance_id, 'instance id'),
    address: stringField(row.address, 'conversation address'),
    conversationKind: parseMessagingConversationKind(row.conversation_kind),
    displayName: nullableStringField(row.display_name, 'display name'),
    lastMessageAt: numberField(row.last_message_at, 'last message timestamp')
  }
}

export function parseMessage(row: MessageRow): MessagingMessage {
  const direction = stringField(row.direction, 'direction')
  const contentKind = stringField(row.content_kind, 'content kind')
  const deliveryStatus = stringField(row.delivery_status, 'delivery status')
  if (direction !== 'inbound' && direction !== 'outbound') {
    throw new Error('Invalid messaging database direction.')
  }
  if (contentKind !== 'text' && contentKind !== 'unsupported') {
    throw new Error('Invalid messaging database content kind.')
  }
  if (!['received', 'pending', 'sent', 'unknown', 'failed'].includes(deliveryStatus)) {
    throw new Error('Invalid messaging database delivery status.')
  }
  return {
    id: numberField(row.id, 'message id'),
    conversationId: numberField(row.conversation_id, 'conversation id'),
    providerMessageId: nullableStringField(row.provider_message_id, 'provider message id'),
    clientMessageId: nullableStringField(row.client_message_id, 'client message id'),
    senderAddress: nullableStringField(row.sender_address, 'sender address'),
    senderName: nullableStringField(row.sender_name, 'sender name'),
    direction,
    contentKind,
    text: nullableStringField(row.body, 'message body'),
    providerContentType: nullableStringField(row.provider_content_type, 'provider content type'),
    occurredAt: numberField(row.occurred_at, 'message timestamp'),
    deliveryStatus: deliveryStatus as MessagingMessage['deliveryStatus']
  }
}

export function initializeMessageStoreDatabase(
  db: SyncDatabase,
  dbPath: string | ':memory:'
): void {
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('busy_timeout = 5000')
  db.pragma('foreign_keys = ON')
  const version = db.pragma('user_version', { simple: true })
  if (typeof version !== 'number' || version < 0 || version > SCHEMA_VERSION) {
    throw new Error('Unsupported messaging database schema version.')
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL CHECK(provider IN ('z-api')),
      instance_id TEXT NOT NULL,
      address TEXT NOT NULL,
      conversation_kind TEXT NOT NULL DEFAULT 'unknown' CHECK(conversation_kind IN ('group', 'private', 'newsletter', 'broadcast', 'unknown')),
      display_name TEXT,
      last_message_at INTEGER NOT NULL,
      UNIQUE(provider, instance_id, address)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK(provider IN ('z-api')),
      instance_id TEXT NOT NULL,
      provider_message_id TEXT,
      client_message_id TEXT,
      sender_address TEXT,
      sender_name TEXT,
      direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
      content_kind TEXT NOT NULL CHECK(content_kind IN ('text', 'unsupported')),
      body TEXT,
      provider_content_type TEXT,
      occurred_at INTEGER NOT NULL,
      delivery_status TEXT NOT NULL CHECK(delivery_status IN ('received', 'pending', 'sent', 'unknown', 'failed')),
      UNIQUE(provider, instance_id, provider_message_id),
      UNIQUE(provider, instance_id, client_message_id)
    );
    CREATE INDEX IF NOT EXISTS idx_messaging_conversations_recent
      ON conversations(last_message_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_messaging_messages_recent
      ON messages(conversation_id, occurred_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_messaging_messages_ttl ON messages(occurred_at);
    CREATE INDEX IF NOT EXISTS idx_messaging_messages_instance_commit
      ON messages(provider, instance_id, id DESC);
    CREATE TABLE IF NOT EXISTS z_api_listening_validation_attempts (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id TEXT NOT NULL UNIQUE,
      configuration_id TEXT NOT NULL,
      instance_id TEXT NOT NULL,
      code_hash TEXT,
      baseline_message_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      deadline_at INTEGER NOT NULL,
      monotonic_created_at REAL NOT NULL,
      monotonic_deadline_at REAL NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('awaiting', 'confirmed', 'expired', 'cancelled')),
      confirmed_at INTEGER
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_z_api_listening_validation_active
      ON z_api_listening_validation_attempts(configuration_id) WHERE state = 'awaiting';
    CREATE INDEX IF NOT EXISTS idx_z_api_listening_validation_recent
      ON z_api_listening_validation_attempts(configuration_id, sequence DESC);
  `)
  if (version === 1) {
    db.exec(`
      BEGIN IMMEDIATE;
      DROP INDEX idx_messaging_messages_recent;
      DROP INDEX idx_messaging_messages_ttl;
      ALTER TABLE messages RENAME TO messages_v1;
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        provider TEXT NOT NULL CHECK(provider IN ('z-api')),
        instance_id TEXT NOT NULL,
        provider_message_id TEXT,
        client_message_id TEXT,
        sender_address TEXT,
        sender_name TEXT,
        direction TEXT NOT NULL CHECK(direction IN ('inbound', 'outbound')),
        content_kind TEXT NOT NULL CHECK(content_kind IN ('text', 'unsupported')),
        body TEXT,
        provider_content_type TEXT,
        occurred_at INTEGER NOT NULL,
        delivery_status TEXT NOT NULL CHECK(delivery_status IN ('received', 'pending', 'sent', 'unknown', 'failed')),
        UNIQUE(provider, instance_id, provider_message_id),
        UNIQUE(provider, instance_id, client_message_id)
      );
      INSERT INTO messages(
        id, conversation_id, provider, instance_id, provider_message_id, client_message_id,
        sender_address, sender_name, direction, content_kind, body, provider_content_type,
        occurred_at, delivery_status
      ) SELECT
        id, conversation_id, provider, instance_id, provider_message_id, client_message_id,
        sender_address, sender_name, direction, content_kind, body, provider_content_type,
        occurred_at, delivery_status
      FROM messages_v1;
      DROP TABLE messages_v1;
      CREATE INDEX idx_messaging_messages_recent
        ON messages(conversation_id, occurred_at DESC, id DESC);
      CREATE INDEX idx_messaging_messages_ttl ON messages(occurred_at);
      CREATE INDEX idx_messaging_messages_instance_commit
        ON messages(provider, instance_id, id DESC);
      COMMIT;
    `)
  }
  if (version > 0 && version < 4) {
    db.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE conversations ADD COLUMN conversation_kind TEXT NOT NULL DEFAULT 'unknown'
        CHECK(conversation_kind IN ('group', 'private', 'newsletter', 'broadcast', 'unknown'));
      PRAGMA user_version = 5;
      COMMIT;
    `)
  }
  if (version === 4) {
    migrateMessageStoreV4(db)
  }
  if (version < SCHEMA_VERSION) {
    db.pragma(`user_version = ${SCHEMA_VERSION}`)
  }
  if (dbPath === ':memory:' || process.platform === 'win32') {
    return
  }
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (existsSync(path)) {
      chmodSync(path, 0o600)
    }
  }
}
