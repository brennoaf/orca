import { BrowserWindow } from 'electron'
import type { Rectangle, WebContents, WebContentsView } from 'electron'
import type { Store } from '../persistence'
import type {
  SlackFastResponseAttach,
  SlackFastResponseContentMode,
  SlackFastResponseSnapshot,
  SlackFastResponseState,
  SlackFastResponseVisibility
} from '../../shared/slack-fast-response'
import {
  applyCompactSlackAdapter,
  clearCompactSlackAdapter,
  slackContentModeForUrl
} from './compact-dom-adapter'
import { resolveSlackFastResponsePartition } from './compact-host-session'
import { createCompactSlackView } from './compact-host-view'

type Owner = {
  identity: string
  request: SlackFastResponseVisibility
  sender: WebContents
  senderId: number
  window: BrowserWindow
  closed: (() => void) | null
}

const SLACK_URL = 'https://app.slack.com/client'

export class SlackFastResponseHost {
  private view: WebContentsView | null = null
  private owner: Owner | null = null
  private loaded = false
  private crashed = false
  private visible = false
  private contentMode: SlackFastResponseContentMode = 'loading'
  private serial: Promise<void> = Promise.resolve()
  private revision = 0
  private adapterCssKey: string | null = null

  constructor(private readonly store: Store) {}

  attach(
    sender: WebContents,
    request: SlackFastResponseAttach
  ): Promise<SlackFastResponseSnapshot> {
    return this.enqueue(async () => {
      const window = BrowserWindow.fromWebContents(sender)
      if (!window || window.isDestroyed()) {
        throw new Error('slack_fast_response_owner_denied')
      }
      const view = this.ensureView()
      const bounds = contentBounds(window.getContentBounds(), request)
      view.setVisible(false)
      this.detach()
      window.contentView.addChildView(view)
      view.setBounds(bounds)
      const closed = () => this.handleOwnerDestroyed(window)
      window.once('closed', closed)
      this.owner = {
        identity: ownerIdentity(request),
        request: visibilityIdentity(request),
        sender,
        senderId: sender.id,
        window,
        closed
      }
      this.visible = true
      view.setVisible(true)
      const reconciling = this.reconcileUnsupported(view)
      this.publish(this.crashed ? 'crashed' : this.loaded ? this.contentMode : 'loading')
      if (!this.loaded && !reconciling) {
        void this.finishReadyDocument(view).catch(() => {
          if (this.view === view) {
            this.publish('error')
          }
        })
      }
      return this.snapshot()
    })
  }

  update(sender: WebContents, request: SlackFastResponseAttach): SlackFastResponseSnapshot {
    this.assertOwner(sender, request)
    const window = BrowserWindow.fromWebContents(sender)
    if (!window || window.isDestroyed()) {
      throw new Error('slack_fast_response_owner_denied')
    }
    this.view?.setBounds(contentBounds(window.getContentBounds(), request))
    if (this.visible && this.view && this.reconcileUnsupported(this.view)) {
      this.publish('loading')
    }
    return this.snapshot()
  }

  show(sender: WebContents, request: SlackFastResponseVisibility): SlackFastResponseSnapshot {
    this.assertOwner(sender, request)
    const wasVisible = this.visible
    this.visible = true
    this.view?.setVisible(true)
    if (!wasVisible && this.view && this.reconcileUnsupported(this.view)) {
      this.publish('loading')
    }
    return this.snapshot()
  }

  hide(sender: WebContents, request: SlackFastResponseVisibility): SlackFastResponseSnapshot {
    this.assertOwner(sender, request)
    this.visible = false
    this.view?.setVisible(false)
    return this.snapshot()
  }

  release(sender: WebContents, request: SlackFastResponseVisibility): void {
    if (this.isOwner(sender, request)) {
      this.visible = false
      this.view?.setVisible(false)
      this.detach()
    }
  }

  shutdown(): void {
    this.revision += 1
    this.detach()
    const view = this.view
    this.view = null
    if (view && !view.webContents.isDestroyed()) {
      void clearCompactSlackAdapter(view.webContents, this.adapterCssKey).finally(() =>
        view.webContents.close()
      )
    }
    this.adapterCssKey = null
    this.loaded = false
    this.crashed = false
    this.visible = false
    this.contentMode = 'loading'
  }

  snapshot(): SlackFastResponseSnapshot {
    return {
      attached: this.owner !== null,
      contentMode: this.contentMode,
      crashed: this.crashed,
      loaded: this.loaded,
      visible: this.visible
    }
  }

