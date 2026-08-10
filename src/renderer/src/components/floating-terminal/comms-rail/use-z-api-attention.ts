import { useCallback, useEffect, useState } from 'react'
import type { ZApiAttentionSnapshot } from '../../../../../shared/communication-integrations'

const EMPTY_ATTENTION: ZApiAttentionSnapshot = {
  provider: 'z-api',
  totalUnread: 0,
  conversations: []
}

export function useZApiAttention(): {
  snapshot: ZApiAttentionSnapshot
  markSeen: (conversationId: number) => Promise<void>
} {
  const [snapshot, setSnapshot] = useState(EMPTY_ATTENTION)
  useEffect(() => {
    let disposed = false
    const off = window.api.zApiAttention.onChanged((next) => {
      if (!disposed) {
        setSnapshot(next)
      }
    })
    void window.api.zApiAttention
      .getSnapshot()
      .then((next) => {
        if (!disposed) {
          setSnapshot(next)
        }
      })
      .catch((error: unknown) => console.error('[z-api-attention] snapshot failed:', error))
    return () => {
      disposed = true
      off()
    }
  }, [])
  const markSeen = useCallback(async (conversationId: number): Promise<void> => {
    setSnapshot(await window.api.zApiAttention.markSeen({ conversationId }))
  }, [])
  return { snapshot, markSeen }
}
