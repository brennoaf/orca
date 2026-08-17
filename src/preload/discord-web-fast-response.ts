import type { IpcRenderer } from 'electron'
import type {
  DiscordWebCompactAvailability,
  DiscordWebVoiceAvailability
} from '../shared/discord-web-fast-response'
import { installDiscordWebVoiceSelection } from './discord-web-fast-response-selection'
import { installDiscordWebCompactNavigation } from './discord-web-fast-response-navigation'

const { ipcRenderer } = require('electron') as { ipcRenderer: IpcRenderer }

installDiscordWebVoiceSelection({
  document,
  onAvailability: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: DiscordWebVoiceAvailability
    ): void => callback(state)
    ipcRenderer.on('discordWebFastResponse:voiceAvailability', listener)
    return () => ipcRenderer.removeListener('discordWebFastResponse:voiceAvailability', listener)
  },
  send: (selection) => ipcRenderer.send('discordWebFastResponse:selectVoiceChannel', selection)
})

installDiscordWebCompactNavigation({
  document,
  onAvailability: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: DiscordWebCompactAvailability
    ): void => callback(state)
    ipcRenderer.on('discordWebFastResponse:compactAvailability', listener)
    return () => ipcRenderer.removeListener('discordWebFastResponse:compactAvailability', listener)
  },
  send: (intent) => ipcRenderer.send('discordWebFastResponse:compactIntent', intent)
})
