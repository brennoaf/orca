import { BrowserWindow } from 'electron'
import type { WebContents, WebContentsView } from 'electron'
import type { Store } from '../persistence'
import type {
  WhatsAppFastResponseAttach,
  WhatsAppFastResponseSnapshot,
  WhatsAppFastResponseState,
  WhatsAppFastResponseVisibility
} from '../../shared/whatsapp-fast-response'
import { applyCompactWhatsAppAdapter } from './compact-dom-adapter'
import {
  AdapterReconcileQueue,
  AdapterApplicationState,
  contentBoundsForFastResponse,
  finishAdapterRevision,
  InitialLoadAttempt,
  isAbortedNavigationError,
  assertCurrentOwner,
  ownerIdentity,
  visibilityIdentity
} from './compact-host-identities'
import type { WhatsAppFastResponseOwner } from './compact-host-identities'
import {
  resolveWhatsAppFastResponsePartition,
  reapplyWhatsAppFastResponsePreferences,
  WhatsAppFastResponsePreferences
} from './compact-host-session'
import { createCompactWhatsAppAttentionController } from './compact-host-attention'
import type { CompactWhatsAppAttention } from './compact-host-attention'
import { publishCompactWhatsAppState } from './compact-host-publication'
import { createCompactWhatsAppView } from './compact-host-view'
const WHATSAPP_URL = 'https://web.whatsapp.com/'
export class WhatsAppFastResponseHost {
  private view: WebContentsView | null = null
  private owner: WhatsAppFastResponseOwner | null = null
  private loaded = false
  private crashed = false
  private visible = false
  private readonly attention: CompactWhatsAppAttention
  private adapterCssKey: string | null = null
  private readonly preferences: WhatsAppFastResponsePreferences
  private readonly adapterState = new AdapterApplicationState()
  private readonly initialLoad = new InitialLoadAttempt()
  private readonly adapterReconciler = new AdapterReconcileQueue()
  constructor(
    private readonly store: Store,
    onUnread: () => void = () => {},
    isFastResponseFocused: () => boolean = () => false
  ) {
    this.preferences = new WhatsAppFastResponsePreferences(store, () => this.reapplyPreferences())
    this.attention = createCompactWhatsAppAttentionController({
      isCurrent: (view, revision) => this.adapterState.isFinished(this.view, view, revision),
      isFocused: isFastResponseFocused,
      onUnread,
      publish: (state) => this.publish(state)
    })
  }
  attach(sender: WebContents, request: WhatsAppFastResponseAttach): WhatsAppFastResponseSnapshot {
    const window = BrowserWindow.fromWebContents(sender)
    if (!window || window.isDestroyed()) {
      throw new Error('whatsapp_fast_response_owner_denied')
    }
    const view = this.ensureView()
    this.detach()
    window.contentView.addChildView(view)
    view.setBounds(contentBoundsForFastResponse(window.getContentBounds(), request))
    const closed = () => this.handleOwnerDestroyed(window)
    window.once('closed', closed)
    this.owner = {
      target: request.target,
      identity: ownerIdentity(request),
      webContentsId: sender.id,
      sender,
      request: visibilityIdentity(request),
      window,
      closed
    }
    this.visible = true
    view.setVisible(true)
    if (this.loaded && this.adapterState.applied !== this.adapterState.revision) {
      this.requestAdapterReconcile(view)
    }
    this.publish(
      this.loaded && this.adapterState.applied === this.adapterState.revision
        ? 'ready'
        : this.crashed
          ? 'crashed'
          : 'loading'
    )
    this.attention.schedule(view, this.visible, this.adapterState.applied)
    return this.snapshot()
  }
  update(sender: WebContents, request: WhatsAppFastResponseAttach): WhatsAppFastResponseSnapshot {
    assertCurrentOwner(this.owner, sender, request)
    const window = BrowserWindow.fromWebContents(sender)
    if (!window || window.isDestroyed()) {
      throw new Error('whatsapp_fast_response_owner_denied')
    }
    this.view?.setBounds(contentBoundsForFastResponse(window.getContentBounds(), request))
    return this.snapshot()
  }
  show(sender: WebContents, request: WhatsAppFastResponseVisibility): WhatsAppFastResponseSnapshot {
    assertCurrentOwner(this.owner, sender, request)
    this.visible = true
    this.view?.setVisible(true)
    if (this.view) {
      this.attention.schedule(this.view, this.visible, this.adapterState.applied)
    }
    return this.snapshot()
  }
  hide(sender: WebContents, request: WhatsAppFastResponseVisibility): WhatsAppFastResponseSnapshot {
    assertCurrentOwner(this.owner, sender, request)
    this.visible = false
    this.view?.setVisible(false)
    if (this.view) {
      this.attention.schedule(this.view, this.visible, this.adapterState.applied)
    }
    return this.snapshot()
  }
  collapse(
    sender: WebContents,
    request: WhatsAppFastResponseVisibility
  ): WhatsAppFastResponseSnapshot {
    return this.hide(sender, request)
  }
  shutdown(): void {
    this.preferences.dispose()
    this.detach()
    this.invalidateAdapter()
    this.removeAdapterCss()
    this.view?.webContents.close()
    this.view = null
    this.loaded = false
    this.crashed = false
    this.visible = false
    this.attention.reset()
    this.attention.stop()
  }
  snapshot(): WhatsAppFastResponseSnapshot {
    return this.attention.hostSnapshot([
      this.owner !== null,
      this.crashed,
      this.loaded,
      this.visible
    ])
  }
  private ensureView(): WebContentsView {
    if (this.view && !this.view.webContents.isDestroyed()) {
      return this.view
    }
    const partition = resolveWhatsAppFastResponsePartition(this.store)
    const view = createCompactWhatsAppView({
      partition,
      didFinishLoad: (view) => this.finishCurrentRevision(view, true),
      didStartNavigation: (_view, isInPlace, isMainFrame) => {
        if (!isMainFrame || isInPlace) {
          return
        }
        this.invalidateAdapter()
        this.initialLoad.associateNavigation(this.adapterState.revision)
        void this.removeAdapterCss()
      },
      didFailLoad: (view, errorCode, isMainFrame) => {
        if (!isMainFrame || this.view !== view || errorCode === -3) {
          return
        }
        this.loaded = false
        this.publish('error')
      },
      renderProcessGone: (view) => {
        if (this.view !== view) {
          return
        }
        this.crashed = true
        this.invalidateAdapter()
        this.attention.reset()
        void this.removeAdapterCss()
        this.visible = false
        this.publish('crashed')
        this.detach()
        view.webContents.close()
        this.view = null
      }
    })
    this.view = view
    const attempt = this.initialLoad.begin(this.adapterState.revision)
    void view.webContents
      .loadURL(WHATSAPP_URL)
      .then(() => {
        if (this.view === view && this.initialLoad.isCurrent(attempt, this.adapterState.revision)) {
          this.finishCurrentRevision(view)
        }
      })
      .catch((error: unknown) => {
        if (this.view === view && this.initialLoad.isCurrent(attempt, this.adapterState.revision)) {
          if (isAbortedNavigationError(error)) {
            return
          }
          this.loaded = false
          this.publish('error')
        }
      })
    return view
  }
  private reapplyPreferences(): void {
    reapplyWhatsAppFastResponsePreferences({
      view: this.view,
      loaded: this.loaded,
      invalidate: () => this.adapterState.invalidate(),
      finish: () => this.adapterState.finish(),
      reconcile: (view) => this.requestAdapterReconcile(view)
    })
  }
  private detach(): void {
    const owner = this.owner
    if (!owner) {
      return
    }
    owner.window.removeListener('closed', owner.closed)
    if (this.view && !owner.window.isDestroyed()) {
      owner.window.contentView.removeChildView(this.view)
    }
    this.owner = null
  }
  private handleOwnerDestroyed(window: BrowserWindow): void {
    if (this.owner?.window !== window) {
      return
    }
    this.owner = null
    this.visible = false
    this.view?.setVisible(false)
    if (this.view) {
      this.attention.schedule(this.view, this.visible, this.adapterState.applied)
    }
  }
  private requestAdapterReconcile(view: WebContentsView): void {
    this.adapterReconciler.request(
      () => this.reconcileAdapter(view),
      () => this.adapterState.canApply(this.view, view)
    )
  }
  private finishCurrentRevision(view: WebContentsView, force = false): void {
    if (finishAdapterRevision(this.adapterState, this.view, view, force)) {
      this.requestAdapterReconcile(view)
    }
  }
  private async reconcileAdapter(view: WebContentsView): Promise<void> {
    if (!this.adapterState.canApply(this.view, view)) {
      return
    }
    const revision = this.adapterState.revision
    try {
      const adapter = await applyCompactWhatsAppAdapter(
        view.webContents,
        this.adapterCssKey,
        () => this.adapterState.isCurrent(this.view, view, revision),
        this.preferences.hideArchivedChats
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
      this.publish('ready')
      this.attention.schedule(view, this.visible, this.adapterState.applied)
    } catch {
      if (this.adapterState.isFinished(this.view, view, revision)) {
        this.loaded = false
        this.adapterState.failed = revision
        this.publish('error')
      }
    }
  }
  private invalidateAdapter(): void {
    this.adapterState.invalidate()
    this.adapterReconciler.reset()
    this.loaded = false
    this.attention.stop()
  }
  private async removeAdapterCss(): Promise<void> {
    const key = this.adapterCssKey
    this.adapterCssKey = null
    if (key && this.view && !this.view.webContents.isDestroyed()) {
      await this.view.webContents.removeInsertedCSS(key).catch(() => {})
    }
  }
  private publish(state: WhatsAppFastResponseState): void {
    publishCompactWhatsAppState(this.owner, this.attention.snapshot(), state)
  }
}
