import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SpotifyPlaybackService } from './spotify-playback-service'
import {
  setWindowsMediaControlBindingLoader,
  type WindowsMediaControlBinding,
  type WindowsMediaSession
} from './windows-media-control-binding'

function session(overrides: Partial<WindowsMediaSession> = {}): WindowsMediaSession {
  return {
    sessionId: 'spotify-main',
    sourceAppUserModelId: 'Spotify.exe',
    playbackStatus: 'paused',
    title: 'Track',
    artist: 'Artist',
    albumTitle: 'Album',
    mediaIdentity: 'track-1',
    positionMs: 12_000,
    durationMs: 180_000,
    artwork: null,
    capabilities: { previous: true, togglePlayPause: true, next: true },
    ...overrides
  }
}

function binding(initial: readonly WindowsMediaSession[]) {
  let sessions = initial
  const value: WindowsMediaControlBinding & {
    setSessions(next: readonly WindowsMediaSession[]): void
  } = {
    listSessions: vi.fn(async () => sessions),
    audioPeak: vi.fn(async () => 0.5),
    previous: vi.fn(async () => true),
    togglePlayPause: vi.fn(async () => true),
    next: vi.fn(async () => true),
    setSessions: (next) => {
      sessions = next
    }
  }
  return value
}

beforeEach(() => setWindowsMediaControlBindingLoader(async () => null))

describe('SpotifyPlaybackService GSMTC state', () => {
  it('returns only a bounded peak for the current playing Spotify session', async () => {
    const native = binding([session({ playbackStatus: 'playing' })])
    vi.mocked(native.audioPeak).mockResolvedValue(2)
    setWindowsMediaControlBindingLoader(async () => native)
    const service = new SpotifyPlaybackService()
    const current = await service.getState()
    await expect(
      service.getAudioLevel({ sessionId: current.sessionId!, revision: current.revision })
    ).resolves.toBe(1)
    await expect(
      service.getAudioLevel({ sessionId: 'stale', revision: current.revision })
    ).resolves.toBeNull()
  })
  it('reports unsupported and no Spotify session', async () => {
    await expect(new SpotifyPlaybackService().getState()).resolves.toMatchObject({
      status: 'unsupported',
      sessionId: null
    })
    const native = binding([session({ sourceAppUserModelId: 'vlc.exe' })])
    setWindowsMediaControlBindingLoader(async () => native)
    await expect(new SpotifyPlaybackService().getState()).resolves.toMatchObject({
      status: 'no-session',
      sessionId: null
    })
  })

  it('selects playing over paused Spotify and uses stable id ties', async () => {
    const native = binding([
      session({ sessionId: 'z-paused' }),
      session({ sessionId: 'b-playing', playbackStatus: 'playing' }),
      session({ sessionId: 'a-playing', playbackStatus: 'playing', title: 'Selected' }),
      session({ sessionId: 'fake', sourceAppUserModelId: 'my-spotify-helper.exe' })
    ])
    setWindowsMediaControlBindingLoader(async () => native)
    await expect(new SpotifyPlaybackService().getState()).resolves.toMatchObject({
      status: 'playing',
      sessionId: 'a-playing',
      item: { title: 'Selected', artists: ['Artist'], album: 'Album' }
    })
  })

  it('accepts the bounded Microsoft Store AUMID and maps capabilities', async () => {
    const native = binding([
      session({
        sourceAppUserModelId: 'SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify',
        capabilities: { previous: false, togglePlayPause: true, next: false }
      })
    ])
    setWindowsMediaControlBindingLoader(async () => native)
    await expect(new SpotifyPlaybackService().getState()).resolves.toMatchObject({
      capabilities: { previous: false, togglePlayPause: true, next: false }
    })
  })

  it('clamps the timeline and bounds artwork MIME and size', async () => {
    const native = binding([
      session({
        positionMs: 500_000,
        durationMs: 100_000,
        artwork: { mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }
      })
    ])
    setWindowsMediaControlBindingLoader(async () => native)
    await expect(new SpotifyPlaybackService().getState()).resolves.toMatchObject({
      item: { positionMs: 100_000, artworkDataUrl: 'data:image/png;base64,AQID' }
    })
    native.setSessions([
      session({
        mediaIdentity: 'track-2',
        artwork: { mimeType: 'image/svg+xml', bytes: new Uint8Array([1]) }
      })
    ])
    await expect(new SpotifyPlaybackService().getState()).resolves.toMatchObject({
      item: { artworkDataUrl: null }
    })
    native.setSessions([
      session({
        mediaIdentity: 'track-3',
        artwork: { mimeType: 'image/jpeg', bytes: new Uint8Array(2 * 1024 * 1024 + 1) }
      })
    ])
    await expect(new SpotifyPlaybackService().getState()).resolves.toMatchObject({
      item: { artworkDataUrl: null }
    })
  })

  it('caches one artwork by media identity while timeline updates', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const native = binding([session({ artwork: { mimeType: 'image/png', bytes } })])
    setWindowsMediaControlBindingLoader(async () => native)
    const service = new SpotifyPlaybackService()
    const first = await service.getState()
    bytes[0] = 9
    native.setSessions([session({ positionMs: 13_000, artwork: { mimeType: 'image/png', bytes } })])
    const second = await service.getState()
    expect(second.item?.artworkDataUrl).toBe(first.item?.artworkDataUrl)
    expect(second.revision).toBe(first.revision)
  })
})

