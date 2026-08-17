import type {
  SpotifyPlaybackCapabilities,
  SpotifyPlaybackCommand,
  SpotifyPlaybackItem,
  SpotifyPlaybackSnapshot,
  SpotifyPlaybackStatus
} from '../../shared/spotify-playback'
import {
  loadWindowsMediaControlBinding,
  type WindowsMediaControlBinding,
  type WindowsMediaSession
} from './windows-media-control-binding'

const MAX_ARTWORK_BYTES = 2 * 1024 * 1024
const SPOTIFY_DESKTOP_SOURCE = 'spotify.exe'
const SPOTIFY_STORE_SOURCE = /^spotifyab\.spotifymusic_[a-z0-9]+!spotify$/i
const EMPTY_CAPABILITIES: SpotifyPlaybackCapabilities = {
  previous: false,
  togglePlayPause: false,
  next: false
}

type CommandName = 'previous' | 'togglePlayPause' | 'next'

function isSpotifySource(value: string): boolean {
  return value.toLowerCase() === SPOTIFY_DESKTOP_SOURCE || SPOTIFY_STORE_SOURCE.test(value)
}

function statusRank(status: WindowsMediaSession['playbackStatus']): number {
  if (status === 'playing') {
    return 0
  }
  if (status === 'paused') {
    return 1
  }
  return 2
}

function selectSpotifySession(
  sessions: readonly WindowsMediaSession[]
): WindowsMediaSession | null {
  return (
    sessions
      .filter((session) => isSpotifySource(session.sourceAppUserModelId))
      .sort(
        (left, right) =>
          statusRank(left.playbackStatus) - statusRank(right.playbackStatus) ||
          left.sessionId.localeCompare(right.sessionId)
      )[0] ?? null
  )
}

function clamp(value: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }
  return Math.min(Math.max(0, value), maximum)
}

function playbackStatus(value: WindowsMediaSession['playbackStatus']): SpotifyPlaybackStatus {
  if (value === 'playing' || value === 'paused' || value === 'stopped') {
    return value
  }
  return 'stopped'
}

function artworkDataUrl(session: WindowsMediaSession): string | null {
  const artwork = session.artwork
  if (!artwork || !/^image\/(png|jpeg|webp)$/i.test(artwork.mimeType)) {
    return null
  }
  if (artwork.bytes.byteLength === 0 || artwork.bytes.byteLength > MAX_ARTWORK_BYTES) {
    return null
  }
  return `data:${artwork.mimeType.toLowerCase()};base64,${Buffer.from(artwork.bytes).toString('base64')}`
}

function meaningful(snapshot: SpotifyPlaybackSnapshot): string {
  return JSON.stringify({
    ...snapshot,
    revision: 0,
    item: snapshot.item ? { ...snapshot.item, positionMs: 0 } : null
  })
}

export class SpotifyPlaybackService {
  private snapshot: SpotifyPlaybackSnapshot = this.empty('unsupported')
  private binding: WindowsMediaControlBinding | null | undefined
  private revision = 0
  private artworkCache: { identity: string; dataUrl: string | null } | null = null

  async getState(): Promise<SpotifyPlaybackSnapshot> {
    return this.refresh()
  }

  async getAudioLevel(command: SpotifyPlaybackCommand): Promise<number | null> {
    if (
      this.snapshot.status !== 'playing' ||
      this.snapshot.sessionId !== command.sessionId ||
      this.snapshot.revision !== command.revision
    ) {
      return null
    }
    try {
      const binding = await this.resolveBinding()
      const peak = binding ? await binding.audioPeak(command.sessionId) : null
      return typeof peak === 'number' && Number.isFinite(peak)
        ? Math.min(1, Math.max(0, peak))
        : null
    } catch {
      return null
    }
  }

  previous(command: SpotifyPlaybackCommand): Promise<SpotifyPlaybackSnapshot> {
    return this.execute('previous', command)
  }

  togglePlayPause(command: SpotifyPlaybackCommand): Promise<SpotifyPlaybackSnapshot> {
    return this.execute('togglePlayPause', command)
  }

  next(command: SpotifyPlaybackCommand): Promise<SpotifyPlaybackSnapshot> {
    return this.execute('next', command)
  }

  private async resolveBinding(): Promise<WindowsMediaControlBinding | null> {
    if (this.binding === undefined) {
      this.binding = await loadWindowsMediaControlBinding()
    }
    return this.binding
  }

  private async refresh(): Promise<SpotifyPlaybackSnapshot> {
    try {
      const binding = await this.resolveBinding()
      if (!binding) {
        return this.commit(this.empty('unsupported'))
      }
      const session = selectSpotifySession(await binding.listSessions())
      if (!session) {
        return this.commit(this.empty('no-session'))
      }
      return this.commit(this.fromSession(session))
    } catch {
      return this.commit(this.empty('error', 'native-provider'))
    }
  }

  private async execute(
    name: CommandName,
    command: SpotifyPlaybackCommand
  ): Promise<SpotifyPlaybackSnapshot> {
    const current = await this.refresh()
    if (current.sessionId !== command.sessionId || current.revision !== command.revision) {
      return this.withError(current, 'stale-session')
    }
    if (!current.capabilities[name]) {
      return this.withError(current, 'command-rejected')
    }
    try {
      const binding = await this.resolveBinding()
      if (!binding || !(await binding[name](command.sessionId))) {
        return this.withError(current, 'command-rejected')
      }
      return this.refresh()
    } catch {
      return this.withError(current, 'native-provider')
    }
  }

  private fromSession(session: WindowsMediaSession): SpotifyPlaybackSnapshot {
    const durationMs = Math.max(0, Number.isFinite(session.durationMs) ? session.durationMs : 0)
    let dataUrl: string | null
    if (this.artworkCache?.identity === session.mediaIdentity) {
      dataUrl = this.artworkCache.dataUrl
    } else {
      dataUrl = artworkDataUrl(session)
      this.artworkCache = { identity: session.mediaIdentity, dataUrl }
    }
    const item: SpotifyPlaybackItem = {
      title: session.title,
      artists: session.artist ? [session.artist] : [],
      album: session.albumTitle || null,
      artworkDataUrl: dataUrl,
      positionMs: clamp(session.positionMs, durationMs),
      durationMs
    }
    return {
      status: playbackStatus(session.playbackStatus),
      sessionId: session.sessionId,
      revision: this.revision,
      item,
      capabilities: { ...session.capabilities },
      errorCode: null
    }
  }

  private empty(
    status: SpotifyPlaybackStatus,
    errorCode: SpotifyPlaybackSnapshot['errorCode'] = null
  ): SpotifyPlaybackSnapshot {
    return {
      status,
      sessionId: null,
      revision: this.revision,
      item: null,
      capabilities: EMPTY_CAPABILITIES,
      errorCode
    }
  }

  private commit(next: SpotifyPlaybackSnapshot): SpotifyPlaybackSnapshot {
    if (meaningful(next) !== meaningful(this.snapshot)) {
      this.revision += 1
    }
    this.snapshot = { ...next, revision: this.revision }
    return this.snapshot
  }

  private withError(
    snapshot: SpotifyPlaybackSnapshot,
    errorCode: NonNullable<SpotifyPlaybackSnapshot['errorCode']>
  ): SpotifyPlaybackSnapshot {
    return { ...snapshot, errorCode }
  }
}

let defaultService: SpotifyPlaybackService | null = null

export function getSpotifyPlaybackService(): SpotifyPlaybackService {
  defaultService ??= new SpotifyPlaybackService()
  return defaultService
}

export function resetSpotifyPlaybackService(): void {
  defaultService = null
}
