import type SyncDatabase from '../sqlite/sync-database'

export function migrateMessageStoreV4(db: SyncDatabase): void {
  db.exec(`
    BEGIN IMMEDIATE;
    DROP INDEX IF EXISTS idx_messaging_conversations_recent;
    DROP INDEX IF EXISTS idx_messaging_messages_recent;
    DROP INDEX IF EXISTS idx_messaging_messages_ttl;
    DROP INDEX IF EXISTS idx_messaging_messages_instance_commit;
    ALTER TABLE messages RENAME TO messages_v4;
    ALTER TABLE conversations RENAME TO conversations_v4;
    CREATE TABLE conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL CHECK(provider IN ('z-api')),
      instance_id TEXT NOT NULL,
      address TEXT NOT NULL,
      conversation_kind TEXT NOT NULL DEFAULT 'unknown' CHECK(conversation_kind IN ('group', 'private', 'newsletter', 'broadcast', 'unknown')),
      display_name TEXT,
      last_message_at INTEGER NOT NULL,
      UNIQUE(provider, instance_id, address)
    );
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
    INSERT INTO conversations(
      id, provider, instance_id, address, conversation_kind, display_name, last_message_at
    ) SELECT
      id, provider, instance_id, address, conversation_kind, display_name, last_message_at
    FROM conversations_v4;
    INSERT INTO messages(
      id, conversation_id, provider, instance_id, provider_message_id, client_message_id,
      sender_address, sender_name, direction, content_kind, body, provider_content_type,
      occurred_at, delivery_status
    ) SELECT
      id, conversation_id, provider, instance_id, provider_message_id, client_message_id,
      sender_address, sender_name, direction, content_kind, body, provider_content_type,
      occurred_at, delivery_status
    FROM messages_v4;
    DROP TABLE messages_v4;
    DROP TABLE conversations_v4;
    CREATE INDEX idx_messaging_conversations_recent
      ON conversations(last_message_at DESC, id DESC);
    CREATE INDEX idx_messaging_messages_recent
      ON messages(conversation_id, occurred_at DESC, id DESC);
    CREATE INDEX idx_messaging_messages_ttl ON messages(occurred_at);
    CREATE INDEX idx_messaging_messages_instance_commit
      ON messages(provider, instance_id, id DESC);
    PRAGMA user_version = 5;
    COMMIT;
  `)
}
