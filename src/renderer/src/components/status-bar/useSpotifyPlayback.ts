import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpotifyPlaybackSnapshot } from '../../../../shared/spotify-playback'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'

export const SPOTIFY_PLAYING_POLL_MS = 1_000
export const SPOTIFY_AUDIO_LEVEL_POLL_MS = 100
export const SPOTIFY_IDLE_POLL_MS = 5_000
export const SPOTIFY_HIDDEN_POLL_MS = 30_000

const EMPTY: SpotifyPlaybackSnapshot = {
  status: 'unsupported',
  sessionId: null,
  revision: 0,
  item: null,
  capabilities: {
    previous: false,
    togglePlayPause: false,
    next: false
  },
  errorCode: null
}

type SpotifyPlaybackCommand = 'previous' | 'togglePlay' | 'next'

function scheduleSpotifyPoll(callback: () => void, delay: number): number {
  return window.setTimeout(callback, delay)
}

export function useSpotifyPlayback(menuOpen: boolean) {
  const [snapshot, setSnapshot] = useState(EMPTY)
  const [pending, setPending] = useState(false)
  const [audioLevel, setAudioLevel] = useState<number | null>(null)
  const mountedRef = useRef(true)
  const pendingRef = useRef(false)
  const requestEpochRef = useRef(0)
  const snapshotRef = useRef(EMPTY)
  const menuOpenRef = useRef(menuOpen)
  const audioLifecycleRef = useRef({ suspend: (): void => {}, resume: (): void => {} })

  useEffect(() => {
    menuOpenRef.current = menuOpen
  }, [menuOpen])

  const commitSnapshot = useCallback(
    (next: SpotifyPlaybackSnapshot, expectedEpoch: number): boolean => {
      if (
        !mountedRef.current ||
        requestEpochRef.current !== expectedEpoch ||
        next.revision < snapshotRef.current.revision
      ) {
        return false
      }
      snapshotRef.current = next
      setSnapshot(next)
      return true
    },
    []
  )

  useEffect(() => {
    mountedRef.current = true
    let timer: number | null = null
    let controller: AbortController | null = null
    let disposed = false
    let requestId = 0
    const cancel = (): void => {
      requestId += 1
      controller?.abort()
      controller = null
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }
    const schedule = (delay: number): void => {
      if (!disposed && !document.hidden) {
        timer = scheduleSpotifyPoll(() => void poll(), delay)
      }
    }
    const poll = async (): Promise<void> => {
      if (disposed || document.hidden) {
        return
      }
      timer = null
      const currentRequestId = requestId + 1
      requestId = currentRequestId
      const expectedEpoch = requestEpochRef.current
      const requestController = new AbortController()
      controller = requestController
      try {
        const next = await callRuntimeRpc<SpotifyPlaybackSnapshot>(
          { kind: 'local' },
          'spotifyPlayback.getState',
          undefined,
          { signal: requestController.signal }
        )
        if (disposed || document.hidden || currentRequestId !== requestId) {
          return
        }
        commitSnapshot(next, expectedEpoch)
        schedule(
          next.status === 'playing' || menuOpenRef.current
            ? SPOTIFY_PLAYING_POLL_MS
            : SPOTIFY_IDLE_POLL_MS
        )
      } catch {
        if (!disposed && !document.hidden && currentRequestId === requestId) {
          schedule(SPOTIFY_IDLE_POLL_MS)
        }
      }
    }
    const onVisibilityChange = (): void => {
      if (document.hidden) {
        cancel()
        audioLifecycleRef.current.suspend()
      } else {
        void poll()
        audioLifecycleRef.current.resume()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    void poll()
    return () => {
      disposed = true
      mountedRef.current = false
      document.removeEventListener('visibilitychange', onVisibilityChange)
      cancel()
    }
  }, [commitSnapshot])

  useEffect(() => {
    let timer: number | null = null
    let controller: AbortController | null = null
    let disposed = false
    let requestId = 0
    let running = false
    const cancel = (): void => {
      requestId += 1
      running = false
      controller?.abort()
      controller = null
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    }
    const poll = async (): Promise<void> => {
      const current = snapshotRef.current
      if (current.status !== 'playing' || current.sessionId === null || document.hidden) {
        setAudioLevel(null)
        return
      }
      timer = null
      running = true
      const currentRequestId = requestId + 1
      requestId = currentRequestId
      const requestController = new AbortController()
      controller = requestController
      try {
        const level = await callRuntimeRpc<number | null>(
          { kind: 'local' },
          'spotifyPlayback.getAudioLevel',
          { sessionId: current.sessionId, revision: current.revision },
          { signal: requestController.signal }
        )
        const latest = snapshotRef.current
        if (
          !disposed &&
          !document.hidden &&
          currentRequestId === requestId &&
          latest.status === 'playing' &&
          latest.sessionId === current.sessionId &&
          latest.revision === current.revision
        ) {
          setAudioLevel(level)
        }
      } catch {
        if (!disposed && currentRequestId === requestId) {
          setAudioLevel(null)
        }
      }
      running = false
      if (!disposed && !document.hidden && currentRequestId === requestId) {
        timer = scheduleSpotifyPoll(() => void poll(), SPOTIFY_AUDIO_LEVEL_POLL_MS)
      }
    }
    const resume = (): void => {
      if (!disposed && !running && timer === null) {
        void poll()
      }
    }
    audioLifecycleRef.current = {
      suspend: () => {
        cancel()
        setAudioLevel(null)
      },
      resume
    }
    void poll()
    return () => {
      disposed = true
      cancel()
      audioLifecycleRef.current = { suspend: (): void => {}, resume: (): void => {} }
    }
  }, [snapshot.status, snapshot.sessionId, snapshot.revision])

  const command = useCallback(
    async (method: SpotifyPlaybackCommand): Promise<SpotifyPlaybackSnapshot | undefined> => {
      const current = snapshotRef.current
      if (pendingRef.current || current.sessionId === null) {
        return
      }
      pendingRef.current = true
      setPending(true)
      const expectedEpoch = requestEpochRef.current + 1
      requestEpochRef.current = expectedEpoch
      try {
        const next = await callRuntimeRpc<SpotifyPlaybackSnapshot>(
          { kind: 'local' },
          `spotifyPlayback.${method}`,
          {
            sessionId: current.sessionId,
            revision: current.revision
          }
        )
        commitSnapshot(next, expectedEpoch)
        return next
      } finally {
        pendingRef.current = false
        if (mountedRef.current && requestEpochRef.current === expectedEpoch) {
          setPending(false)
        }
      }
    },
    [commitSnapshot]
  )

  return { snapshot, pending, command, audioLevel }
}
