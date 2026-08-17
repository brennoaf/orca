import type { DiscordVoiceSnapshot } from '../../shared/discord-voice'

export function isDiscordVoiceSelectionAvailable(
  snapshot: Pick<DiscordVoiceSnapshot, 'connection'>
): boolean {
  return snapshot.connection === 'connected'
}
