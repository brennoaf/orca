import type { CommunicationsDockDiscordCommand } from '../../shared/communications-dock'
import {
  leaveDiscordVoiceCall,
  reconnectDiscordVoiceService,
  selectDiscordVoiceChannel,
  setDiscordVoiceSelfDeaf,
  setDiscordVoiceSelfMute
} from '../messaging/discord-voice-service'
import {
  closeDiscordVoiceWindow,
  createOrFocusDiscordVoiceWindow
} from '../window/discord-voice-window'

export async function runCommunicationsDockDiscordCommand(
  command: CommunicationsDockDiscordCommand
): Promise<void> {
  if (command.method === 'reconnect') {
    reconnectDiscordVoiceService()
  } else if (command.method === 'set-self-mute') {
    await setDiscordVoiceSelfMute(command.muted)
  } else if (command.method === 'set-self-deaf') {
    await setDiscordVoiceSelfDeaf(command.deafened)
  } else if (command.method === 'leave-call') {
    await leaveDiscordVoiceCall()
  } else if (command.method === 'select-voice-channel') {
    await selectDiscordVoiceChannel(command.channelId)
  } else if (command.open) {
    createOrFocusDiscordVoiceWindow()
  } else {
    closeDiscordVoiceWindow()
  }
}
