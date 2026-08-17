import type { WebContentsView } from 'electron'
import type { CompactDiscordAdapterInstallState } from './compact-adapter-hydration'
import type { CompactDiscordAdapterState } from './compact-dom-mode'
import { discordWebContentModeForUrl } from './content-mode'
import { resolveDiscordWebFastResponsePartition } from './compact-host-session'
import { createDiscordWebFastResponseView } from './compact-host-view'
import { DiscordWebFastResponseSpaNavigation } from './compact-host-spa-navigation'

const DISCORD_URL = 'https://discord.com/app'

export abstract class DiscordWebFastResponseHostLifecycle extends DiscordWebFastResponseSpaNavigation {
  protected ensureView(): WebContentsView {
    if (this.view && !this.view.webContents.isDestroyed()) {
      return this.view
    }
    const view = createDiscordWebFastResponseView({
      partition: resolveDiscordWebFastResponsePartition(this.store),
      didFinishLoad: (current) => this.scheduleFinishLoad(current),
      didStartNavigation: (current, _url, isInPlace, isMainFrame) => {
        if (this.view !== current || !isMainFrame || isInPlace) {
          return
        }
        this.adapterHydration.cancel(current)
        this.disableVoiceSelection(current)
        this.compactIntentAvailability.disable(current)
        this.revision += 1
        this.clearCompactReturnMode()
        this.loaded = false
        this.contentMode = 'loading'
        this.adapterState = 'unsupported'
        this.publish('loading')
        this.scheduleClearCompactAdapter(current, true)
      },
      didNavigateInPage: (current, url, isMainFrame) => {
        if (this.view !== current || !isMainFrame) {
          return
        }
        this.scheduleInPageNavigation(current, url)
      },
      didFailLoad: (current, errorCode, isMainFrame) => {
        if (this.view !== current || !isMainFrame || errorCode === -3) {
          return
        }
        this.adapterHydration.cancel(current)
        this.disableVoiceSelection(current)
        this.compactIntentAvailability.disable(current)
        this.loaded = false
        this.clearCompactReturnMode()
        this.publish('error')
      },
      renderProcessGone: (current) => {
        if (this.view !== current) {
          return
        }
        this.adapterHydration.cancel(current)
        this.disableVoiceSelection(current)
        this.compactIntentAvailability.disable(current)
        this.revision += 1
        this.clearCompactReturnMode()
        this.crashed = true
        this.loaded = false
        this.visible = false
        this.publish('crashed')
        this.enqueue(async () => {
          await this.clearCompactAdapter(current)
          if (this.view !== current) {
            return
          }
          this.detach()
          current.webContents.close()
          this.view = null
        })
      },
      destroyed: (current) => {
        if (this.view !== current) {
          return
        }
        this.adapterHydration.clear(current)
        this.invalidateVoiceSelection()
        this.compactIntentAvailability.invalidate()
        this.clearCompactReturnMode()
        this.crashed = true
        this.loaded = false
        this.visible = false
        this.publish('crashed')
        this.detach()
        this.view = null
      }
    })
    this.view = view
    void view.webContents.loadURL(DISCORD_URL).catch(() => {
      if (this.view === view) {
        this.disableVoiceSelection(view)
        this.compactIntentAvailability.disable(view)
        this.clearCompactReturnMode()
        this.publish('error')
      }
    })
    return view
  }

  protected shutdownLifecycle(): void {
    this.revision += 1
    this.removeVoiceSelectionListener()
    if (this.view) {
      this.adapterHydration.cancel(this.view)
    }
    this.enqueue(async () => {
      const view = this.view
      if (view) {
        this.disableVoiceSelection(view)
        this.compactIntentAvailability.disable(view)
        await this.clearCompactAdapter(view)
      }
      this.detach()
      this.view = null
      if (view && !view.webContents.isDestroyed()) {
        view.webContents.close()
      }
      this.loaded = false
      this.crashed = false
      this.visible = false
      this.contentMode = 'loading'
      this.clearCompactReturnMode()
    })
  }

  protected scheduleFinishLoad(view: WebContentsView): void {
    const revision = ++this.revision
    this.enqueue(async () => {
      try {
        await this.finishLoad(view, revision)
      } catch {
        if (this.view === view && revision === this.revision) {
          this.publish('error')
        }
      }
    })
  }

