import type { WebContentsView } from 'electron'
import { buildCompactDiscordScript } from './compact-dom-adapter'
import type { CompactDiscordAdapterState } from './compact-dom-mode'

export type CompactDiscordAdapterInstallState = CompactDiscordAdapterState | 'cancelled'

type Hydration = {
  cancelled: boolean
  view: WebContentsView
}

export class CompactDiscordAdapterHydration {
  private current: Hydration | null = null

  async install(view: WebContentsView): Promise<CompactDiscordAdapterInstallState> {
    const hydration: Hydration = { cancelled: false, view }
    this.current = hydration
    try {
      const value: unknown = await view.webContents.executeJavaScriptInIsolatedWorld(
        999,
        [{ code: buildCompactDiscordScript() }],
        false
      )
      if (hydration.cancelled) {
        return 'cancelled'
      }
      return value === 'installed' ? 'installed' : 'unsupported'
    } finally {
      if (this.current === hydration) {
        this.current = null
      }
    }
  }

  isPending(view: WebContentsView): boolean {
    return this.current?.view === view
  }

  clear(view: WebContentsView): void {
    if (this.current?.view === view) {
      this.current = null
    }
  }

  cancel(view: WebContentsView): boolean {
    const hydration = this.current
    if (!hydration || hydration.view !== view || hydration.cancelled) {
      return false
    }
    hydration.cancelled = true
    if (!view.webContents.isDestroyed()) {
      void view.webContents
        .executeJavaScriptInIsolatedWorld(
          999,
          [{ code: 'window.__orcaDiscordFastResponseCleanup?.()' }],
          false
        )
        .catch(() => undefined)
    }
    return true
  }
}
