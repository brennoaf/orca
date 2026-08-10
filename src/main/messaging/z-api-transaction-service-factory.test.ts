import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => 'unused') },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn(),
    decryptString: vi.fn()
  }
}))

import { MessageStore } from './message-store'
import { createZApiTransactionService } from './z-api-transaction-service-factory'

const stores: MessageStore[] = []

afterEach(() => {
  for (const store of stores.splice(0)) {
    store.close()
  }
})

describe('createZApiTransactionService', () => {
  it('recovers inherited outbound pending rows before returning the service', () => {
    const store = new MessageStore(':memory:')
    stores.push(store)
    store.registerOutboundPending({
      instanceId: 'instance-1',
      conversationAddress: 'chat-1',
      conversationKind: 'unknown',
      clientMessageId: 'inherited-pending',
      text: 'mensagem',
      occurredAt: 10
    })
    const recovery = vi.spyOn(store, 'recoverPendingOutbound')
    const service = createZApiTransactionService({
      messageStore: store,
      onReceiverError: vi.fn()
    })
    expect(service.getStatus().sendReady).toBe(false)
    expect(recovery).toHaveBeenCalledTimes(1)
    expect(store.listRecentMessages(store.listConversations()[0]!.id)[0]).toMatchObject({
      deliveryStatus: 'unknown'
    })
  })
})
