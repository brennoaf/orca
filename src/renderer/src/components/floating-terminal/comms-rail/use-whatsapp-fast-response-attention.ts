import { useEffect, useState } from 'react'

export function useWhatsAppFastResponseAttention(): boolean {
  const [hasUnread, setHasUnread] = useState(false)
  useEffect(
    () =>
      window.api.whatsappFastResponse.onAttentionChanged((attention) =>
        setHasUnread(attention.hasUnread)
      ),
    []
  )
  return hasUnread
}
