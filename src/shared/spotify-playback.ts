export type SpotifyPlaybackStatus =
  | 'unsupported'
  | 'no-session'
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'error'

export type SpotifyPlaybackItem = {
  title: string
  artists: readonly string[]
  album: string | null
  artworkDataUrl: string | null
  positionMs: number
  durationMs: number
}

export type SpotifyPlaybackCapabilities = {
  previous: boolean
  togglePlayPause: boolean
  next: boolean
}

export type SpotifyPlaybackSnapshot = {
  status: SpotifyPlaybackStatus
  sessionId: string | null
  revision: number
  item: SpotifyPlaybackItem | null
  capabilities: SpotifyPlaybackCapabilities
  errorCode: 'native-provider' | 'stale-session' | 'command-rejected' | null
}

export type SpotifyPlaybackCommand = {
  sessionId: string
  revision: number
}
