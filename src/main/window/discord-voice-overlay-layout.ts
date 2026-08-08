import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeFileAtomically } from '../codex-accounts/fs-utils'

const LAYOUT_FILE = 'discord-voice-overlay-layout.json'

export type DiscordVoiceOverlayBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type DiscordVoiceOverlayLayout = {
  bounds: DiscordVoiceOverlayBounds | null
  compact: boolean
}

const DEFAULT_LAYOUT: DiscordVoiceOverlayLayout = { bounds: null, compact: false }

let cached: DiscordVoiceOverlayLayout | null = null

function layoutPath(): string {
  return join(app.getPath('userData'), LAYOUT_FILE)
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeBounds(value: unknown): DiscordVoiceOverlayBounds | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const source = value as Record<string, unknown>
  const x = finiteNumber(source.x)
  const y = finiteNumber(source.y)
  const width = finiteNumber(source.width)
  const height = finiteNumber(source.height)
  return x !== null && y !== null && width !== null && height !== null
    ? { x, y, width, height }
    : null
}

export function readDiscordVoiceOverlayLayout(): DiscordVoiceOverlayLayout {
  if (cached) {
    return cached
  }
  const path = layoutPath()
  if (!existsSync(path)) {
    cached = DEFAULT_LAYOUT
    return cached
  }
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    const source =
      typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
    cached = { bounds: normalizeBounds(source.bounds), compact: source.compact === true }
  } catch (error) {
    console.warn('[discord-voice] Ignoring an unreadable overlay layout file', error)
    cached = DEFAULT_LAYOUT
  }
  return cached
}

export function updateDiscordVoiceOverlayLayout(
  updates: Partial<DiscordVoiceOverlayLayout>
): DiscordVoiceOverlayLayout {
  const next = { ...readDiscordVoiceOverlayLayout(), ...updates }
  cached = next
  writeFileAtomically(layoutPath(), `${JSON.stringify(next, null, 2)}\n`)
  return next
}
