import { BrowserWindow, WebContentsView } from 'electron'
import type { WebContents } from 'electron'
import type { Store } from '../persistence'
import { browserSessionRegistry } from '../browser/browser-session-registry'
import {
  getFloatingWorkspaceAppPreference,
  type FloatingWorkspaceAppPreferences
} from '../../shared/floating-workspace-apps'
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
  assertCurrentOwner,
  isWhatsAppUrl,
  ownerIdentity,
  visibilityIdentity
} from './compact-host-identities'
import type { WhatsAppFastResponseOwner } from './compact-host-identities'
const WHATSAPP_URL = 'https://web.whatsapp.com/'
export class WhatsAppFastResponseHost {
  private view: WebContentsView | null = null
  private owner: WhatsAppFastResponseOwner | null = null
  private loaded = false
  private crashed = false
  private visible = false
  private adapterCssKey: string | null = null
  private readonly adapterState = new AdapterApplicationState()
  private readonly initialLoad = new InitialLoadAttempt()
  private readonly adapterReconciler = new AdapterReconcileQueue()
  constructor(private readonly store: Store) {}
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
    return this.snapshot()
  }
  hide(sender: WebContents, request: WhatsAppFastResponseVisibility): WhatsAppFastResponseSnapshot {
    assertCurrentOwner(this.owner, sender, request)
    this.visible = false
    this.view?.setVisible(false)
    return this.snapshot()
  }
  collapse(
    sender: WebContents,
    request: WhatsAppFastResponseVisibility
  ): WhatsAppFastResponseSnapshot {
    return this.hide(sender, request)
  }
  shutdown(): void {
    this.detach()
    this.invalidateAdapter()
    this.removeAdapterCss()
    this.view?.webContents.close()
    this.view = null
    this.loaded = false
    this.crashed = false
    this.visible = false
  }
  snapshot(): WhatsAppFastResponseSnapshot {
    return {
      attached: this.owner !== null,
      crashed: this.crashed,
      loaded: this.loaded,
      visible: this.visible
    }
  }
  private ensureView(): WebContentsView {
    if (this.view && !this.view.webContents.isDestroyed()) {
      return this.view
    }
    const partition = this.resolvePartition()
    const view = new WebContentsView({
      webPreferences: { contextIsolation: true, nodeIntegration: false, partition, sandbox: true }
    })
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    view.webContents.on('will-navigate', (event, url) => {
      if (!isWhatsAppUrl(url)) {
        event.preventDefault()
      }
    })
    view.webContents.on('will-redirect', (event, url) => {
      if (!isWhatsAppUrl(url)) {
        event.preventDefault()
      }
    })
    view.webContents.on('did-finish-load', () => {
      this.finishCurrentRevision(view, true)
    })
    view.webContents.on('did-start-navigation', (_event, _url, _isInPlace, isMainFrame) => {
      if (!isMainFrame || _isInPlace) {
        return
      }
      this.invalidateAdapter()
      this.initialLoad.associateNavigation(this.adapterState.revision)
      void this.removeAdapterCss()
    })
    view.webContents.on(
      'did-fail-load',
      (_event, _errorCode, _errorDescription, _url, isMainFrame) => {
        if (isMainFrame && this.view === view) {
          this.loaded = false
          this.publish('error')
        }
      }
    )
    view.webContents.on('render-process-gone', () => {
      if (this.view !== view) {
        return
      }
      this.crashed = true
      this.invalidateAdapter()
      void this.removeAdapterCss()
      this.visible = false
      this.publish('crashed')
      this.detach()
      view.webContents.close()
      this.view = null
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
      .catch(() => {
        if (this.view === view && this.initialLoad.isCurrent(attempt, this.adapterState.revision)) {
          this.loaded = false
          this.publish('error')
        }
      })
    return view
  }
  private resolvePartition(): string {
    const preferences = this.store.getUI().floatingWorkspaceApps as FloatingWorkspaceAppPreferences
    const preference = getFloatingWorkspaceAppPreference(preferences, 'whatsapp-web')
    const profileId = preference.sessionProfileIdOverride ?? preference.dedicatedSessionProfileId
    if (profileId) {
      const partition = browserSessionRegistry.resolveKnownPartition(profileId)
      if (!partition) {
        throw new Error('whatsapp_fast_response_profile_denied')
      }
      return partition
    }
    const profile = browserSessionRegistry.createProfile('isolated', 'WhatsApp Web', {
      userAgentMode: 'clean'
    })
    if (!profile) {
      throw new Error('whatsapp_fast_response_profile_unavailable')
    }
    this.store.updateUI({
      floatingWorkspaceApps: {
        ...preferences,
        'whatsapp-web': { ...preference, dedicatedSessionProfileId: profile.id }
      }
    })
    return profile.partition
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
      const adapter = await applyCompactWhatsAppAdapter(view.webContents, this.adapterCssKey, () =>
        this.adapterState.isCurrent(this.view, view, revision)
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
  }
  private async removeAdapterCss(): Promise<void> {
    const key = this.adapterCssKey
    this.adapterCssKey = null
    if (key && this.view && !this.view.webContents.isDestroyed()) {
      await this.view.webContents.removeInsertedCSS(key).catch(() => {})
    }
  }
  private publish(state: WhatsAppFastResponseState): void {
    const owner = this.owner
    if (!owner || owner.sender.isDestroyed()) {
      return
    }
    owner.sender.send('whatsappFastResponse:stateChanged', {
      identity: owner.request,
      state,
      recoverable: state !== 'ready'
    })
  }
}
