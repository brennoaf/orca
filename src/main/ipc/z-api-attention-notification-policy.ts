import type { ZApiInboundAttentionEvent } from '../messaging/z-api-attention-events'

export type ZApiAttentionNotificationResult =
  | { delivered: true }
  | { delivered: false; reason: 'disabled' | 'visible' | 'cooldown' | 'unsupported' }

export function dispatchZApiAttentionNotification(
  event: ZApiInboundAttentionEvent,
  dependencies: {
    enabled: () => boolean
    visible: () => boolean
    reserve: (conversationId: number) => boolean
    supported: () => boolean
    attention: () => void
    deliver: () => void
  }
): ZApiAttentionNotificationResult {
  if (!dependencies.enabled()) {
    return { delivered: false, reason: 'disabled' }
  }
  if (dependencies.visible()) {
    return { delivered: false, reason: 'visible' }
  }
  dependencies.attention()
  if (!dependencies.reserve(event.conversationId)) {
    return { delivered: false, reason: 'cooldown' }
  }
  if (!dependencies.supported()) {
    return { delivered: false, reason: 'unsupported' }
  }
  dependencies.deliver()
  return { delivered: true }
}
