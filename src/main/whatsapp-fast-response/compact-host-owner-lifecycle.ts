import type { BrowserWindow, WebContents, WebContentsView } from 'electron'
import type {
  WhatsAppFastResponseAttach,
  WhatsAppFastResponseState
} from '../../shared/whatsapp-fast-response'
import { contentBoundsForFastResponse, isCurrentOwner } from './compact-host-identities'
import type { WhatsAppFastResponseOwner } from './compact-host-identities'
import { ownerIdentity } from './compact-host-identities'
import { WhatsAppFastResponseHostLifecycle } from './compact-host-lifecycle'

export function detachCompactWhatsAppOwner(
  owner: WhatsAppFastResponseOwner | null,
  view: WebContentsView | null
): WhatsAppFastResponseOwner | null {
  if (!owner) {
    return null
  }
  if (owner.closed) {
    owner.window.removeListener('closed', owner.closed)
  }
  if (view && !owner.window.isDestroyed()) {
    owner.window.contentView.removeChildView(view)
  }
  return null
}

export function boundsForCompactWhatsAppOwner({
  owner,
  sender,
  window,
  request,
  view,
  publish
}: {
  owner: WhatsAppFastResponseOwner | null
  sender: WebContents
  window: BrowserWindow
  request: WhatsAppFastResponseAttach
  view: WebContentsView | null
  publish: (state: WhatsAppFastResponseState) => void
}): Electron.Rectangle {
  try {
    return contentBoundsForFastResponse(window.getContentBounds(), request)
  } catch (error) {
    if (isCurrentOwner(owner, sender, request)) {
      view?.setVisible(false)
      publish('error')
    }
    throw error
  }
}

export abstract class WhatsAppFastResponseHostOwnerLifecycle extends WhatsAppFastResponseHostLifecycle {
  protected owner: WhatsAppFastResponseOwner | null = null
  protected transitionRevision = 0
  private browserCleanupTransition: number | null = null

  protected detach(): void {
    this.owner = detachCompactWhatsAppOwner(this.owner, this.view)
  }

  protected handleOwnerDestroyed(window: BrowserWindow): void {
    if (this.owner?.window !== window) {
      return
    }
    this.owner = null
    this.visible = false
    this.view?.setVisible(false)
    if (this.view) {
      this.scheduleAttention(this.view)
    }
  }

  protected isCompactOwner(): boolean {
    return this.owner !== null && this.owner.target !== 'browser'
  }

  protected isBrowserOwner(): boolean {
    return this.owner?.target === 'browser'
  }

  protected isCurrentBrowserTransition(
    transition: number,
    view: WebContentsView,
    request: Extract<WhatsAppFastResponseAttach, { target: 'browser' }>
  ): boolean {
    return (
      this.transitionRevision === transition &&
      this.view === view &&
      !view.webContents.isDestroyed() &&
      this.owner?.target === 'browser' &&
      this.owner.identity === ownerIdentity(request)
    )
  }

  protected boundsForCurrentOwner(
    sender: WebContents,
    window: BrowserWindow,
    request: WhatsAppFastResponseAttach
  ): Electron.Rectangle {
    return boundsForCompactWhatsAppOwner({
      owner: this.owner,
      sender,
      window,
      request,
      view: this.view,
      publish: (state) => this.publish(state)
    })
  }

  protected browserCleanupActive(): boolean {
    return this.browserCleanupTransition !== null
  }

  protected beginBrowserCleanup(): void {
    this.browserCleanupTransition = this.transitionRevision
  }

  protected endBrowserCleanup(): void {
    if (this.browserCleanupTransition === this.transitionRevision) {
      this.browserCleanupTransition = null
    }
  }

  protected detachAfterCrash(): void {
    this.detach()
  }
}
