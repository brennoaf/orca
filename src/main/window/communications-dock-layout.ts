import { readFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { screen } from 'electron'
import {
  COMMUNICATIONS_DOCK_LAYOUT_VERSION,
  COMMUNICATIONS_DOCK_MAX_APPS,
  clampCommunicationsDockRatio,
  listCommunicationsDockApps,
  type CommunicationsDockBounds,
  type CommunicationsDockLayout,
  type CommunicationsDockLayoutNode,
  type CommunicationsDockTab
} from '../../shared/communications-dock'
import {
  FLOATING_WORKSPACE_APPS,
  type FloatingWorkspaceAppId
} from '../../shared/floating-workspace-apps'
import { rectHasVisibleAreaOnAnyDisplay } from './window-bounds-validation'

export const COMMUNICATIONS_DOCK_LAYOUT_FILE = 'communications-dock-layout.json'
const LEGACY_LAYOUT_FILE = 'floating-comms-detached-layout.json'
export const COMMUNICATIONS_DOCK_MIN_WIDTH = 320
export const COMMUNICATIONS_DOCK_MIN_HEIGHT = 240
export const COMMUNICATIONS_DOCK_MAX_WIDTH = 1_200
export const COMMUNICATIONS_DOCK_MAX_HEIGHT = 1_000
export const COMMUNICATIONS_DOCK_DEFAULT_WIDTH = 420
export const COMMUNICATIONS_DOCK_DEFAULT_HEIGHT = 640

const appIds = new Set(FLOATING_WORKSPACE_APPS.map((app) => app.id))

function appId(value: unknown): FloatingWorkspaceAppId | null {
  return typeof value === 'string' && appIds.has(value as FloatingWorkspaceAppId)
    ? (value as FloatingWorkspaceAppId)
    : null
}

function finiteInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

export function normalizeCommunicationsDockBounds(value: unknown): CommunicationsDockBounds | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const source = value as Record<string, unknown>
  const x = finiteInteger(source.x)
  const y = finiteInteger(source.y)
  const width = finiteInteger(source.width)
  const height = finiteInteger(source.height)
  if (
    x === null ||
    y === null ||
    width === null ||
    height === null ||
    width < COMMUNICATIONS_DOCK_MIN_WIDTH ||
    width > COMMUNICATIONS_DOCK_MAX_WIDTH ||
    height < COMMUNICATIONS_DOCK_MIN_HEIGHT ||
    height > COMMUNICATIONS_DOCK_MAX_HEIGHT
  ) {
    return null
  }
  const bounds = { x, y, width, height }
  return rectHasVisibleAreaOnAnyDisplay(bounds, width / 2, COMMUNICATIONS_DOCK_MIN_HEIGHT / 2)
    ? bounds
    : null
}

function normalizeNode(
  value: unknown,
  seen: Set<FloatingWorkspaceAppId>
): CommunicationsDockLayoutNode | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const source = value as Record<string, unknown>
  if (source.type === 'leaf') {
    const id = appId(source.appId)
    if (!id || seen.has(id) || seen.size >= COMMUNICATIONS_DOCK_MAX_APPS) {
      return null
    }
    seen.add(id)
    return { type: 'leaf', appId: id }
  }
  if (
    source.type !== 'split' ||
    (source.direction !== 'horizontal' && source.direction !== 'vertical')
  ) {
    return null
  }
  const first = normalizeNode(source.first, seen)
  const second = normalizeNode(source.second, seen)
  if (!first) {
    return second
  }
  if (!second) {
    return first
  }
  const ratio =
    typeof source.ratio === 'number' && Number.isFinite(source.ratio)
      ? clampCommunicationsDockRatio(source.ratio)
      : 0.5
  return { type: 'split', direction: source.direction, ratio, first, second }
}

function normalizeTab(
  value: unknown,
  seen: Set<FloatingWorkspaceAppId>
): CommunicationsDockTab | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const source = value as Record<string, unknown>
  if (typeof source.id !== 'string' || source.id.length < 1 || source.id.length > 128) {
    return null
  }
  const layout = normalizeNode(source.layout, seen)
  if (!layout) {
    return null
  }
  const apps = listCommunicationsDockApps(layout)
  const active = appId(source.activeLeafAppId)
  return {
    id: source.id,
    layout,
    activeLeafAppId: active && apps.includes(active) ? active : apps[0]
  }
}

