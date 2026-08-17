import type { WebContentsView } from 'electron'
import type { Store } from '../persistence'
import type {
  WhatsAppFastResponseContentMode,
  WhatsAppFastResponseState
} from '../../shared/whatsapp-fast-response'
import { applyCompactWhatsAppAdapter, clearCompactWhatsAppAdapter } from './compact-dom-adapter'
import type { CompactWhatsAppMode } from './compact-dom-adapter'
import {
  AdapterApplicationState,
  AdapterReconcileQueue,
  finishAdapterRevision,
  InitialLoadAttempt,
  isAbortedNavigationError
} from './compact-host-identities'
import { resolveWhatsAppFastResponsePartition } from './compact-host-session'
import { createCompactWhatsAppView } from './compact-host-view'

const WHATSAPP_URL = 'https://web.whatsapp.com/'
export abstract class WhatsAppFastResponseHostLifecycle {
  protected view: WebContentsView | null = null
  protected loaded = false
  protected pageLoadFailed = false
  protected pageLoadAborted = false
  protected pendingMainNavigations = 0
  protected crashed = false
  protected visible = false
  protected contentMode: WhatsAppFastResponseContentMode = 'loading'
  protected adapterCssKey: string | null = null
  protected readonly adapterState = new AdapterApplicationState()
  protected readonly initialLoad = new InitialLoadAttempt()
  protected readonly adapterReconciler = new AdapterReconcileQueue()

  constructor(private readonly store: Store) {}

  protected abstract isCompactOwner(): boolean
  protected abstract isBrowserOwner(): boolean
  protected abstract publish(state: WhatsAppFastResponseState): void
  protected abstract scheduleAttention(view: WebContentsView): void
  protected abstract resetAttention(): void
  protected abstract stopAttention(): void
  protected abstract hideArchivedChats(): boolean

  protected ensureView(): WebContentsView {
    if (this.view && !this.view.webContents.isDestroyed()) {
      return this.view
    }
    const view = createCompactWhatsAppView({
      partition: resolveWhatsAppFastResponsePartition(this.store),
      didFinishLoad: (current) => this.finishCurrentRevision(current, true),
      didStartNavigation: (current, isInPlace, isMainFrame) => {
        if (!isMainFrame || isInPlace) {
          return
        }
        this.pendingMainNavigations += 1
        this.loaded = false
        this.pageLoadFailed = false
        this.pageLoadAborted = false
        this.contentMode = 'loading'
        this.publish('loading')
        if (!this.isCompactOwner()) {
          return
        }
        current.setVisible(false)
        this.invalidateAdapter()
        this.initialLoad.associateNavigation(this.adapterState.revision)
        void this.removeAdapterCss()
      },
      didFailLoad: (current, errorCode, isMainFrame) => {
        if (!isMainFrame || this.view !== current) {
          return
        }
        this.pendingMainNavigations = Math.max(0, this.pendingMainNavigations - 1)
        if (errorCode === -3) {
          this.pageLoadAborted = true
          return
        }
        this.loaded = false
        this.pageLoadFailed = true
        this.pageLoadAborted = false
        this.contentMode = 'loading'
        current.setVisible(this.isBrowserOwner() && this.visible)
        this.publish('error')
      },
      renderProcessGone: (current) => {
        if (this.view !== current) {
          return
        }
        this.crashed = true
        this.invalidateAdapter()
        this.loaded = false
        this.pageLoadFailed = false
        this.pageLoadAborted = false
        this.pendingMainNavigations = 0
        this.resetAttention()
        void this.removeAdapterCss()
        this.visible = false
        this.publish('crashed')
        this.detachAfterCrash()
        current.webContents.close()
        this.view = null
      }
    })
    this.view = view
    const attempt = this.initialLoad.begin(this.adapterState.revision)
    void view.webContents.loadURL(WHATSAPP_URL).then(
      () => {
        if (this.view === view && this.initialLoad.isCurrent(attempt, this.adapterState.revision)) {
          this.finishCurrentRevision(view)
        }
      },
      (error: unknown) => {
        if (this.view === view && this.initialLoad.isCurrent(attempt, this.adapterState.revision)) {
          if (isAbortedNavigationError(error)) {
            return
          }
          this.loaded = false
          this.publish('error')
        }
      }
    )
    return view
  }

  protected abstract detachAfterCrash(): void

