import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

export type WindowsMediaPlaybackStatus = 'playing' | 'paused' | 'stopped' | 'closed' | 'unknown'

export type WindowsMediaArtwork = {
  mimeType: string
  bytes: Uint8Array
}

export type WindowsMediaSession = {
  sessionId: string
  sourceAppUserModelId: string
  playbackStatus: WindowsMediaPlaybackStatus
  title: string
  artist: string
  albumTitle: string
  mediaIdentity: string
  positionMs: number
  durationMs: number
  artwork: WindowsMediaArtwork | null
  capabilities: {
    previous: boolean
    togglePlayPause: boolean
    next: boolean
  }
}

export type WindowsMediaControlBinding = {
  listSessions(): Promise<readonly WindowsMediaSession[]>
  audioPeak(sessionId: string): Promise<number | null>
  previous(sessionId: string): Promise<boolean>
  togglePlayPause(sessionId: string): Promise<boolean>
  next(sessionId: string): Promise<boolean>
}

type NativeModuleLoader = (path: string) => unknown

export type WindowsMediaControlBindingLoader = () => Promise<WindowsMediaControlBinding | null>

const requireFromMain = createRequire(__filename)

export function resolveWindowsMediaControlBindingPath(options: {
  packaged: boolean
  resourcesPath: string
  projectRoot: string
}): string {
  return options.packaged
    ? join(options.resourcesPath, 'native', 'windows-media-control.node')
    : join(
        options.projectRoot,
        'native',
        'windows-media-control',
        'build',
        'Release',
        'windows_media_control.node'
      )
}

function isBinding(value: unknown): value is WindowsMediaControlBinding {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.listSessions === 'function' &&
    typeof candidate.audioPeak === 'function' &&
    typeof candidate.previous === 'function' &&
    typeof candidate.togglePlayPause === 'function' &&
    typeof candidate.next === 'function'
  )
}

export function loadWindowsMediaControlBindingFrom(options: {
  platform: NodeJS.Platform
  packaged: boolean
  resourcesPath: string
  projectRoot: string
  exists?: (path: string) => boolean
  load?: NativeModuleLoader
}): WindowsMediaControlBinding | null {
  if (options.platform !== 'win32') {
    return null
  }
  const bindingPath = resolveWindowsMediaControlBindingPath(options)
  if (!(options.exists ?? existsSync)(bindingPath)) {
    return null
  }
  const binding = (options.load ?? requireFromMain)(bindingPath)
  if (!isBinding(binding)) {
    throw new Error('Invalid Windows media control binding')
  }
  return binding
}

async function loadDefaultBinding(): Promise<WindowsMediaControlBinding | null> {
  return loadWindowsMediaControlBindingFrom({
    platform: process.platform,
    packaged: process.defaultApp !== true,
    resourcesPath: process.resourcesPath ?? '',
    projectRoot: process.cwd()
  })
}

let loader: WindowsMediaControlBindingLoader = loadDefaultBinding

export function setWindowsMediaControlBindingLoader(next: WindowsMediaControlBindingLoader): void {
  loader = next
}

export function loadWindowsMediaControlBinding(): Promise<WindowsMediaControlBinding | null> {
  return loader()
}
