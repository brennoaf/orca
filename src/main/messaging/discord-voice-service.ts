import type { DiscordVoiceSnapshot } from '../../shared/discord-voice'
import { DiscordVoiceService } from './discord-voice-service-core'

export {
  onDiscordVoiceCallStateChanged,
  onDiscordVoiceSnapshotChanged
} from './discord-voice-publication'
export type { DiscordVoiceConnectionFailureKind } from './discord-voice-service-core'

const discordVoiceService = new DiscordVoiceService()

export function startDiscordVoiceService(): void {
  discordVoiceService.start()
}

export function stopDiscordVoiceService(): void {
  discordVoiceService.stop()
}

export function reconnectDiscordVoiceService(): void {
  discordVoiceService.reconnectNow()
}

export function getDiscordVoiceSnapshot(): DiscordVoiceSnapshot {
  return discordVoiceService.getSnapshot()
}

export function isDiscordVoiceInCall(): boolean {
  return discordVoiceService.isInCall()
}

export function getDiscordVoiceConnectionFailureKind() {
  return discordVoiceService.getConnectionFailureKind()
}

export function setDiscordVoiceSelfMute(muted: boolean): Promise<void> {
  return discordVoiceService.setSelfMute(muted)
}

export function setDiscordVoiceSelfDeaf(deafened: boolean): Promise<void> {
  return discordVoiceService.setSelfDeaf(deafened)
}

export function leaveDiscordVoiceCall(): Promise<void> {
  return discordVoiceService.leaveCall()
}

export function selectDiscordVoiceChannel(channelId: string): Promise<DiscordVoiceSnapshot> {
  return discordVoiceService.selectVoiceChannel(channelId)
}

export function recordDiscordVoiceSelectionFailure(channelId: string): void {
  discordVoiceService.recordSelectionFailure(channelId)
}