  protected async attachBrowserView<T>({
    view,
    prepareOwner,
    isCurrent,
    addView,
    snapshot
  }: {
    view: WebContentsView
    prepareOwner: () => void
    isCurrent: () => boolean
    addView: () => void
    snapshot: () => T
  }): Promise<T> {
    view.setVisible(false)
    prepareOwner()
    this.visible = false
    this.contentMode = 'loading'
    this.invalidateAdapter()
    await this.adapterReconciler.settle()
    if (!isCurrent()) {
      throw new Error('whatsapp_fast_response_browser_transition_stale')
    }
    this.beginBrowserCleanup()
    try {
      await this.clearAdapter(view)
    } catch {
      if (!isCurrent()) {
        throw new Error('whatsapp_fast_response_browser_transition_stale')
      }
      this.publish('error')
      throw new Error('whatsapp_fast_response_browser_cleanup_failed')
    } finally {
      this.endBrowserCleanup()
      this.resumeCompactAdapter(view)
    }
    if (!isCurrent()) {
      throw new Error('whatsapp_fast_response_browser_transition_stale')
    }
    addView()
    this.visible = true
    view.setVisible(true)
    this.publish(this.crashed ? 'crashed' : this.loaded ? 'ready' : 'loading')
    return snapshot()
  }

  protected abstract beginBrowserCleanup(): void
  protected abstract endBrowserCleanup(): void
  protected requestAdapterReconcile(view: WebContentsView): void {
    this.adapterReconciler.request(
      () => this.reconcileAdapter(view),
      () => this.adapterState.canApply(this.view, view)
    )
  }
  protected async clearAdapter(view: WebContentsView): Promise<void> {
    this.adapterReconciler.reset()
    const cssKey = this.adapterCssKey
    await clearCompactWhatsAppAdapter(view.webContents, cssKey)
    if (this.adapterCssKey === cssKey) {
      this.adapterCssKey = null
    }
  }
  protected finishCurrentRevision(view: WebContentsView, force = false): void {
    if (this.view === view) {
      this.pageLoadFailed = false
      this.pageLoadAborted = false
      this.pendingMainNavigations = 0
    }
    if (!this.isCompactOwner()) {
      if (this.isBrowserOwner() && this.view === view) {
        this.loaded = true
        this.crashed = false
        view.setVisible(this.visible)
        this.publish('ready')
      }
      return
    }
    if (finishAdapterRevision(this.adapterState, this.view, view, force)) {
      this.requestAdapterReconcile(view)
    }
  }
  private async reconcileAdapter(view: WebContentsView): Promise<void> {
    if (this.browserCleanupActive() || !this.adapterState.canApply(this.view, view)) {
      return
    }
    const revision = this.adapterState.revision
    try {
      const adapter = await applyCompactWhatsAppAdapter(
        view.webContents,
        this.adapterCssKey,
        () => this.adapterState.isCurrent(this.view, view, revision),
        this.hideArchivedChats()
      )
      if (!adapter) {
        return
      }
      if (!this.adapterState.isFinished(this.view, view, revision)) {
        await view.webContents.removeInsertedCSS(adapter.cssKey).catch(() => {})
        return
      }
      this.adapterCssKey = adapter.cssKey
      this.adapterState.applied = revision
      this.loaded = true
      this.crashed = false
      this.contentMode = compactContentMode(adapter.mode)
      view.setVisible(this.visible)
      this.publish('ready')
      this.scheduleAttention(view)
    } catch {
      if (this.adapterState.isFinished(this.view, view, revision)) {
        this.loaded = false
        this.adapterState.failed = revision
        view.setVisible(false)
        this.publish('error')
      }
    }
  }

  protected abstract browserCleanupActive(): boolean

  protected resumeCompactAdapter(view: WebContentsView): void {
    if (this.isCompactOwner() && this.adapterState.canApply(this.view, view)) {
      this.requestAdapterReconcile(view)
    }
  }

  protected canShowOwner(): boolean {
    return this.isBrowserOwner() || this.adapterState.applied === this.adapterState.revision
  }

  protected retryFailedPage(view: WebContentsView, isCurrent: () => boolean): void {
    this.pageLoadFailed = false
    this.pageLoadAborted = false
    this.pendingMainNavigations = 0
    this.loaded = false
    this.contentMode = 'loading'
    view.setVisible(false)
    void view.webContents.loadURL(WHATSAPP_URL).then(
      () => {
        if (this.view === view && isCurrent() && this.isCompactOwner()) {
          this.finishCurrentRevision(view, true)
        }
      },
      () => {
        if (this.view === view && isCurrent() && this.isCompactOwner()) {
          this.loaded = false
          if (!this.pageLoadFailed) {
            this.pageLoadFailed = true
            this.pageLoadAborted = false
            this.publish('error')
          }
        }
      }
    )
  }

  protected shouldRetryPageLoad(): boolean {
    return this.pageLoadFailed || (this.pageLoadAborted && this.pendingMainNavigations === 0)
  }

  protected invalidateAdapter(): void {
    this.adapterState.invalidate()
    this.adapterReconciler.reset()
    this.stopAttention()
  }

  protected async removeAdapterCss(): Promise<void> {
    const key = this.adapterCssKey
    this.adapterCssKey = null
    if (key && this.view && !this.view.webContents.isDestroyed()) {
      await this.view.webContents.removeInsertedCSS(key).catch(() => {})
    }
  }
}

function compactContentMode(mode: CompactWhatsAppMode): WhatsAppFastResponseContentMode {
  return mode === 'loading' || mode === 'qr' ? mode : 'compact'
}
