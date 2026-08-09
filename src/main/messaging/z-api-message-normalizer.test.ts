import { describe, expect, it } from 'vitest'
import { normalizeZApiCallback, routeZApiCallback } from './z-api-message-normalizer'

function callback(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'ReceivedCallback',
    instanceId: 'instance-1',
    messageId: 'message-1',
    momment: 1_786_250_000_000,
    phone: '5511999999999',
    fromMe: false,
    text: { message: 'oi' },
    ...overrides
  }
}

describe('normalizeZApiCallback', () => {
  it('normalizes a received text callback without retaining extra fields', () => {
    expect(normalizeZApiCallback(callback({ ignoredSecret: 'raw-value' }))).toEqual({
      provider: 'z-api',
      instanceId: 'instance-1',
      messageId: 'message-1',
      conversationAddress: '5511999999999',
      senderAddress: null,
      conversationName: null,
      senderName: null,
      direction: 'inbound',
      occurredAt: 1_786_250_000_000,
      content: { kind: 'text', text: 'oi' }
    })
  })

  it('prefers modern chat and sender LIDs and preserves fromMe', () => {
    expect(
      normalizeZApiCallback(
        callback({
          chatLid: 'chat-lid',
          senderLid: 'sender-lid',
          participantPhone: '5511888888888',
          fromMe: true,
          timestamp: 1_786_250_000_001,
          momment: undefined
        })
      )
    ).toMatchObject({
      conversationAddress: 'chat-lid',
      senderAddress: 'sender-lid',
      direction: 'outbound',
      occurredAt: 1_786_250_000_001
    })
  })

  it('uses participantPhone when senderLid is absent', () => {
    expect(
      normalizeZApiCallback(callback({ participantPhone: '5511777777777' })).senderAddress
    ).toBe('5511777777777')
  })

  it('prefers participantLid for a group sender', () => {
    expect(
      normalizeZApiCallback(
        callback({ participantLid: 'participant-lid', senderLid: 'sender-lid' })
      ).senderAddress
    ).toBe('participant-lid')
  })

  it('classifies media without inventing text', () => {
    expect(
      normalizeZApiCallback(callback({ text: undefined, image: { imageUrl: 'private' } }))
    ).toMatchObject({ content: { kind: 'unsupported', providerType: 'image' } })
  })

  it.each(['buttonsResponseMessage', 'listResponseMessage', 'pollVote'])(
    'classifies the official %s content field explicitly',
    (providerType) => {
      expect(
        normalizeZApiCallback(callback({ text: undefined, [providerType]: { value: 'private' } }))
      ).toMatchObject({ content: { kind: 'unsupported', providerType } })
    }
  )

  it.each([
    {
      type: 'DeliveryCallback',
      instanceId: 'instance-1',
      messageId: 'message-1',
      phone: '5511999999999',
      momment: 1
    },
    {
      type: 'MessageStatusCallback',
      instanceId: 'instance-1',
      status: 'READ',
      ids: ['message-1'],
      phone: '5511999999999',
      momment: 1
    },
    {
      type: 'ConnectedCallback',
      instanceId: 'instance-1',
      connected: true,
      phone: '5511999999999',
      momment: 1
    },
    {
      type: 'DisconnectedCallback',
      instanceId: 'instance-1',
      disconnected: true,
      error: 'disconnected',
      momment: 1
    },
    {
      type: 'PresenceChatCallback',
      instanceId: 'instance-1',
      status: 'COMPOSING',
      phone: '5511999999999',
      lastSeen: null
    }
  ])('validates and explicitly acknowledges a known non-message callback', (payload) => {
    expect(routeZApiCallback(payload)).toMatchObject({
      kind: 'acknowledge',
      instanceId: 'instance-1',
      callbackType: payload.type
    })
  })

  it('acknowledges a valid ReceivedCallback notification without messageId', () => {
    expect(
      routeZApiCallback({
        type: 'ReceivedCallback',
        instanceId: 'instance-1',
        notification: 'PROFILE_NAME_UPDATED',
        phone: '5511999999999',
        fromMe: true,
        momment: 1
      })
    ).toEqual({
      kind: 'acknowledge',
      instanceId: 'instance-1',
      callbackType: 'ReceivedNotification'
    })
  })

  it.each([
    { type: 'UnknownCallback', instanceId: 'instance-1' },
    { type: 'DeliveryCallback', instanceId: 'instance-1' },
    { type: 'PresenceChatCallback', instanceId: 'instance-1', status: 'UNKNOWN', phone: '1' },
    { type: 'ReceivedCallback', instanceId: 'instance-1', notification: '' }
  ])('rejects an unknown or malformed routed callback', (payload) => {
    expect(() => routeZApiCallback(payload)).toThrow()
  })

  it.each([
    callback({ instanceId: '' }),
    callback({ messageId: null }),
    callback({ momment: undefined }),
    callback({ phone: undefined }),
    callback({ fromMe: 'false' }),
    callback({ type: 'DeliveryCallback' })
  ])('rejects callbacks missing required identity fields', (payload) => {
    expect(() => normalizeZApiCallback(payload)).toThrow()
  })
})
