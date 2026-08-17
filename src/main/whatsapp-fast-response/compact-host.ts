import { BrowserWindow } from 'electron'
import type { WebContents, WebContentsView } from 'electron'
import type { Store } from '../persistence'
import type {
  WhatsAppFastResponseAttach,
  WhatsAppFastResponseContentMode,
  WhatsAppFastResponseSnapshot,
  WhatsAppFastResponseState,
  WhatsAppFastResponseVisibility
} from '../../shared/whatsapp-fast-response'
import type { CompactWhatsAppMode } from './compact-dom-adapter'
import { assertCurrentOwner, ownerIdentity, visibilityIdentity } from './compact-host-identities'
import {
  reapplyWhatsAppFastResponsePreferences,
  WhatsAppFastResponsePreferences
} from './compact-host-session'
import { createCompactWhatsAppAttentionController } from './compact-host-attention'
import type { CompactWhatsAppAttention } from './compact-host-attention'
import { publishCompactWhatsAppState } from './compact-host-publication'
import { WhatsAppFastResponseHostOwnerLifecycle } from './compact-host-owner-lifecycle'

export class WhatsAppFastResponseHost extends WhatsAppFastResponseHostOwnerLifecycle {
  private readonly attention: CompactWhatsAppAttention
  private readonly preferences: WhatsAppFastResponsePreferences
  constructor(
    store: Store,
    onUnread: () => void = () => {},
    isFastResponseFocused: () => boolean = () => false
  ) {
    super(store)
    this.preferences = new WhatsAppFastResponsePreferences(store, () => this.reapplyPreferences())
    this.attention = createCompactWhatsAppAttentionController({
      isCurrent: (view, revision) => this.adapterState.isFinished(this.view, view, revision),
      isFocused: isFastResponseFocused,
      onContentMode: (mode) => this.updateContentMode(mode),
      onUnread,
      publish: (state) => this.publish(state)
    })
  }
  attach(sender: WebContents, request: WhatsAppFastResponseAttach): WhatsAppFastResponseSnapshot {
    if (request.target === 'browser') {
      throw new Error('whatsapp_fast_response_browser_transition_required')
    }
    const window = BrowserWindow.fromWebContents(sender)
    if (!window || window.isDestroyed()) {
      throw new Error('whatsapp_fast_response_owner_denied')
    }
    const bounds = this.boundsForCurrentOwner(sender, window, request)
    const returningFromBrowser = this.owner?.target === 'browser'
    this.transitionRevision += 1
    const view = this.ensureView()
    if (this.loaded && this.adapterState.finished !== this.adapterState.revision) {
      this.adapterState.finish()
    }
    view.setVisible(false)
    view.setBounds(bounds)
    this.detach()
    window.contentView.addChildView(view)
    const closed =
      request.target === 'attached' && request.mode === 'attached-dom'
        ? null
        : () => this.handleOwnerDestroyed(window)
    if (closed) {
      window.once('closed', closed)
    }
    this.owner = {
      target: request.target,
      identity: ownerIdentity(request),
      webContentsId: sender.id,
      sender,
      request: visibilityIdentity(request),
      window,
      closed
    }
    if (returningFromBrowser) {
      this.contentMode = 'loading'
    }
    this.visible = true
    view.setVisible(this.adapterState.applied === this.adapterState.revision)
    if (this.adapterState.failed === this.adapterState.revision) {
      this.adapterState.finish()
    }
    if (this.adapterState.canApply(this.view, view)) {
      this.requestAdapterReconcile(view)
    }
    if (this.shouldRetryPageLoad()) {
      this.retryFailedPageForOwner(view)
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
  async attachBrowser(
    sender: WebContents,
    request: Extract<WhatsAppFastResponseAttach, { target: 'browser' }>
  ): Promise<WhatsAppFastResponseSnapshot> {
    const transition = this.transitionRevision + 1
    this.transitionRevision = transition
    const window = BrowserWindow.fromWebContents(sender)
    if (!window || window.isDestroyed()) {
      throw new Error('whatsapp_fast_response_owner_denied')
    }
    const view = this.ensureView()
    return this.attachBrowserView({
      view,
      prepareOwner: () => {
        this.detach()
        this.owner = {
          target: request.target,
          identity: ownerIdentity(request),
          webContentsId: sender.id,
          sender,
          request: visibilityIdentity(request),
          window,
          closed: null
        }
      },
      isCurrent: () => this.isCurrentBrowserTransition(transition, view, request),
      addView: () => {
        view.setBounds(this.boundsForCurrentOwner(sender, window, request))
        window.contentView.addChildView(view)
      },
      snapshot: () => this.snapshot()
    })
  }
  update(sender: WebContents, request: WhatsAppFastResponseAttach): WhatsAppFastResponseSnapshot {
    assertCurrentOwner(this.owner, sender, request)
    const window = BrowserWindow.fromWebContents(sender)
    if (!window || window.isDestroyed()) {
      throw new Error('whatsapp_fast_response_owner_denied')
    }
    this.view?.setBounds(this.boundsForCurrentOwner(sender, window, request))
    this.view?.setVisible(this.visible && this.canShowOwner())
    this.publishPresentationState()
    return this.snapshot()
  }
  show(sender: WebContents, request: WhatsAppFastResponseVisibility): WhatsAppFastResponseSnapshot {
    assertCurrentOwner(this.owner, sender, request)
    this.visible = true
    this.view?.setVisible(this.canShowOwner())
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
  releaseBrowser(sender: WebContents, request: WhatsAppFastResponseVisibility): void {
    if (
      request.target !== 'browser' ||
      this.owner?.target !== 'browser' ||
      this.owner.identity !== ownerIdentity(request) ||
      this.owner.webContentsId !== sender.id
    ) {
      return
    }
    this.transitionRevision += 1
    this.visible = false
    this.view?.setVisible(false)
    this.detach()
  }
  shutdown(): void {
    this.preferences.dispose()
    this.detach()
    this.invalidateAdapter()
    this.removeAdapterCss()
    this.view?.webContents.close()
    this.view = null
    this.loaded = false
    this.pageLoadFailed = false
    this.pageLoadAborted = false
    this.pendingMainNavigations = 0
    this.crashed = false
    this.visible = false
    this.contentMode = 'loading'
    this.attention.reset()
    this.attention.stop()
  }
  snapshot(): WhatsAppFastResponseSnapshot {
    return this.attention.hostSnapshot([
      this.owner !== null,
      this.contentMode,
      this.crashed,
      this.loaded,
      this.visible
    ])
  }
  private reapplyPreferences(): void {
    if (!this.isCompactOwner()) {
      return
    }
    this.view?.setVisible(false)
    reapplyWhatsAppFastResponsePreferences({
      view: this.view,
      loaded: this.loaded,
      invalidate: () => this.adapterState.invalidate(),
      finish: () => this.adapterState.finish(),
      reconcile: (view) => this.requestAdapterReconcile(view)
    })
  }
  private publishPresentationState(): void {
    this.publish(this.crashed ? 'crashed' : this.loaded ? 'ready' : 'loading')
  }
  private retryFailedPageForOwner(view: WebContentsView): void {
    const owner = this.owner
    this.retryFailedPage(view, () => this.owner === owner)
  }
  protected scheduleAttention(view: WebContentsView): void {
    this.attention.schedule(view, this.visible, this.adapterState.applied)
  }
  protected resetAttention(): void {
    this.attention.reset()
  }
  protected stopAttention(): void {
    this.attention.stop()
  }
  protected hideArchivedChats(): boolean {
    return this.preferences.hideArchivedChats
  }
  protected publish(state: WhatsAppFastResponseState): void {
    publishCompactWhatsAppState(this.owner, this.attention.snapshot(), this.contentMode, state)
  }
  private updateContentMode(mode: CompactWhatsAppMode): void {
    const contentMode = compactContentMode(mode)
    if (contentMode === this.contentMode) {
      return
    }
    this.contentMode = contentMode
    this.publishPresentationState()
  }
}

function compactContentMode(mode: CompactWhatsAppMode): WhatsAppFastResponseContentMode {
  return mode === 'loading' || mode === 'qr' ? mode : 'compact'
}