export function normalizeCommunicationsDockLayout(value: unknown): CommunicationsDockLayout | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const source = value as Record<string, unknown>
  if (source.version !== COMMUNICATIONS_DOCK_LAYOUT_VERSION || !Array.isArray(source.tabs)) {
    return null
  }
  const bounds = normalizeCommunicationsDockBounds(source.bounds)
  if (!bounds) {
    return null
  }
  const seen = new Set<FloatingWorkspaceAppId>()
  const tabIds = new Set<string>()
  const tabs: CommunicationsDockTab[] = []
  for (const candidate of source.tabs.slice(0, COMMUNICATIONS_DOCK_MAX_APPS)) {
    const tab = normalizeTab(candidate, seen)
    if (tab && !tabIds.has(tab.id)) {
      tabIds.add(tab.id)
      tabs.push(tab)
    }
  }
  if (tabs.length === 0) {
    return null
  }
  const activeTabId =
    typeof source.activeTabId === 'string' && tabIds.has(source.activeTabId)
      ? source.activeTabId
      : tabs[0].id
  return { version: 1, bounds, tabs, activeTabId, collapsed: source.collapsed === true }
}

function defaultBounds(): CommunicationsDockBounds {
  const area = screen.getPrimaryDisplay().workArea
  return {
    x: Math.round(area.x + (area.width - COMMUNICATIONS_DOCK_DEFAULT_WIDTH) / 2),
    y: Math.round(area.y + (area.height - COMMUNICATIONS_DOCK_DEFAULT_HEIGHT) / 2),
    width: COMMUNICATIONS_DOCK_DEFAULT_WIDTH,
    height: COMMUNICATIONS_DOCK_DEFAULT_HEIGHT
  }
}

function legacyBounds(value: unknown): CommunicationsDockBounds | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const source = value as Record<string, unknown>
  for (const app of FLOATING_WORKSPACE_APPS) {
    const bounds = normalizeCommunicationsDockBounds(source[app.id])
    if (bounds) {
      return bounds
    }
  }
  return null
}

function initialLayout(bounds: CommunicationsDockBounds): CommunicationsDockLayout {
  const tabs = FLOATING_WORKSPACE_APPS.slice(0, COMMUNICATIONS_DOCK_MAX_APPS).map((app, index) => ({
    id: `communications-${index + 1}`,
    layout: { type: 'leaf' as const, appId: app.id },
    activeLeafAppId: app.id
  }))
  return { version: 1, bounds, tabs, activeTabId: tabs[0].id, collapsed: false }
}

export class CommunicationsDockLayoutStore {
  private readonly file: string
  private readonly legacyFile: string
  private layout: CommunicationsDockLayout
  private timer: ReturnType<typeof setTimeout> | null = null
  private pendingWrite: Promise<void> = Promise.resolve()
  private generation = 0

  constructor(userDataPath: string) {
    this.file = join(userDataPath, COMMUNICATIONS_DOCK_LAYOUT_FILE)
    this.legacyFile = join(userDataPath, LEGACY_LAYOUT_FILE)
    this.layout = this.read()
    if (!this.hasCurrentLayout()) {
      this.generation = 1
      this.timer = setTimeout(() => {
        this.timer = null
        this.enqueueWrite(this.generation)
      }, 250)
    }
  }

  get(): CommunicationsDockLayout {
    return this.layout
  }

  set(layout: CommunicationsDockLayout): void {
    const normalized = normalizeCommunicationsDockLayout(layout)
    if (!normalized) {
      throw new Error('communications_dock_layout_invalid')
    }
    this.layout = normalized
    this.generation += 1
    if (this.timer) {
      clearTimeout(this.timer)
    }
    this.timer = setTimeout(() => {
      this.timer = null
      this.enqueueWrite(this.generation)
    }, 250)
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
      this.enqueueWrite(this.generation)
    }
    await this.pendingWrite
  }

  private read(): CommunicationsDockLayout {
    try {
      const current = normalizeCommunicationsDockLayout(JSON.parse(readFileSync(this.file, 'utf8')))
      if (current) {
        return current
      }
    } catch {}
    let migratedBounds: CommunicationsDockBounds | null = null
    try {
      migratedBounds = legacyBounds(JSON.parse(readFileSync(this.legacyFile, 'utf8')))
    } catch {}
    return initialLayout(migratedBounds ?? defaultBounds())
  }

  private hasCurrentLayout(): boolean {
    try {
      return normalizeCommunicationsDockLayout(JSON.parse(readFileSync(this.file, 'utf8'))) !== null
    } catch {
      return false
    }
  }

  private enqueueWrite(generation: number): void {
    const layout = this.layout
    this.pendingWrite = this.pendingWrite
      .then(async () => {
        if (generation !== this.generation) {
          return
        }
        const tempFile = `${this.file}.${process.pid}.${generation}.tmp`
        try {
          await mkdir(dirname(this.file), { recursive: true })
          await writeFile(tempFile, `${JSON.stringify(layout)}\n`, 'utf8')
          if (generation === this.generation) {
            await rename(tempFile, this.file)
          }
        } finally {
          await rm(tempFile, { force: true })
        }
      })
      .catch((error: unknown) =>
        console.error('[communications-dock] Failed to persist layout:', error)
      )
  }
}