  private ensureView(): WebContentsView {
    if (this.view && !this.view.webContents.isDestroyed()) {
      return this.view
    }
    const view = createCompactSlackView({
      partition: resolveSlackFastResponsePartition(this.store),
      didFinishLoad: (current) => void this.finishLoad(current),
      didStartNavigation: (current, isInPlace, isMainFrame) => {
        if (this.view !== current || !isMainFrame || isInPlace) {
          return
        }
        this.revision += 1
        this.loaded = false
        this.contentMode = 'loading'
        this.publish('loading')
      },
      didFailLoad: (current, errorCode, isMainFrame) => {
        if (this.view !== current || !isMainFrame || errorCode === -3) {
          return
        }
        this.loaded = false
        this.publish('error')
      },
      renderProcessGone: (current) => {
        if (this.view !== current) {
          return
        }
        this.crashed = true
        this.loaded = false
        this.visible = false
        this.publish('crashed')
        this.detach()
        current.webContents.close()
        this.view = null
      }
    })
    this.view = view
    void view.webContents.loadURL(SLACK_URL).catch(() => {
      if (this.view === view) {
        this.publish('error')
      }
    })
    return view
  }

  private async finishLoad(view: WebContentsView): Promise<void> {
    const revision = ++this.revision
    const previousCssKey = this.adapterCssKey
    try {
      const routeMode = slackContentModeForUrl(view.webContents.getURL())
      const applied =
        routeMode === 'unsupported'
          ? await applyCompactSlackAdapter(view.webContents, previousCssKey)
          : null
      const mode = applied ? 'compact' : routeMode
      if (this.view !== view || revision !== this.revision) {
        if (applied) {
          await view.webContents.removeInsertedCSS(applied.cssKey).catch(() => {})
        }
        return
      }
      if (!applied && previousCssKey) {
        await view.webContents.removeInsertedCSS(previousCssKey).catch(() => {})
      }
      this.adapterCssKey = applied?.cssKey ?? null
      this.loaded = true
      this.crashed = false
      this.contentMode = mode
      this.publish(mode)
    } catch {
      if (this.view === view && revision === this.revision) {
        this.publish('error')
      }
    }
  }

  private async finishReadyDocument(view: WebContentsView): Promise<void> {
    const readyState = await view.webContents.executeJavaScriptInIsolatedWorld(
      999,
      [{ code: 'document.readyState' }],
      false
    )
    if (this.view === view && readyState === 'complete' && !this.loaded) {
      await this.finishLoad(view)
    }
  }

  private reconcileUnsupported(view: WebContentsView): boolean {
    if (!this.loaded || this.contentMode !== 'unsupported') {
      return false
    }
    this.loaded = false
    this.contentMode = 'loading'
    void this.finishReadyDocument(view).catch(() => {
      if (this.view === view) {
        this.publish('error')
      }
    })
    return true
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.serial.then(operation, operation)
    this.serial = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private detach(): void {
    const owner = this.owner
    if (!owner) {
      return
    }
    if (owner.closed) {
      owner.window.removeListener('closed', owner.closed)
    }
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

  private isOwner(sender: Pick<WebContents, 'id'>, request: SlackFastResponseVisibility): boolean {
    return this.owner?.senderId === sender.id && this.owner.identity === ownerIdentity(request)
  }

  private assertOwner(sender: Pick<WebContents, 'id'>, request: SlackFastResponseVisibility): void {
    if (!this.isOwner(sender, request)) {
      throw new Error('slack_fast_response_stale')
    }
  }

  private publish(state: SlackFastResponseState): void {
    if (!this.owner || this.owner.sender.isDestroyed()) {
      return
    }
    this.owner.sender.send('slackFastResponse:stateChanged', {
      contentMode: this.contentMode,
      identity: this.owner.request,
      state,
      recoverable: state !== 'compact'
    })
  }
}

function ownerIdentity(request: SlackFastResponseAttach | SlackFastResponseVisibility): string {
  if (request.target === 'attached') {
    return `attached:${request.requestId}:${request.surfaceId}:${request.mode}`
  }
  if (request.target === 'dock') {
    return `dock:${request.generation}:${request.revision}:${request.tabId}`
  }
  return `browser:${request.browserTabId}:${request.browserPageId}:${request.workspaceId}:${request.registrationToken}:${request.revision}`
}

function visibilityIdentity(request: SlackFastResponseAttach): SlackFastResponseVisibility {
  const { rectCss: _rectCss, rendererZoomFactor: _zoom, ...identity } = request
  return identity
}

function contentBounds(content: Rectangle, request: SlackFastResponseAttach): Rectangle {
  const { rectCss: rect, rendererZoomFactor: zoom } = request
  const left = Math.max(0, Math.floor(rect.x * zoom))
  const top = Math.max(0, Math.floor(rect.y * zoom))
  const right = Math.min(content.width, Math.ceil((rect.x + rect.width) * zoom))
  const bottom = Math.min(content.height, Math.ceil((rect.y + rect.height) * zoom))
  if (left >= right || top >= bottom) {
    throw new Error('slack_fast_response_rect_denied')
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}
