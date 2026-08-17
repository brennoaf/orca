import { z } from 'zod'

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
  selection?: DiscordVoiceSelectionState
}

export type DiscordVoiceSelectionState = {
  kind: 'idle' | 'pending' | 'succeeded' | 'failed'
  revision: number
  requestId: number
  channelId: string | null
  errorCode: 'selection_failed' | null
}

export const DiscordVoiceSelectionStateSchema = z
  .object({
    kind: z.enum(['idle', 'pending', 'succeeded', 'failed']),
    revision: z.number().int().nonnegative(),
    requestId: z.number().int().nonnegative(),
    channelId: z.string().nullable(),
    errorCode: z.literal('selection_failed').nullable()
  })
  .strict()

export const DiscordVoiceSnapshotSchema = z
  .object({
    connection: z.enum(['disconnected', 'connecting', 'connected']),
    channelId: z.string().nullable(),
    channelName: z.string().nullable(),
    selfUserId: z.string().nullable(),
    participants: z.array(
      z
        .object({
          userId: z.string(),
          displayName: z.string(),
          avatarUrl: z.string().nullable(),
          mute: z.boolean(),
          deaf: z.boolean(),
          selfMute: z.boolean(),
          selfDeaf: z.boolean(),
          speaking: z.boolean()
        })
        .strict()
    ),
    credentialsConfigured: z.boolean(),
    lastError: z.string().nullable(),
    selection: DiscordVoiceSelectionStateSchema.optional()
  })
  .strict()

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
    selection: { kind: 'idle', revision: 0, requestId: 0, channelId: null, errorCode: null },
    ...overrides
  }
}