describe('SpotifyPlaybackService GSMTC commands', () => {
  it('rejects stale session and revision before invoking native commands', async () => {
    const native = binding([session()])
    setWindowsMediaControlBindingLoader(async () => native)
    const service = new SpotifyPlaybackService()
    const current = await service.getState()
    await expect(
      service.next({ sessionId: 'other', revision: current.revision })
    ).resolves.toMatchObject({ errorCode: 'stale-session' })
    await expect(
      service.next({ sessionId: current.sessionId!, revision: current.revision + 1 })
    ).resolves.toMatchObject({ errorCode: 'stale-session' })
    expect(native.next).not.toHaveBeenCalled()
  })

  it('rejects missing capability and native Try false', async () => {
    const native = binding([
      session({ capabilities: { previous: false, togglePlayPause: true, next: true } })
    ])
    vi.mocked(native.next).mockResolvedValue(false)
    setWindowsMediaControlBindingLoader(async () => native)
    const service = new SpotifyPlaybackService()
    const current = await service.getState()
    await expect(
      service.previous({ sessionId: current.sessionId!, revision: current.revision })
    ).resolves.toMatchObject({ errorCode: 'command-rejected' })
    await expect(
      service.next({ sessionId: current.sessionId!, revision: current.revision })
    ).resolves.toMatchObject({ errorCode: 'command-rejected' })
  })

  it('invokes the selected session then returns confirmed refreshed state', async () => {
    const native = binding([session()])
    vi.mocked(native.togglePlayPause).mockImplementation(async () => {
      native.setSessions([session({ playbackStatus: 'playing' })])
      return true
    })
    setWindowsMediaControlBindingLoader(async () => native)
    const service = new SpotifyPlaybackService()
    const current = await service.getState()
    await expect(
      service.togglePlayPause({ sessionId: current.sessionId!, revision: current.revision })
    ).resolves.toMatchObject({ status: 'playing', errorCode: null })
    expect(native.togglePlayPause).toHaveBeenCalledWith('spotify-main')
  })

  it('sanitizes removed sessions and binding failures', async () => {
    const native = binding([session()])
    setWindowsMediaControlBindingLoader(async () => native)
    const service = new SpotifyPlaybackService()
    const current = await service.getState()
    native.setSessions([])
    await expect(
      service.next({ sessionId: current.sessionId!, revision: current.revision })
    ).resolves.toMatchObject({ errorCode: 'stale-session', status: 'no-session' })
    vi.mocked(native.listSessions).mockRejectedValue(new Error('secret native detail'))
    await expect(service.getState()).resolves.toMatchObject({
      status: 'error',
      errorCode: 'native-provider'
    })
  })
})
