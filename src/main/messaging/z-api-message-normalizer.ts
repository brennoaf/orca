export type ZApiMessageDirection = 'inbound' | 'outbound'

export type NormalizedZApiMessage = {
  provider: 'z-api'
  instanceId: string
  messageId: string
  conversationAddress: string
  senderAddress: string | null
  conversationName: string | null
  senderName: string | null
  direction: ZApiMessageDirection
  occurredAt: number
  content: { kind: 'text'; text: string } | { kind: 'unsupported'; providerType: string }
}

export type RoutedZApiCallback =
  | { kind: 'message'; instanceId: string; message: NormalizedZApiMessage }
  | {
      kind: 'acknowledge'
      instanceId: string
      callbackType:
        | 'ReceivedNotification'
        | 'DeliveryCallback'
        | 'MessageStatusCallback'
        | 'ConnectedCallback'
        | 'DisconnectedCallback'
        | 'PresenceChatCallback'
    }

export class ZApiCallbackError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ZApiCallbackError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ZApiCallbackError(`Z-API callback is missing ${field}.`)
  }
  return value.trim()
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function callbackTimestamp(record: Record<string, unknown>): number {
  const value = record.momment ?? record.timestamp
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ZApiCallbackError('Z-API callback is missing its timestamp.')
  }
  return value
}

function requiredBoolean(record: Record<string, unknown>, field: string): boolean {
  const value = record[field]
  if (typeof value !== 'boolean') {
    throw new ZApiCallbackError(`Z-API callback is missing ${field}.`)
  }
  return value
}

function requiredStringArray(record: Record<string, unknown>, field: string): string[] {
  const value = record[field]
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== 'string' || item.trim().length === 0)
  ) {
    throw new ZApiCallbackError(`Z-API callback is missing ${field}.`)
  }
  return value
}

function conversationAddress(record: Record<string, unknown>): string {
  const address = optionalString(record.chatLid) ?? optionalString(record.phone)
  if (!address) {
    throw new ZApiCallbackError('Z-API callback is missing its conversation address.')
  }
  return address
}

function providerContentType(record: Record<string, unknown>): string {
  const fields = [
    'image',
    'audio',
    'video',
    'document',
    'sticker',
    'contact',
    'contacts',
    'location',
    'reaction',
    'poll',
    'pollVote',
    'buttonsMessage',
    'buttonsResponseMessage',
    'listResponseMessage',
    'carouselMessage',
    'hydratedTemplate',
    'event',
    'eventResponse',
    'newsletterAdminInvite',
    'order',
    'paymentInfo',
    'pinMessage',
    'pixKeyMessage',
    'product',
    'requestPayment',
    'reviewAndPay',
    'reviewOrder',
    'sendPayment',
    'statusAudio',
    'statusImage',
    'statusVideo',
    'buttonsResponse',
    'listResponse'
  ] as const
  return fields.find((field) => record[field] !== undefined) ?? 'unknown'
}

export function normalizeZApiCallback(payload: unknown): NormalizedZApiMessage {
  if (!isRecord(payload) || payload.type !== 'ReceivedCallback') {
    throw new ZApiCallbackError('Unsupported Z-API callback type.')
  }
  if (typeof payload.fromMe !== 'boolean') {
    throw new ZApiCallbackError('Z-API callback is missing fromMe.')
  }
  const text = isRecord(payload.text) ? payload.text.message : undefined
  return {
    provider: 'z-api',
    instanceId: requiredString(payload, 'instanceId'),
    messageId: requiredString(payload, 'messageId'),
    conversationAddress: conversationAddress(payload),
    senderAddress:
      optionalString(payload.participantLid) ??
      optionalString(payload.senderLid) ??
      optionalString(payload.participantPhone),
    conversationName: optionalString(payload.chatName),
    senderName: optionalString(payload.senderName),
    direction: payload.fromMe ? 'outbound' : 'inbound',
    occurredAt: callbackTimestamp(payload),
    content:
      typeof text === 'string'
        ? { kind: 'text', text }
        : { kind: 'unsupported', providerType: providerContentType(payload) }
  }
}

