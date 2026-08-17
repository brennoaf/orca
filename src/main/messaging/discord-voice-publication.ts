import type { DiscordVoiceSnapshot } from '../../shared/discord-voice'

const callStateListeners = new Set<(inCall: boolean) => void>()
const snapshotListeners = new Set<(snapshot: DiscordVoiceSnapshot) => void>()

export function onDiscordVoiceCallStateChanged(listener: (inCall: boolean) => void): () => void {
  callStateListeners.add(listener)
  return () => callStateListeners.delete(listener)
}

export function onDiscordVoiceSnapshotChanged(
  listener: (snapshot: DiscordVoiceSnapshot) => void
): () => void {
  snapshotListeners.add(listener)
  return () => snapshotListeners.delete(listener)
}

export function publishDiscordVoiceCallState(inCall: boolean): void {
  for (const listener of callStateListeners) {
    listener(inCall)
  }
}

export function publishDiscordVoiceSnapshot(snapshot: DiscordVoiceSnapshot): void {
  for (const listener of snapshotListeners) {
    listener(snapshot)
  }
}
