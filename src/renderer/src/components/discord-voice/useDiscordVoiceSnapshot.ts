import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DISCORD_VOICE_ACTIVE_POLL_MS,
  DISCORD_VOICE_IDLE_POLL_MS,
  emptyDiscordVoiceSnapshot,
  type DiscordVoiceSnapshot
} from '../../../../shared/discord-voice'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'

const LOCAL_TARGET = { kind: 'local' } as const

export function getDiscordVoicePollInterval(inCall: boolean, activePolling: boolean): number {
  return activePolling && inCall ? DISCORD_VOICE_ACTIVE_POLL_MS : DISCORD_VOICE_IDLE_POLL_MS
}

export function callDiscordVoice<TResult = DiscordVoiceSnapshot>(
  method: string,
  params?: unknown
): Promise<TResult> {
  return callRuntimeRpc<TResult>(LOCAL_TARGET, method, params)
}

export function useDiscordVoiceSnapshot({
  activePolling = true
}: {
  activePolling?: boolean
} = {}): {
  snapshot: DiscordVoiceSnapshot
  apply: (next: DiscordVoiceSnapshot) => void
} {
  const [snapshot, setSnapshot] = useState<DiscordVoiceSnapshot>(() =>
    emptyDiscordVoiceSnapshot({ connection: 'connecting' })
  )
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inCallRef = useRef(false)

  const apply = useCallback((next: DiscordVoiceSnapshot) => {
    inCallRef.current = next.channelId !== null
    setSnapshot(next)
  }, [])

  useEffect(() => {
    let disposed = false

    const clearTimer = (): void => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const scheduleNext = (): void => {
      if (disposed || document.visibilityState === 'hidden') {
        return
      }
      timerRef.current = setTimeout(
        () => {
          void poll()
        },
        getDiscordVoicePollInterval(inCallRef.current, activePolling)
      )
    }

    const poll = async (): Promise<void> => {
      if (disposed || document.visibilityState === 'hidden') {
        return
      }
      try {
        const next = await callDiscordVoice('discordVoice.getState')
        if (!disposed) {
          apply(next)
        }
      } catch (error) {
        console.error('[discord-voice] failed to read the voice snapshot:', error)
      }
      scheduleNext()
    }

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        clearTimer()
        return
      }
      clearTimer()
      void poll()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    void poll()
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearTimer()
    }
  }, [activePolling, apply])

  return { snapshot, apply }
}
