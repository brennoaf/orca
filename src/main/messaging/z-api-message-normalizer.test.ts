import { describe, expect, it } from 'vitest'
import { normalizeZApiCallback, routeZApiCallback } from './z-api-message-normalizer'

function callback(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'ReceivedCallback',
    instanceId: 'instance-1',
    messageId: 'message-1',
    momment: 1_786_250_000_000,
    phone: '5511999999999',
    isGroup: false,
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
      conversationKind: 'private',
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
          chatLid: '81896604192873@lid',
          senderLid: '71984429802533@lid',
          participantPhone: '5511888888888',
          fromMe: true,
          timestamp: 1_786_250_000_001,
          momment: undefined
        })
      )
    ).toMatchObject({
      conversationAddress: '81896604192873@lid',
      conversationKind: 'private',
      senderAddress: '71984429802533@lid',
      direction: 'outbound',
      occurredAt: 1_786_250_000_001
    })
  })

  it('uses the canonical group phone when chat and participant LIDs are present', () => {
    expect(
      normalizeZApiCallback(
        callback({
          isGroup: true,
          phone: '120363019502650977-group',
          chatLid: 'group-chat@lid',
          participantLid: 'participant@lid',
          senderLid: 'sender@lid'
        })
      )
    ).toMatchObject({
      conversationAddress: '120363019502650977-group',
      conversationKind: 'group',
      senderAddress: 'participant@lid'
    })
  })

  it('uses a canonical group phone without a chat LID', () => {
    expect(
      normalizeZApiCallback(
        callback({ isGroup: true, phone: '120363019502650977-group', chatLid: undefined })
      )
    ).toMatchObject({
      conversationAddress: '120363019502650977-group',
      conversationKind: 'group'
    })
  })

  it('preserves a legacy group phone as its canonical destination', () => {
    expect(
      normalizeZApiCallback(
        callback({ isGroup: true, phone: '5511999999999-1632228638', chatLid: undefined })
      )
    ).toMatchObject({
      conversationAddress: '5511999999999-1632228638',
      conversationKind: 'group'
    })
  })

  it('rejects a group without a valid phone instead of falling back to chatLid', () => {
    expect(() =>
      normalizeZApiCallback(
        callback({ isGroup: true, phone: undefined, chatLid: 'group-chat@lid' })
      )
    ).toThrowError('Z-API group callback has an invalid phone.')
    expect(() =>
      normalizeZApiCallback(callback({ isGroup: true, phone: 'group-chat@lid' }))
    ).toThrowError('Z-API group callback has an invalid phone.')
  })

  it('keeps an unknown kind for legacy callbacks without isGroup', () => {
    expect(normalizeZApiCallback(callback({ isGroup: undefined }))).toMatchObject({
      conversationAddress: '5511999999999',
      conversationKind: 'unknown'
    })
  })

  it('classifies a newsletter from the official flag and preserves its available address', () => {
    expect(
      normalizeZApiCallback(
        callback({
          isNewsletter: true,
          chatLid: '81896604192873@lid'
        })
      )
    ).toMatchObject({
      conversationAddress: '81896604192873@lid',
      conversationKind: 'newsletter'
    })
  })

  it.each([
    { isNewsletter: true, chatLid: '120363418284553@newsletter' },
    { broadcast: true, chatLid: 'status@broadcast' }
  ])('keeps the group signal authoritative over contradictory payload signals', (signals) => {
    expect(
      normalizeZApiCallback(
        callback({
          ...signals,
          isGroup: true,
          phone: '120363019502650977-group'
        })
      )
    ).toMatchObject({
      conversationAddress: '120363019502650977-group',
      conversationKind: 'group'
    })
  })

  it.each([
    {
      fields: { isNewsletter: false, phone: '120363418284553@newsletter' },
      conversationKind: 'newsletter'
    },
    {
      fields: { broadcast: true, phone: '1774895799-broadcast' },
      conversationKind: 'broadcast'
    }
  ] as const)(
    'preserves chatLid identity while classifying $conversationKind payloads',
    ({ fields, conversationKind }) => {
      expect(
        normalizeZApiCallback(callback({ ...fields, chatLid: '81896604192873@lid' }))
      ).toMatchObject({
        conversationAddress: '81896604192873@lid',
        conversationKind
      })
    }
  )

  it.each(['1774895799-broadcast', 'status@broadcast'])(
    'classifies the broadcast destination %s without relying on its flag',
    (phone) => {
      expect(normalizeZApiCallback(callback({ broadcast: false, phone }))).toMatchObject({
        conversationAddress: phone,
        conversationKind: 'broadcast'
      })
    }
  )

  it('keeps an ambiguous non-group address instead of inventing a private chat', () => {
    expect(
      normalizeZApiCallback(
        callback({ isGroup: false, phone: undefined, chatLid: 'ambiguous-address' })
      )
    ).toMatchObject({
      conversationAddress: 'ambiguous-address',
      conversationKind: 'unknown'
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
    callback({ isGroup: 'false' }),
    callback({ isNewsletter: 'false' }),
    callback({ broadcast: 'false' }),
    callback({ fromMe: 'false' }),
    callback({ type: 'DeliveryCallback' })
  ])('rejects callbacks missing required identity fields', (payload) => {
    expect(() => normalizeZApiCallback(payload)).toThrow()
  })
})
