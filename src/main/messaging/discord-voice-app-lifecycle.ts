import { app } from 'electron'
import { startDiscordVoiceService, stopDiscordVoiceService } from './discord-voice-service'

let started = false

export function startDiscordVoiceAppLifecycle(): void {
  if (started) {
    return
  }
  started = true
  startDiscordVoiceService()
  app.once('will-quit', stopDiscordVoiceService)
}
