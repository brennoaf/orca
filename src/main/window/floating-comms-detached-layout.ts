import { readFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'
import { FLOATING_WORKSPACE_APPS } from '../../shared/floating-workspace-apps'
import { rectHasVisibleAreaOnAnyDisplay, type WindowRect } from './window-bounds-validation'

export const FLOATING_COMMS_DETACHED_LAYOUT_FILE = 'floating-comms-detached-layout.json'
export const FLOATING_COMMS_DETACHED_MIN_WIDTH = 320
export const FLOATING_COMMS_DETACHED_MIN_HEIGHT = 240
export const FLOATING_COMMS_DETACHED_MAX_WIDTH = 1_200
export const FLOATING_COMMS_DETACHED_MAX_HEIGHT = 1_000
export const FLOATING_COMMS_DETACHED_DEFAULT_WIDTH = 420
export const FLOATING_COMMS_DETACHED_DEFAULT_HEIGHT = 420

type FloatingCommsDetachedLayout = Partial<Record<FloatingWorkspaceAppId, WindowRect>>

function finiteInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

function normalizeBounds(value: unknown): WindowRect | null {
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
    width < FLOATING_COMMS_DETACHED_MIN_WIDTH ||
    width > FLOATING_COMMS_DETACHED_MAX_WIDTH ||
    height < FLOATING_COMMS_DETACHED_MIN_HEIGHT ||
    height > FLOATING_COMMS_DETACHED_MAX_HEIGHT
  ) {
    return null
  }
  const bounds = { x, y, width, height }
  return rectHasVisibleAreaOnAnyDisplay(
    bounds,
    FLOATING_COMMS_DETACHED_MIN_WIDTH / 2,
    FLOATING_COMMS_DETACHED_MIN_HEIGHT / 2
  )
    ? bounds
    : null
}

export function normalizeFloatingCommsDetachedLayout(value: unknown): FloatingCommsDetachedLayout {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const source = value as Record<string, unknown>
  const normalized: FloatingCommsDetachedLayout = {}
  for (const app of FLOATING_WORKSPACE_APPS) {
    const bounds = normalizeBounds(source[app.id])
    if (bounds) {
      normalized[app.id] = bounds
    }
  }
  return normalized
}

export class FloatingCommsDetachedLayoutStore {
  private readonly file: string
  private layout: FloatingCommsDetachedLayout
  private timer: ReturnType<typeof setTimeout> | null = null
  private pendingWrite: Promise<void> = Promise.resolve()
  private generation = 0

  constructor(userDataPath: string) {
    this.file = join(userDataPath, FLOATING_COMMS_DETACHED_LAYOUT_FILE)
    this.layout = this.read()
  }

  get(appId: FloatingWorkspaceAppId): WindowRect | null {
    return this.layout[appId] ?? null
  }

  set(appId: FloatingWorkspaceAppId, bounds: WindowRect): void {
    const normalized = normalizeBounds(bounds)
    if (!normalized) {
      return
    }
    this.layout = { ...this.layout, [appId]: normalized }
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

  private read(): FloatingCommsDetachedLayout {
    try {
      return normalizeFloatingCommsDetachedLayout(JSON.parse(readFileSync(this.file, 'utf8')))
    } catch {
      return {}
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
      .catch((error: unknown) => {
        console.error('[floating-comms] Failed to persist detached layout:', error)
      })
  }
}
