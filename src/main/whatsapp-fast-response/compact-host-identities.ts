import type {
  WhatsAppFastResponseAttach,
  WhatsAppFastResponseVisibility
} from '../../shared/whatsapp-fast-response'
import type { BrowserWindow, Rectangle, WebContents } from 'electron'

export type WhatsAppFastResponseOwner = {
  target: WhatsAppFastResponseAttach['target']
  identity: string
  webContentsId: number
  sender: WebContents
  request: WhatsAppFastResponseVisibility
  window: BrowserWindow
  closed: () => void
}

export class AdapterReconcileQueue {
  private promise: Promise<void> | null = null
  private queued = false

  request(run: () => Promise<void>, shouldRun: () => boolean): void {
    if (this.promise) {
      this.queued = true
      return
    }
    this.promise = run().finally(() => {
      this.promise = null
      const queued = this.queued
      this.queued = false
      if (queued && shouldRun()) {
        this.request(run, shouldRun)
      }
    })
  }

  reset(): void {
    this.queued = false
  }
}

export class AdapterApplicationState {
  revision = 0
  finished = -1
  applied = -1
  failed = -1

  finish(): void {
    this.finished = this.revision
    this.failed = -1
  }

  invalidate(): void {
    this.revision += 1
    this.finished = -1
    this.applied = -1
    this.failed = -1
  }

  isCurrent(currentView: unknown, view: unknown, revision: number): boolean {
    return currentView === view && this.revision === revision
  }

  isFinished(currentView: unknown, view: unknown, revision: number): boolean {
    return this.isCurrent(currentView, view, revision) && this.finished === revision
  }

  canApply(currentView: unknown, view: unknown): boolean {
    return (
      this.isFinished(currentView, view, this.revision) &&
      this.applied !== this.revision &&
      this.failed !== this.revision
    )
  }
}

export class InitialLoadAttempt {
  private token = 0
  private revision = -1
  private associated = false

  begin(revision: number): number {
    this.token += 1
    this.revision = revision
    this.associated = false
    return this.token
  }

  associateNavigation(revision: number): void {
    if (!this.associated) {
      this.associated = true
      this.revision = revision
      return
    }
    this.token += 1
    this.revision = revision
  }

  isCurrent(token: number, revision: number): boolean {
    return this.token === token && this.revision === revision
  }
}

export function finishAdapterRevision(
  state: AdapterApplicationState,
  currentView: unknown,
  view: { webContents: Pick<WebContents, 'isDestroyed'> },
  force = false
): boolean {
  if (
    currentView !== view ||
    view.webContents.isDestroyed() ||
    (!force && state.finished === state.revision)
  ) {
    return false
  }
  state.finish()
  return true
}

export function contentBoundsForFastResponse(
  content: Rectangle,
  request: WhatsAppFastResponseAttach
): Rectangle {
  const zoom = request.rendererZoomFactor
  const rect = request.rectCss
  const x = rect.x * zoom
  const y = rect.y * zoom
  const right = Math.min(content.width, Math.ceil((rect.x + rect.width) * zoom))
  const bottom = Math.min(content.height, Math.ceil((rect.y + rect.height) * zoom))
  const left = Math.max(0, Math.floor(x))
  const top = Math.max(0, Math.floor(y))
  if (x < 0 || y < 0 || left >= right || top >= bottom) {
    throw new Error('whatsapp_fast_response_rect_denied')
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function ownerIdentity(
  request: WhatsAppFastResponseAttach | WhatsAppFastResponseVisibility
): string {
  return request.target === 'attached'
    ? `attached:${request.requestId}:${request.surfaceId}:${request.mode}`
    : `dock:${request.generation}:${request.revision}:${request.tabId}:${request.activeLeafAppId}`
}

export function isCurrentOwner(
  owner: WhatsAppFastResponseOwner | null,
  sender: Pick<WebContents, 'id'>,
  request: WhatsAppFastResponseAttach | WhatsAppFastResponseVisibility
): boolean {
  return (
    owner !== null &&
    owner.target === request.target &&
    owner.identity === ownerIdentity(request) &&
    owner.webContentsId === sender.id
  )
}

export function assertCurrentOwner(
  owner: WhatsAppFastResponseOwner | null,
  sender: Pick<WebContents, 'id'>,
  request: WhatsAppFastResponseAttach | WhatsAppFastResponseVisibility
): void {
  if (!isCurrentOwner(owner, sender, request)) {
    throw new Error('whatsapp_fast_response_stale')
  }
}

export function isWhatsAppUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'web.whatsapp.com'
  } catch {
    return false
  }
}

export function visibilityIdentity(
  request: WhatsAppFastResponseAttach
): WhatsAppFastResponseVisibility {
  if (request.target === 'attached') {
    const { target, appId, requestId, surfaceId, mode } = request
    return { target, appId, requestId, surfaceId, mode }
  }
  const { target, appId, generation, revision, tabId, activeLeafAppId } = request
  return { target, appId, generation, revision, tabId, activeLeafAppId }
}
