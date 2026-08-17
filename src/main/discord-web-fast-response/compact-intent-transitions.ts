import type {
  DiscordWebCompactIntent,
  DiscordWebManagerTab
} from '../../shared/discord-web-fast-response'
import type { CompactDiscordMode, CompactDiscordModeState } from './compact-dom-mode'

export type DiscordCompactIntentTransitions = {
  currentMode: () => CompactDiscordMode
  selectMessagesManager: () => Promise<CompactDiscordModeState>
  applyMode: (mode: CompactDiscordMode) => Promise<CompactDiscordModeState>
  openDirectMessage: (href: string, name: string) => Promise<CompactDiscordModeState>
}

export function handleDiscordCompactIntent(
  intent: DiscordWebCompactIntent['intent'],
  transitions: DiscordCompactIntentTransitions
): Promise<CompactDiscordModeState> {
  const mode = transitions.currentMode()
  if (intent.kind === 'select-manager-tab') {
    if (mode.kind !== 'manager') {
      return Promise.reject(new Error('discord_web_compact_intent_denied'))
    }
    return intent.tab === 'messages'
      ? transitions.selectMessagesManager()
      : transitions.applyMode({ kind: 'manager', tab: intent.tab })
  }
  if (intent.kind === 'select-server') {
    return transitions.applyMode({
      kind: 'server-channels',
      serverId: intent.serverId,
      serverName: intent.serverName
    })
  }
  if (intent.kind === 'open-text-channel') {
    return transitions.applyMode({
      kind: 'dedicated',
      source: {
        kind: 'server-channel',
        serverId: intent.serverId,
        serverName: intent.serverName,
        channelId: intent.channelId,
        channelName: intent.channelName
      }
    })
  }
  if (intent.kind === 'open-direct-message') {
    return transitions.openDirectMessage(intent.href, intent.name)
  }
  return transitions.applyMode(compactDiscordBackTarget(mode))
}

export function managerTabForMode(mode: CompactDiscordMode): DiscordWebManagerTab {
  if (mode.kind === 'server-channels') {
    return 'servers'
  }
  if (mode.kind === 'dedicated' && mode.source.kind === 'direct-message') {
    return 'messages'
  }
  return 'servers'
}

function compactDiscordBackTarget(mode: CompactDiscordMode): CompactDiscordMode {
  if (mode.kind === 'server-channels') {
    return { kind: 'manager', tab: 'servers' }
  }
  if (mode.kind === 'dedicated' && mode.source.kind === 'server-channel') {
    return {
      kind: 'server-channels',
      serverId: mode.source.serverId,
      serverName: mode.source.serverName
    }
  }
  if (mode.kind === 'dedicated') {
    return { kind: 'manager', tab: 'messages' }
  }
  return mode
}
