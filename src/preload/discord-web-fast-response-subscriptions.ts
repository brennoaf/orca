import type { IpcRenderer } from 'electron'
import type {
  DiscordWebCompactMode,
  DiscordWebCompactModeChanged,
  DiscordWebCompactNavigation,
  DiscordWebManagerTab
} from '../shared/discord-web-fast-response'

type RecordValue = Record<string, unknown>

function readRecord(value: unknown): RecordValue | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordValue) : null
}

function readExactRecord(value: unknown, keys: readonly string[]): RecordValue | null {
  const record = readRecord(value)
  if (!record) {
    return null
  }
  const actualKeys = Object.keys(record)
  return actualKeys.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(record, key))
    ? record
    : null
}

function readSnowflake(value: unknown): string | null {
  return typeof value === 'string' && /^\d{17,20}$/.test(value) ? value : null
}

function readLabel(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const label = value.trim()
  return label.length > 0 && label.length <= 256 ? label : null
}

function readDirectMessageHref(value: unknown): string | null {
  return typeof value === 'string' && /^\/channels\/@me\/\d{17,20}$/.test(value) ? value : null
}

function readManagerTab(value: unknown): DiscordWebManagerTab | null {
  return value === 'servers' || value === 'messages' || value === 'friends' ? value : null
}

function parseDiscordWebCompactMode(value: unknown): DiscordWebCompactMode | null {
  const candidate = readRecord(value)
  if (!candidate) {
    return null
  }
  if (candidate.kind === 'manager') {
    const mode = readExactRecord(value, ['kind', 'tab'])
    const tab = readManagerTab(mode?.tab)
    return mode && tab ? { kind: 'manager', tab } : null
  }
  if (candidate.kind === 'server-channels') {
    const mode = readExactRecord(value, ['kind', 'serverId', 'serverName'])
    const serverId = readSnowflake(mode?.serverId)
    const serverName = readLabel(mode?.serverName)
    return mode && serverId && serverName ? { kind: 'server-channels', serverId, serverName } : null
  }
  if (candidate.kind !== 'dedicated') {
    return null
  }
  const mode = readExactRecord(value, ['kind', 'source'])
  const sourceCandidate = readRecord(mode?.source)
  if (!mode || !sourceCandidate) {
    return null
  }
  if (sourceCandidate.kind === 'server-channel') {
    const source = readExactRecord(mode.source, [
      'kind',
      'serverId',
      'serverName',
      'channelId',
      'channelName'
    ])
    const serverId = readSnowflake(source?.serverId)
    const serverName = readLabel(source?.serverName)
    const channelId = readSnowflake(source?.channelId)
    const channelName = readLabel(source?.channelName)
    return source && serverId && serverName && channelId && channelName
      ? {
          kind: 'dedicated',
          source: { kind: 'server-channel', serverId, serverName, channelId, channelName }
        }
      : null
  }
  if (sourceCandidate.kind === 'direct-message') {
    const source = readExactRecord(mode.source, ['kind', 'href', 'name'])
    const href = readDirectMessageHref(source?.href)
    const name = readLabel(source?.name)
    return source && href && name
      ? { kind: 'dedicated', source: { kind: 'direct-message', href, name } }
      : null
  }
  return null
}

export function parseDiscordWebCompactNavigation(
  value: unknown
): DiscordWebCompactNavigation | null {
  const candidate = readRecord(value)
  if (!candidate) {
    return null
  }
  if (candidate.kind === 'back') {
    return readExactRecord(value, ['kind']) ? { kind: 'back' } : null
  }
  if (candidate.kind === 'select-server') {
    const intent = readExactRecord(value, ['kind', 'serverId', 'serverName'])
    const serverId = readSnowflake(intent?.serverId)
    const serverName = readLabel(intent?.serverName)
    return intent && serverId && serverName ? { kind: 'select-server', serverId, serverName } : null
  }
  if (candidate.kind === 'select-manager-tab') {
    const intent = readExactRecord(value, ['kind', 'tab'])
    const tab = readManagerTab(intent?.tab)
    return intent && tab ? { kind: 'select-manager-tab', tab } : null
  }
  if (candidate.kind === 'open-text-channel') {
    const intent = readExactRecord(value, [
      'kind',
      'serverId',
      'serverName',
      'channelId',
      'channelName'
    ])
    const serverId = readSnowflake(intent?.serverId)
    const serverName = readLabel(intent?.serverName)
    const channelId = readSnowflake(intent?.channelId)
    const channelName = readLabel(intent?.channelName)
    return intent && serverId && serverName && channelId && channelName
      ? { kind: 'open-text-channel', serverId, serverName, channelId, channelName }
      : null
  }
  if (candidate.kind === 'open-direct-message') {
    const intent = readExactRecord(value, ['kind', 'href', 'name'])
    const href = readDirectMessageHref(intent?.href)
    const name = readLabel(intent?.name)
    return intent && href && name ? { kind: 'open-direct-message', href, name } : null
  }
  return null
}

export function parseDiscordWebCompactModeChanged(
  value: unknown
): DiscordWebCompactModeChanged | null {
  const state = readExactRecord(value, ['canClose', 'mode'])
  const mode = parseDiscordWebCompactMode(state?.mode)
  return state && mode && typeof state.canClose === 'boolean'
    ? { canClose: state.canClose, mode }
    : null
}

export function subscribeDiscordWebCompactModeChanged(
  ipcRenderer: Pick<IpcRenderer, 'on' | 'removeListener'>,
  callback: (state: DiscordWebCompactModeChanged) => void
): () => void {
  const listener = (_event: Electron.IpcRendererEvent, value: unknown): void => {
    const state = parseDiscordWebCompactModeChanged(value)
    if (state) {
      callback(state)
    }
  }
  ipcRenderer.on('discordWebFastResponse:compactModeChanged', listener)
  return () => ipcRenderer.removeListener('discordWebFastResponse:compactModeChanged', listener)
}
