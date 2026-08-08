import { useCallback, useEffect, useState } from 'react'
import { callDiscordVoice } from './useDiscordVoiceSnapshot'

type DiscordVoiceOverlayState = {
  open: boolean
}

const OVERLAY_STATE_POLL_MS = 1_000

export function useDiscordVoiceOverlayState(): {
  open: boolean
  toggle: () => void
} {
  const [open, setOpen] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    const next = await callDiscordVoice<DiscordVoiceOverlayState>('discordVoice.getOverlayState')
    setOpen(next.open)
  }, [])

  useEffect(() => {
    let disposed = false
    const poll = async (): Promise<void> => {
      try {
        const next = await callDiscordVoice<DiscordVoiceOverlayState>(
          'discordVoice.getOverlayState'
        )
        if (!disposed) {
          setOpen(next.open)
        }
      } catch (error) {
        console.error('[discord-voice] failed to read the overlay state:', error)
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), OVERLAY_STATE_POLL_MS)
    return () => {
      disposed = true
      clearInterval(timer)
    }
  }, [])

  const toggle = useCallback((): void => {
    const method = open ? 'discordVoice.closeOverlay' : 'discordVoice.openOverlay'
    void callDiscordVoice(method)
      .then(refresh)
      .catch((error: unknown) =>
        console.error('[discord-voice] failed to update the overlay state:', error)
      )
  }, [open, refresh])

  return { open, toggle }
}
