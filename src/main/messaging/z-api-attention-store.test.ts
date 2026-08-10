import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageStore } from './message-store'
import SyncDatabase from '../sqlite/sync-database'
import { onZApiInboundAttention } from './z-api-attention-events'
import type { NormalizedZApiMessage } from './z-api-message-normalizer'

const roots: string[] = []

function message(messageId: string, direction: 'inbound' | 'outbound'): NormalizedZApiMessage {
  return {
    provider: 'z-api',
    instanceId: 'instance-1',
    messageId,
    conversationAddress: 'opaque-address',
    conversationKind: 'private',
    senderAddress: null,
    conversationName: null,
    senderName: null,
    direction,
    occurredAt: Date.now(),
    content: { kind: 'text', text: 'message' }
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe('Z-API attention store', () => {
  it('creates an attention foreign key that cascades conversations', () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-z-api-attention-'))
    roots.push(root)
    const path = join(root, 'messages.db')
    const store = new MessageStore(path)
    const inspection = new SyncDatabase(path)
    const foreignKeys = inspection
      .prepare("PRAGMA foreign_key_list('conversation_attention')")
      .all() as { table: unknown; from: unknown; on_delete: unknown }[]
    expect(foreignKeys).toEqual([
      expect.objectContaining({
        table: 'conversations',
        from: 'conversation_id',
        on_delete: 'CASCADE'
      })
    ])
    inspection.close()
    store.close()
  })

  it('counts only newly inserted inbound messages and emits once', () => {
    const store = new MessageStore(':memory:')
    const listener = vi.fn()
    const off = onZApiInboundAttention(listener)
    const first = store.ingest(message('inbound-1', 'inbound'))
    store.ingest(message('inbound-1', 'inbound'))
    store.ingest(message('outbound-1', 'outbound'))
    expect(store.getAttentionSnapshot()).toEqual({
      provider: 'z-api',
      totalUnread: 1,
      conversations: [{ conversationId: first.conversationId, unreadCount: 1 }]
    })
    expect(listener).toHaveBeenCalledTimes(1)
    off()
    store.close()
  })

  it('marks one conversation seen idempotently', () => {
    const store = new MessageStore(':memory:')
    const first = store.ingest(message('inbound-1', 'inbound'))
    store.ingest(message('inbound-2', 'inbound'))
    expect(store.markConversationSeen(first.conversationId).totalUnread).toBe(0)
    expect(store.markConversationSeen(first.conversationId).totalUnread).toBe(0)
    store.ingest(message('inbound-3', 'inbound'))
    expect(store.getAttentionSnapshot().totalUnread).toBe(1)
    store.close()
  })

  it('persists seen and notification cursors across restart', () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-z-api-attention-'))
    roots.push(root)
    const path = join(root, 'messages.db')
    const first = new MessageStore(path)
    const inserted = first.ingest(message('inbound-1', 'inbound'))
    expect(first.claimInboundNotification(inserted.conversationId, inserted.messageId)).toBe(false)
    first.markConversationSeen(inserted.conversationId)
    first.close()
    const reopened = new MessageStore(path)
    expect(reopened.getAttentionSnapshot().totalUnread).toBe(0)
    expect(reopened.claimInboundNotification(inserted.conversationId, inserted.messageId)).toBe(
      false
    )
    reopened.close()
  })

  it('removes attention with expired conversation retention', async () => {
    const store = new MessageStore(':memory:', { ttlMs: 1 })
    store.ingest({ ...message('inbound-1', 'inbound'), occurredAt: 1 })
    await store.collectGarbage(3)
    expect(store.getAttentionSnapshot().totalUnread).toBe(0)
    store.close()
  })
})
