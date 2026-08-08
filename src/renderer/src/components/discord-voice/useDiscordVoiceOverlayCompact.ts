import { useCallback, useEffect, useState } from 'react'
import { callDiscordVoice } from './useDiscordVoiceSnapshot'

type OverlayCompactState = { compact: boolean }

export function useDiscordVoiceOverlayCompact(): {
  compact: boolean
  setCompact: (compact: boolean) => void
} {
  const [compact, setCompactState] = useState(false)

  useEffect(() => {
    let disposed = false
    void callDiscordVoice<OverlayCompactState>('discordVoice.getOverlayCompact')
      .then((next) => {
        if (!disposed) {
          setCompactState(next.compact)
        }
      })
      .catch((error: unknown) =>
        console.error('[discord-voice] failed to read the overlay layout:', error)
      )
    return () => {
      disposed = true
    }
  }, [])

  const setCompact = useCallback((next: boolean) => {
    setCompactState(next)
    void callDiscordVoice<OverlayCompactState>('discordVoice.setOverlayCompact', { compact: next })
      .then((applied) => setCompactState(applied.compact))
      .catch((error: unknown) =>
        console.error('[discord-voice] failed to change the overlay layout:', error)
      )
  }, [])

  return { compact, setCompact }
}
