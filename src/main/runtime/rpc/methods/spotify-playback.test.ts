import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcContext } from '../core'

const mocks = vi.hoisted(() => ({
  getState: vi.fn(async () => ({ status: 'paused' })),
  getAudioLevel: vi.fn(async () => 0.5),
  togglePlayPause: vi.fn(),
  next: vi.fn(),
  previous: vi.fn()
}))

vi.mock('../../../spotify-playback/spotify-playback-service', () => ({
  getSpotifyPlaybackService: () => mocks
}))

import { SPOTIFY_PLAYBACK_METHODS } from './spotify-playback'

function method(name: string) {
  const value = SPOTIFY_PLAYBACK_METHODS.find((candidate) => candidate.name === name)
  if (!value) {
    throw new Error(`Missing method ${name}`)
  }
  return value
}

describe('Spotify GSMTC runtime RPC', () => {
  beforeEach(() => vi.clearAllMocks())

  it('exposes only state and strict revision-bound commands', async () => {
    expect(SPOTIFY_PLAYBACK_METHODS.map((candidate) => candidate.name)).toEqual([
      'spotifyPlayback.getState',
      'spotifyPlayback.getAudioLevel',
      'spotifyPlayback.togglePlay',
      'spotifyPlayback.next',
      'spotifyPlayback.previous'
    ])
    expect(method('spotifyPlayback.getState').params).toBeNull()
    const params = method('spotifyPlayback.next').params
    expect(params?.safeParse({ sessionId: 'spotify', revision: 1 }).success).toBe(true)
    expect(params?.safeParse({ sessionId: '', revision: 1 }).success).toBe(false)
    expect(params?.safeParse({ sessionId: 'spotify', revision: -1 }).success).toBe(false)
    expect(params?.safeParse({ sessionId: 'spotify', revision: 1, extra: true }).success).toBe(
      false
    )
    expect(
      method('spotifyPlayback.getAudioLevel').params?.safeParse({
        sessionId: 'spotify',
        revision: 1
      }).success
    ).toBe(true)
    await method('spotifyPlayback.next').handler(
      { sessionId: 'spotify', revision: 2 },
      {} as RpcContext
    )
    expect(mocks.next).toHaveBeenCalledWith({ sessionId: 'spotify', revision: 2 })
  })

  it('rejects non-local callers before service access', () => {
    for (const clientKind of ['mobile', 'runtime'] as const) {
      expect(() =>
        method('spotifyPlayback.getState').handler(undefined, {
          clientKind,
          runtime: {} as RpcContext['runtime']
        })
      ).toThrow('Spotify media control is only available locally.')
    }
    expect(mocks.getState).not.toHaveBeenCalled()
  })
})
