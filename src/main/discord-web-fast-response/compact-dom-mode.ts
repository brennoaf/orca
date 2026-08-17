import {
  DiscordWebCompactModeSchema,
  type DiscordWebCompactMode,
  type DiscordWebManagerTab
} from '../../shared/discord-web-fast-response'

export type DiscordManagerTab = DiscordWebManagerTab
export type CompactDiscordMode = DiscordWebCompactMode
export type CompactDiscordAdapterState = 'installed' | 'unsupported'
export type CompactDiscordModeState = CompactDiscordAdapterState | 'navigating'

export function compactDiscordModeFor(value: unknown): CompactDiscordMode | null {
  const result = DiscordWebCompactModeSchema.safeParse(value)
  return result.success ? result.data : null
}
