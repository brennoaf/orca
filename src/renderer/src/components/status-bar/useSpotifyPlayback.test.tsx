// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpotifyPlaybackSnapshot } from '../../../../shared/spotify-playback'
import {
  SPOTIFY_IDLE_POLL_MS,
  SPOTIFY_PLAYING_POLL_MS,
  useSpotifyPlayback
} from './useSpotifyPlayback'

const rpc = vi.hoisted(() => vi.fn())

vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc: rpc }))

const PLAYING: SpotifyPlaybackSnapshot = {
  status: 'playing',
  sessionId: 'spotify-session',
  revision: 2,
  item: {
    title: 'Track',
    artists: ['Artist'],
    album: 'Album',
    artworkDataUrl: null,
    positionMs: 1_000,
    durationMs: 10_000
  },
  capabilities: { previous: true, togglePlayPause: true, next: true },
  errorCode: null
}

describe('useSpotifyPlayback', () => {
  beforeEach(() => {
    rpc.mockReset()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses active and idle intervals and aborts on cleanup', async () => {
    const timeout = vi.spyOn(globalThis, 'setTimeout')
    rpc.mockResolvedValue(PLAYING)
    const playing = renderHook(() => useSpotifyPlayback(false))
    await waitFor(() => expect(playing.result.current.snapshot.status).toBe('playing'))
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), SPOTIFY_PLAYING_POLL_MS)
    const signal = rpc.mock.calls[0]?.[3]?.signal as AbortSignal
    playing.unmount()
    expect(signal.aborted).toBe(true)

    timeout.mockClear()
    rpc.mockResolvedValue({ ...PLAYING, status: 'paused' })
    const paused = renderHook(() => useSpotifyPlayback(false))
    await waitFor(() => expect(paused.result.current.snapshot.status).toBe('paused'))
    expect(timeout).toHaveBeenCalledWith(expect.any(Function), SPOTIFY_IDLE_POLL_MS)
    paused.unmount()

    timeout.mockClear()
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    const hidden = renderHook(() => useSpotifyPlayback(false))
    expect(hidden.result.current.snapshot.status).toBe('unsupported')
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(hidden.result.current.snapshot.status).toBe('paused'))
    hidden.unmount()
  })

  it('suspends audio while hidden and resumes state and audio polling immediately once', async () => {
    const listeners = vi.spyOn(document, 'addEventListener')
    rpc.mockImplementation((_target: unknown, method: string) => {
      if (method === 'spotifyPlayback.getState') {
        return Promise.resolve(PLAYING)
      }
      return Promise.resolve(0.4)
    })
    const { result, unmount } = renderHook(() => useSpotifyPlayback(false))
    await waitFor(() => expect(result.current.audioLevel).toBe(0.4))
    expect(listeners.mock.calls.filter(([event]) => event === 'visibilitychange')).toHaveLength(1)
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(result.current.audioLevel).toBeNull()
    const beforeResume = rpc.mock.calls.length
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    await waitFor(() => expect(rpc.mock.calls.length).toBeGreaterThan(beforeResume))
    await waitFor(() => expect(result.current.audioLevel).toBe(0.4))
    unmount()
  })

  it('serializes commands and sends the expected session identity', async () => {
    let resolveCommand: ((snapshot: SpotifyPlaybackSnapshot) => void) | null = null
    rpc.mockImplementation((_target: unknown, method: string) => {
      if (method === 'spotifyPlayback.getState') {
        return Promise.resolve(PLAYING)
      }
      return new Promise<SpotifyPlaybackSnapshot>((resolve) => {
        resolveCommand = resolve
      })
    })
    const { result } = renderHook(() => useSpotifyPlayback(false))
    await waitFor(() => expect(result.current.snapshot.status).toBe('playing'))
    let first: Promise<SpotifyPlaybackSnapshot | undefined> | undefined
    await act(async () => {
      first = result.current.command('next')
      void result.current.command('previous')
    })
    expect(rpc.mock.calls.filter((call) => call[1] === 'spotifyPlayback.next')).toHaveLength(1)
    expect(rpc.mock.calls.filter((call) => call[1] === 'spotifyPlayback.previous')).toHaveLength(0)
    expect(rpc).toHaveBeenCalledWith({ kind: 'local' }, 'spotifyPlayback.next', {
      sessionId: 'spotify-session',
      revision: 2
    })
    await act(async () => {
      resolveCommand?.({ ...PLAYING, revision: 3, item: { ...PLAYING.item!, title: 'Next' } })
      await first
    })
    expect(result.current.snapshot.revision).toBe(3)
    expect(result.current.pending).toBe(false)
  })

  it('does not let an older polling response overwrite a command result', async () => {
    let resolvePoll: ((snapshot: SpotifyPlaybackSnapshot) => void) | null = null
    let stateReads = 0
    rpc.mockImplementation((_target: unknown, method: string) => {
      if (method === 'spotifyPlayback.getState') {
        stateReads += 1
        if (stateReads === 1) {
          return Promise.resolve(PLAYING)
        }
        return new Promise<SpotifyPlaybackSnapshot>((resolve) => {
          resolvePoll = resolve
        })
      }
      return Promise.resolve({ ...PLAYING, revision: 4, item: { ...PLAYING.item!, title: 'New' } })
    })
    const timeout = vi.spyOn(globalThis, 'setTimeout')
    const { result } = renderHook(() => useSpotifyPlayback(false))
    await waitFor(() => expect(result.current.snapshot.revision).toBe(2))
    const nextPoll = timeout.mock.calls.find((call) => call[1] === SPOTIFY_PLAYING_POLL_MS)?.[0]
    expect(nextPoll).toBeTypeOf('function')
    await act(async () => {
      if (typeof nextPoll === 'function') {
        nextPoll()
      }
      await Promise.resolve()
      await result.current.command('next')
    })
    await act(async () => {
      resolvePoll?.({ ...PLAYING, revision: 3, item: { ...PLAYING.item!, title: 'Old' } })
      await Promise.resolve()
    })
    expect(result.current.snapshot.revision).toBe(4)
    expect(result.current.snapshot.item?.title).toBe('New')
  })
})
