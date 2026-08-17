import type {
  CommunicationsDockDiscordCommand,
  CommunicationsDockIdentity
} from '../../../../shared/communications-dock'

function readBooleanParam(params: unknown, key: 'muted' | 'deafened'): boolean {
  if (params && typeof params === 'object' && key in params && typeof params[key] === 'boolean') {
    return params[key]
  }
  throw new Error(`communications_dock_invalid_${key}`)
}

export function communicationsDockDiscordCommand(
  identity: CommunicationsDockIdentity,
  method: string,
  params?: unknown
): CommunicationsDockDiscordCommand {
  const base = { ...identity, appId: 'discord' as const }
  if (method === 'discordVoice.setSelfMute') {
    return { ...base, method: 'set-self-mute', muted: readBooleanParam(params, 'muted') }
  }
  if (method === 'discordVoice.setSelfDeaf') {
    return { ...base, method: 'set-self-deaf', deafened: readBooleanParam(params, 'deafened') }
  }
  if (method === 'discordVoice.leaveCall') {
    return { ...base, method: 'leave-call' }
  }
  if (method === 'discordVoice.reconnect') {
    return { ...base, method: 'reconnect' }
  }
  throw new Error(`communications_dock_unknown_discord_command:${method}`)
}
