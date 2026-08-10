import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import SyncDatabase from '../sqlite/sync-database'
import { MessageStore } from './message-store'
import type { NormalizedZApiMessage } from './z-api-message-normalizer'

const stores: MessageStore[] = []
const directories: string[] = []

function store(options: ConstructorParameters<typeof MessageStore>[1] = {}): MessageStore {
  const value = new MessageStore(':memory:', options)
  stores.push(value)
  return value
}

function message(
  messageId: string,
  occurredAt: number,
  overrides: Partial<NormalizedZApiMessage> = {}
): NormalizedZApiMessage {
  return {
    provider: 'z-api',
    instanceId: 'instance-1',
    messageId,
    conversationAddress: 'chat-1',
    conversationKind: 'private',
    senderAddress: null,
    conversationName: 'Chat',
    senderName: null,
    direction: 'inbound',
    occurredAt,
    content: { kind: 'text', text: messageId },
    ...overrides
  }
}

afterEach(() => {
  for (const value of stores.splice(0)) {
    value.close()
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('MessageStore', () => {
  it('deduplicates provider callbacks and lists messages deterministically', () => {
    const value = store()
    expect(value.ingest(message('message-2', 20)).inserted).toBe(true)
    expect(
      value.ingest(message('message-1', 10, { senderAddress: 'sender-1', senderName: 'Pessoa' }))
        .inserted
    ).toBe(true)
    expect(value.ingest(message('message-1', 10)).inserted).toBe(false)
    const conversation = value.listConversations()[0]
    expect(conversation).toMatchObject({
      address: 'chat-1',
      conversationKind: 'private',
      lastMessageAt: 20
    })
    const recentMessages = value.listRecentMessages(conversation!.id)
    expect(recentMessages.map((item) => item.providerMessageId)).toEqual(['message-1', 'message-2'])
    expect(recentMessages[0]).toMatchObject({ senderAddress: 'sender-1', senderName: 'Pessoa' })
    expect(value.getReplyDestination(conversation!.id)).toEqual({
      provider: 'z-api',
      instanceId: 'instance-1',
      conversationAddress: 'chat-1',
      conversationKind: 'private'
    })
  })

  it('does not create or update a conversation for a divergent callback retry', () => {
    const value = store()
    value.ingest(message('same-provider-id', 10))
    expect(
      value.ingest(
        message('same-provider-id', 999, {
          conversationAddress: 'ghost-chat',
          conversationName: 'Ghost'
        })
      ).inserted
    ).toBe(false)
    expect(value.listConversations()).toEqual([
      expect.objectContaining({ address: 'chat-1', displayName: 'Chat', lastMessageAt: 10 })
    ])
  })

  it('records outbound pending, sent, unknown, and failed states idempotently', () => {
    const value = store()
    const first = value.registerOutboundPending({
      instanceId: 'instance-1',
      conversationAddress: 'chat-1',
      conversationKind: 'unknown',
      clientMessageId: 'client-1',
      text: 'resposta',
      occurredAt: 10
    })
    expect(
      value.registerOutboundPending({
        instanceId: 'instance-1',
        conversationAddress: 'chat-1',
        conversationKind: 'unknown',
        clientMessageId: 'client-1',
        text: 'resposta',
        occurredAt: 10
      })
    ).toBe(first)
    value.markOutboundUnknown('client-1', 'instance-1')
    expect(value.listRecentMessages(value.listConversations()[0]!.id)[0]!.deliveryStatus).toBe(
      'unknown'
    )
    value.markOutboundSent('client-1', 'instance-1', 'provider-1')
    expect(value.listRecentMessages(value.listConversations()[0]!.id)[0]).toMatchObject({
      providerMessageId: 'provider-1',
      deliveryStatus: 'sent'
    })
    value.registerOutboundPending({
      instanceId: 'instance-1',
      conversationAddress: 'chat-1',
      conversationKind: 'unknown',
      clientMessageId: 'client-failed',
      text: 'falhou',
      occurredAt: 11
    })
    value.markOutboundFailed('client-failed', 'instance-1')
    expect(
      value
        .listRecentMessages(value.listConversations()[0]!.id)
        .find((item) => item.clientMessageId === 'client-failed')
    ).toMatchObject({ deliveryStatus: 'failed' })
  })

  it('atomically reconciles a sent-by-me callback that arrives before send completion', () => {
    const value = store()
    value.registerOutboundPending({
      instanceId: 'instance-1',
      conversationAddress: 'chat-1',
      conversationKind: 'unknown',
      clientMessageId: 'client-race',
      text: 'texto local',
      occurredAt: 10
    })
    value.ingest(
      message('provider-race', 12, {
        direction: 'outbound',
        senderAddress: 'sender-lid',
        content: { kind: 'text', text: 'texto callback' }
      })
    )
    expect(value.listRecentMessages(value.listConversations()[0]!.id)).toHaveLength(2)
    value.markOutboundSent('client-race', 'instance-1', 'provider-race')
    expect(value.listRecentMessages(value.listConversations()[0]!.id)).toEqual([
      expect.objectContaining({
        clientMessageId: 'client-race',
        providerMessageId: 'provider-race',
        senderAddress: 'sender-lid',
        text: 'texto local',
        direction: 'outbound',
        deliveryStatus: 'sent'
      })
    ])
  })

  it('rejects a provider message ID already assigned to another local message', () => {
    const value = store()
    value.registerOutboundPending({
      instanceId: 'instance-1',
      conversationAddress: 'chat-1',
      conversationKind: 'unknown',
      clientMessageId: 'client-first',
      text: 'primeira',
      occurredAt: 10
    })
    value.registerOutboundPending({
      instanceId: 'instance-1',
      conversationAddress: 'chat-1',
      conversationKind: 'unknown',
      clientMessageId: 'client-second',
      text: 'segunda',
      occurredAt: 20
    })
    value.markOutboundSent('client-first', 'instance-1', 'provider-conflict')

    expect(() =>
      value.markOutboundSent('client-second', 'instance-1', 'provider-conflict')
    ).toThrow('Provider message ID belongs to another outbound message.')

    const messages = value.listRecentMessages(value.listConversations()[0]!.id)
    expect(messages).toHaveLength(2)
    expect(messages.find((item) => item.clientMessageId === 'client-first')).toMatchObject({
      providerMessageId: 'provider-conflict',
      deliveryStatus: 'sent',
      text: 'primeira'
    })
    expect(messages.find((item) => item.clientMessageId === 'client-second')).toMatchObject({
      providerMessageId: null,
      deliveryStatus: 'pending',
      text: 'segunda'
    })
  })

  it('applies TTL, message, and conversation caps in a single shared GC flight', async () => {
    const value = store({ ttlMs: 100, maxMessagesPerConversation: 2, maxConversations: 2 })
    value.ingest(message('expired', 1))
    value.ingest(message('one', 910))
    value.ingest(message('two', 920))
    value.ingest(message('three', 930))
    value.ingest(message('chat-2', 940, { conversationAddress: 'chat-2' }))
    value.ingest(message('chat-3', 950, { conversationAddress: 'chat-3' }))
    const first = value.collectGarbage(1_000)
    const second = value.collectGarbage(1_000)
    expect(second).toBe(first)
    await expect(first).resolves.toEqual({ messagesDeleted: 4, conversationsDeleted: 1 })
    expect(value.listConversations().map((item) => item.address)).toEqual(['chat-3', 'chat-2'])
  })

  it('reopens a durable database with the same messages', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-messaging-store-'))
    directories.push(directory)
    const path = join(directory, 'orca-messaging.db')
    const first = new MessageStore(path)
    first.ingest(message('persisted', 10))
    first.close()
    const second = new MessageStore(path)
    stores.push(second)
    expect(second.listRecentMessages(second.listConversations()[0]!.id)[0]).toMatchObject({
      providerMessageId: 'persisted',
      text: 'persisted'
    })
  })

  it('recovers only inherited pending outbound messages as unknown on restart', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-messaging-recovery-'))
    directories.push(directory)
    const path = join(directory, 'orca-messaging.db')
    const first = new MessageStore(path)
    first.registerOutboundPending({
      instanceId: 'instance-1',
      conversationAddress: 'chat-1',
      conversationKind: 'unknown',
      clientMessageId: 'inherited-pending',
      text: 'antes do restart',
      occurredAt: 10
    })
    first.close()
    const restarted = new MessageStore(path)
    stores.push(restarted)
    expect(restarted.recoverPendingOutbound()).toBe(1)
    restarted.registerOutboundPending({
      instanceId: 'instance-1',
      conversationAddress: 'chat-1',
      conversationKind: 'unknown',
      clientMessageId: 'current-pending',
      text: 'depois do restart',
      occurredAt: 20
    })
    expect(restarted.recoverPendingOutbound()).toBe(0)
    const messages = restarted.listRecentMessages(restarted.listConversations()[0]!.id)
    expect(messages.find((item) => item.clientMessageId === 'inherited-pending')).toMatchObject({
      deliveryStatus: 'unknown'
    })
    expect(messages.find((item) => item.clientMessageId === 'current-pending')).toMatchObject({
      deliveryStatus: 'pending'
    })
  })

  it.each([1, 2, 3, 4] as const)(
    'migrates a v%i database with an explicit unknown kind',
    (version) => {
      const directory = mkdtempSync(join(tmpdir(), `orca-messaging-store-v${version}-`))
      directories.push(directory)
      const path = join(directory, 'orca-messaging.db')
      const legacy = new SyncDatabase(path)
      legacy.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL CHECK(provider IN ('z-api')),
        instance_id TEXT NOT NULL,
        address TEXT NOT NULL,
        ${version === 4 ? "conversation_kind TEXT NOT NULL DEFAULT 'unknown' CHECK(conversation_kind IN ('group', 'private', 'unknown'))," : ''}
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
        delivery_status TEXT NOT NULL CHECK(delivery_status IN (${version === 1 ? "'received', 'pending', 'sent', 'unknown'" : "'received', 'pending', 'sent', 'unknown', 'failed'"})),
        UNIQUE(provider, instance_id, provider_message_id),
        UNIQUE(provider, instance_id, client_message_id)
      );
      CREATE INDEX idx_messaging_conversations_recent
        ON conversations(last_message_at DESC, id DESC);
      CREATE INDEX idx_messaging_messages_recent
        ON messages(conversation_id, occurred_at DESC, id DESC);
      CREATE INDEX idx_messaging_messages_ttl ON messages(occurred_at);
      INSERT INTO conversations(
        id, provider, instance_id, address, ${version === 4 ? 'conversation_kind,' : ''} display_name, last_message_at
      ) VALUES (1, 'z-api', 'instance-1', 'chat-1', ${version === 4 ? "'unknown'," : ''} 'Chat', 10);
      INSERT INTO messages(
        id, conversation_id, provider, instance_id, client_message_id, direction,
        content_kind, body, occurred_at, delivery_status
      ) VALUES (1, 1, 'z-api', 'instance-1', 'legacy-client', 'outbound', 'text', 'legacy', 10, 'pending');
      PRAGMA user_version = ${version};
    `)
      legacy.close()
      const migrated = new MessageStore(path)
      stores.push(migrated)
      expect(migrated.listConversations()[0]).toMatchObject({
        address: 'chat-1',
        conversationKind: 'unknown'
      })
      migrated.ingest(message('kind-update', 20, { conversationKind: 'newsletter' }))
      expect(migrated.listConversations()[0]).toMatchObject({
        address: 'chat-1',
        conversationKind: 'newsletter'
      })
      migrated.markOutboundFailed('legacy-client', 'instance-1')
      expect(
        migrated.listRecentMessages(1).find((item) => item.clientMessageId === 'legacy-client')
      ).toMatchObject({
        id: 1,
        clientMessageId: 'legacy-client',
        text: 'legacy',
        deliveryStatus: 'failed'
      })
    }
  )
})
