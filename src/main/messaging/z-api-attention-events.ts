export type ZApiInboundAttentionEvent = {
  conversationId: number
  messageId: number
}

type Listener = (event: ZApiInboundAttentionEvent) => void

const listeners = new Set<Listener>()

export function emitZApiInboundAttention(event: ZApiInboundAttentionEvent): void {
  for (const listener of listeners) {
    listener(event)
  }
}

export function onZApiInboundAttention(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