  protected async finishLoad(view: WebContentsView, expectedRevision: number): Promise<void> {
    const mode = discordWebContentModeForUrl(view.webContents.getURL())
    if (this.view !== view || expectedRevision !== this.revision) {
      return
    }
    const adapterState =
      mode === 'ready' ? await this.installCompactAdapter(view, expectedRevision) : 'unsupported'
    if (adapterState === 'cancelled') {
      return
    }
    if (this.view !== view || expectedRevision !== this.revision) {
      return
    }
    this.loaded = true
    this.crashed = false
    this.contentMode = mode === 'ready' && adapterState !== 'installed' ? 'unsupported' : mode
    if (this.contentMode !== 'ready') {
      this.clearCompactReturnMode()
    }
    this.adapterState = adapterState
    this.publish(this.contentMode)
    this.refreshVoiceSelectionAvailability()
    this.compactIntentAvailability.refresh(view, this.isCompactIntentAvailable())
  }

  protected scheduleReadyDocument(view: WebContentsView, revision: number): void {
    this.enqueue(async () => {
      try {
        const readyState = await view.webContents.executeJavaScriptInIsolatedWorld(
          999,
          [{ code: 'document.readyState' }],
          false
        )
        if (
          this.view === view &&
          revision === this.revision &&
          readyState === 'complete' &&
          !this.loaded
        ) {
          await this.finishLoad(view, revision)
        }
      } catch {
        if (this.view === view && revision === this.revision) {
          this.publish('error')
        }
      }
    })
  }

  protected scheduleClearCompactAdapter(view: WebContentsView, force = false): void {
    this.enqueue(async () => this.clearCompactAdapter(view, force))
  }

  protected async installCompactAdapter(
    view: WebContentsView,
    expectedRevision: number
  ): Promise<CompactDiscordAdapterInstallState> {
    if (this.view !== view || expectedRevision !== this.revision || !this.owner) {
      return 'unsupported'
    }
    const state = await this.adapterHydration.install(view)
    if (state === 'cancelled') {
      return state
    }
    if (this.view !== view || expectedRevision !== this.revision || !this.owner) {
      return 'unsupported'
    }
    if (state !== 'installed') {
      this.adapterState = state
      return state
    }
    return this.projectCompactMode(view, expectedRevision)
  }

  protected async projectCompactMode(
    view: WebContentsView,
    expectedRevision: number
  ): Promise<CompactDiscordAdapterState> {
    const appliedMode: unknown = await view.webContents.executeJavaScriptInIsolatedWorld(
      999,
      [{ code: `window.__orcaDiscordFastResponse.setMode(${JSON.stringify(this.compactMode)})` }],
      false
    )
    if (this.view !== view || expectedRevision !== this.revision || !this.owner) {
      return 'unsupported'
    }
    this.adapterState = appliedMode === 'installed' ? 'installed' : 'unsupported'
    return this.adapterState
  }

  protected async clearCompactAdapter(view: WebContentsView, force = false): Promise<void> {
    if (!force && this.adapterState !== 'installed' && !this.adapterHydration.isPending(view)) {
      return
    }
    this.adapterHydration.cancel(view)
    this.adapterState = 'unsupported'
    if (view.webContents.isDestroyed()) {
      return
    }
    await view.webContents
      .executeJavaScriptInIsolatedWorld(
        999,
        [{ code: 'window.__orcaDiscordFastResponseCleanup?.()' }],
        false
      )
      .catch(() => undefined)
  }

  protected async reinstallCompactAdapter(view: WebContentsView, url: string): Promise<void> {
    const expectedRevision = this.revision
    this.adapterHydration.cancel(view)
    this.disableVoiceSelection(view)
    this.compactIntentAvailability.disable(view)
    await this.clearCompactAdapter(view, true)
    if (this.view !== view || expectedRevision !== this.revision || !this.owner) {
      return
    }
    const mode = discordWebContentModeForUrl(url)
    const adapterState =
      mode === 'ready' ? await this.installCompactAdapter(view, expectedRevision) : 'unsupported'
    if (adapterState === 'cancelled' || this.view !== view || expectedRevision !== this.revision) {
      return
    }
    this.loaded = true
    this.contentMode = mode === 'ready' && adapterState !== 'installed' ? 'unsupported' : mode
    this.adapterState = adapterState
    if (this.contentMode !== 'ready') {
      this.clearCompactReturnMode()
    }
    this.publish(this.contentMode)
    this.refreshVoiceSelectionAvailability()
    this.compactIntentAvailability.refresh(view, this.isCompactIntentAvailable())
  }
}
