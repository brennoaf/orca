import { readFileSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  clampFloatingCommsSurfaceHeight,
  FLOATING_COMMS_SURFACE_DEFAULT_HEIGHT
} from '../../shared/floating-comms-surface'
import {
  FLOATING_WORKSPACE_APPS,
  type FloatingWorkspaceAppId
} from '../../shared/floating-workspace-apps'

const FILE_NAME = 'floating-comms-attached-height.json'

function normalize(value: unknown): Partial<Record<FloatingWorkspaceAppId, number>> {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const source = value as Record<string, unknown>
  return Object.fromEntries(
    FLOATING_WORKSPACE_APPS.flatMap((app) => {
      const height = source[app.id]
      return typeof height === 'number' && Number.isFinite(height)
        ? [[app.id, clampFloatingCommsSurfaceHeight(height)]]
        : []
    })
  )
}

export class FloatingCommsAttachedHeightStore {
  private readonly file: string
  private heights: Partial<Record<FloatingWorkspaceAppId, number>>
  private pending: Promise<void> = Promise.resolve()

  constructor(userDataPath: string) {
    this.file = join(userDataPath, FILE_NAME)
    try {
      this.heights = normalize(JSON.parse(readFileSync(this.file, 'utf8')))
    } catch {
      this.heights = {}
    }
  }

  get(appId: FloatingWorkspaceAppId): number {
    return this.heights[appId] ?? FLOATING_COMMS_SURFACE_DEFAULT_HEIGHT
  }

  set(appId: FloatingWorkspaceAppId, height: number): void {
    this.heights = { ...this.heights, [appId]: clampFloatingCommsSurfaceHeight(height) }
    const value = this.heights
    this.pending = this.pending
      .catch(() => undefined)
      .then(async () => {
        const temporary = `${this.file}.${process.pid}.tmp`
        try {
          await mkdir(dirname(this.file), { recursive: true })
          await writeFile(temporary, `${JSON.stringify(value)}\n`, 'utf8')
          await rename(temporary, this.file)
        } finally {
          await rm(temporary, { force: true })
        }
      })
  }

  flush(): Promise<void> {
    return this.pending
  }
}