function validateNotification(
  record: Record<string, unknown>,
  instanceId: string
): RoutedZApiCallback {
  requiredString(record, 'notification')
  requiredBoolean(record, 'fromMe')
  callbackTimestamp(record)
  conversationAddress(record)
  return { kind: 'acknowledge', instanceId, callbackType: 'ReceivedNotification' }
}

function validateDelivery(record: Record<string, unknown>, instanceId: string): RoutedZApiCallback {
  requiredString(record, 'messageId')
  requiredString(record, 'phone')
  callbackTimestamp(record)
  return { kind: 'acknowledge', instanceId, callbackType: 'DeliveryCallback' }
}

function validateMessageStatus(
  record: Record<string, unknown>,
  instanceId: string
): RoutedZApiCallback {
  const statuses = ['SENT', 'RECEIVED', 'READ', 'READ_BY_ME', 'PLAYED']
  if (!statuses.includes(requiredString(record, 'status'))) {
    throw new ZApiCallbackError('Z-API callback has an invalid message status.')
  }
  requiredStringArray(record, 'ids')
  requiredString(record, 'phone')
  callbackTimestamp(record)
  return { kind: 'acknowledge', instanceId, callbackType: 'MessageStatusCallback' }
}

function validateConnected(
  record: Record<string, unknown>,
  instanceId: string
): RoutedZApiCallback {
  requiredBoolean(record, 'connected')
  requiredString(record, 'phone')
  callbackTimestamp(record)
  return { kind: 'acknowledge', instanceId, callbackType: 'ConnectedCallback' }
}

function validateDisconnected(
  record: Record<string, unknown>,
  instanceId: string
): RoutedZApiCallback {
  requiredBoolean(record, 'disconnected')
  requiredString(record, 'error')
  callbackTimestamp(record)
  return { kind: 'acknowledge', instanceId, callbackType: 'DisconnectedCallback' }
}

function validatePresence(record: Record<string, unknown>, instanceId: string): RoutedZApiCallback {
  const statuses = ['AVAILABLE', 'UNAVAILABLE', 'COMPOSING', 'PAUSED', 'RECORDING']
  if (!statuses.includes(requiredString(record, 'status'))) {
    throw new ZApiCallbackError('Z-API callback has an invalid presence status.')
  }
  requiredString(record, 'phone')
  const lastSeen = record.lastSeen
  if (lastSeen !== null && (typeof lastSeen !== 'number' || !Number.isSafeInteger(lastSeen))) {
    throw new ZApiCallbackError('Z-API callback has an invalid lastSeen.')
  }
  return { kind: 'acknowledge', instanceId, callbackType: 'PresenceChatCallback' }
}

export function routeZApiCallback(payload: unknown): RoutedZApiCallback {
  if (!isRecord(payload)) {
    throw new ZApiCallbackError('Z-API callback is malformed.')
  }
  const instanceId = requiredString(payload, 'instanceId')
  const type = requiredString(payload, 'type')
  if (type === 'ReceivedCallback') {
    if (payload.notification !== undefined) {
      return validateNotification(payload, instanceId)
    }
    const message = normalizeZApiCallback(payload)
    return { kind: 'message', instanceId, message }
  }
  if (type === 'DeliveryCallback') {
    return validateDelivery(payload, instanceId)
  }
  if (type === 'MessageStatusCallback') {
    return validateMessageStatus(payload, instanceId)
  }
  if (type === 'ConnectedCallback') {
    return validateConnected(payload, instanceId)
  }
  if (type === 'DisconnectedCallback') {
    return validateDisconnected(payload, instanceId)
  }
  if (type === 'PresenceChatCallback') {
    return validatePresence(payload, instanceId)
  }
  throw new ZApiCallbackError('Unsupported Z-API callback type.')
}
