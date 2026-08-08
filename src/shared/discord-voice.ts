export type DiscordVoiceConnectionState = 'disconnected' | 'connecting' | 'connected'

export type DiscordVoiceParticipant = {
  userId: string
  displayName: string
  avatarUrl: string | null
  mute: boolean
  deaf: boolean
  selfMute: boolean
  selfDeaf: boolean
  speaking: boolean
}

export type DiscordVoiceSnapshot = {
  connection: DiscordVoiceConnectionState
  channelId: string | null
  channelName: string | null
  selfUserId: string | null
  participants: readonly DiscordVoiceParticipant[]
  credentialsConfigured: boolean
  lastError: string | null
}

export type DiscordVoiceCredentialStatus = {
  configured: boolean
  clientId: string | null
}

export const DISCORD_VOICE_ACTIVE_POLL_MS = 150
export const DISCORD_VOICE_IDLE_POLL_MS = 1_000

const DISCORD_CDN_ORIGIN = 'https://cdn.discordapp.com'

export function discordAvatarUrl(userId: string, avatarHash: string | null): string | null {
  return avatarHash ? `${DISCORD_CDN_ORIGIN}/avatars/${userId}/${avatarHash}.png?size=64` : null
}

export function discordVoiceInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return '?'
  }
  const first = words.at(0) ?? ''
  const last = words.length > 1 ? (words.at(-1) ?? '') : ''
  return `${[...first][0] ?? ''}${[...last][0] ?? ''}`.toUpperCase() || '?'
}

export function normalizeDiscordApplicationId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return /^\d{17,}$/.test(trimmed) ? trimmed : null
}

export function emptyDiscordVoiceSnapshot(
  overrides: Partial<DiscordVoiceSnapshot> = {}
): DiscordVoiceSnapshot {
  return {
    connection: 'disconnected',
    channelId: null,
    channelName: null,
    selfUserId: null,
    participants: [],
    credentialsConfigured: false,
    lastError: null,
    ...overrides
  }
}
