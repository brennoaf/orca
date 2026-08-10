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

const WHATSAPP_URL = 'https://web.whatsapp.com/'

type Owner = {
  target: WhatsAppFastResponseAttach['target']
  identity: string
  webContentsId: number
  sender: WebContents
  request: WhatsAppFastResponseVisibility
  window: BrowserWindow
  closed: () => void
}

export class WhatsAppFastResponseHost {
  private view: WebContentsView | null = null
  private owner: Owner | null = null
  private loaded = false
  private crashed = false
  private visible = false
  private adapterCssKey: string | null = null
  private adapterRevision = 0
  constructor(private readonly store: Store) {}
  attach(sender: WebContents, request: WhatsAppFastResponseAttach): WhatsAppFastResponseSnapshot {
    const window = BrowserWindow.fromWebContents(sender)
    if (!window || window.isDestroyed()) {
      throw new Error('whatsapp_fast_response_owner_denied')
    }
    const view = this.ensureView()
    this.detach()
    window.contentView.addChildView(view)
    view.setBounds(this.toContentBounds(window, request))
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
    this.publish(this.loaded ? 'ready' : this.crashed ? 'crashed' : 'loading')
    return this.snapshot()
  }
  update(sender: WebContents, request: WhatsAppFastResponseAttach): WhatsAppFastResponseSnapshot {
    this.requireOwner(sender, request)
    const window = BrowserWindow.fromWebContents(sender)
    if (!window || window.isDestroyed()) {
      throw new Error('whatsapp_fast_response_owner_denied')
    }
    this.view?.setBounds(this.toContentBounds(window, request))
    return this.snapshot()
  }
  show(sender: WebContents, request: WhatsAppFastResponseVisibility): WhatsAppFastResponseSnapshot {
    this.requireOwner(sender, request)
    this.visible = true
    this.view?.setVisible(true)
    return this.snapshot()
  }
  hide(sender: WebContents, request: WhatsAppFastResponseVisibility): WhatsAppFastResponseSnapshot {
    this.requireOwner(sender, request)
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
      if (this.view !== view) {
        return
      }
      this.loaded = true
      this.crashed = false
      this.publish('ready')
      void this.applyAdapter(view)
    })
    view.webContents.on('did-start-navigation', () => {
      this.adapterRevision += 1
      void this.removeAdapterCss()
    })
    view.webContents.on('did-fail-load', () => {
      if (this.view === view) {
        this.loaded = false
        this.publish('error')
      }
    })
    view.webContents.on('render-process-gone', () => {
      if (this.view !== view) {
        return
      }
      this.crashed = true
      this.loaded = false
      this.visible = false
      this.publish('crashed')
      this.detach()
      view.webContents.close()
      this.view = null
    })
    this.view = view
    void view.webContents.loadURL(WHATSAPP_URL).catch(() => {
      if (this.view === view) {
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
  private async applyAdapter(view: WebContentsView): Promise<void> {
    const revision = this.adapterRevision
    try {
      const adapter = await applyCompactWhatsAppAdapter(view.webContents, this.adapterCssKey)
      if (this.view !== view || revision !== this.adapterRevision) {
        await view.webContents.removeInsertedCSS(adapter.cssKey).catch(() => {})
        return
      }
      this.adapterCssKey = adapter.cssKey
      if (adapter.mode === 'unsupported') {
        this.publish('error')
      }
    } catch {
      if (this.view === view) {
        this.publish('error')
      }
    }
  }
  private async removeAdapterCss(): Promise<void> {
    const key = this.adapterCssKey
    this.adapterCssKey = null
    if (key && this.view && !this.view.webContents.isDestroyed()) {
      await this.view.webContents.removeInsertedCSS(key).catch(() => {})
    }
  }
  private requireOwner(
    sender: WebContents,
    request: WhatsAppFastResponseAttach | WhatsAppFastResponseVisibility
  ): void {
    const current = this.owner
    if (
      !current ||
      current.target !== request.target ||
      current.identity !== ownerIdentity(request) ||
      current.webContentsId !== sender.id
    ) {
      throw new Error('whatsapp_fast_response_stale')
    }
  }
  private toContentBounds(
    window: BrowserWindow,
    request: WhatsAppFastResponseAttach
  ): Electron.Rectangle {
    const content = window.getContentBounds()
    const zoom = request.rendererZoomFactor
    const rect = request.rectCss
    const x = rect.x * zoom
    const y = rect.y * zoom
    const right = Math.min(content.width, (rect.x + rect.width) * zoom)
    const bottom = Math.min(content.height, (rect.y + rect.height) * zoom)
    const left = Math.max(0, x)
    const top = Math.max(0, y)
    if (x < 0 || y < 0 || left >= right || top >= bottom) {
      throw new Error('whatsapp_fast_response_rect_denied')
    }
    return { x: left, y: top, width: right - left, height: bottom - top }
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

function ownerIdentity(
  request: WhatsAppFastResponseAttach | WhatsAppFastResponseVisibility
): string {
  return request.target === 'attached'
    ? `attached:${request.requestId}:${request.surfaceId}:${request.mode}`
    : `dock:${request.generation}:${request.revision}:${request.tabId}:${request.activeLeafAppId}`
}

function isWhatsAppUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'web.whatsapp.com'
  } catch {
    return false
  }
}

function visibilityIdentity(request: WhatsAppFastResponseAttach): WhatsAppFastResponseVisibility {
  if (request.target === 'attached') {
    const { target, appId, requestId, surfaceId, mode } = request
    return { target, appId, requestId, surfaceId, mode }
  }
  const { target, appId, generation, revision, tabId, activeLeafAppId } = request
  return { target, appId, generation, revision, tabId, activeLeafAppId }
}
