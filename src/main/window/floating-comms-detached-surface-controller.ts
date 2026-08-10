import { app, type BrowserWindow, type WebContents } from 'electron'
import type {
  FloatingCommsDetachRequest,
  FloatingCommsMinimizeDetachedRequest,
  FloatingCommsSessionState,
  FloatingCommsSurfaceChangedReason,
  FloatingCommsSurfaceIdentity,
  FloatingCommsSurfacePresentation
} from '../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'
import { bindFloatingCommsDetachedWindow } from './floating-comms-detached-window'
import { FloatingCommsDetachedLayoutStore } from './floating-comms-detached-layout'
import {
  createUnownedFloatingCommsSurfaceWindow,
  takeFloatingCommsSurfaceWindow
} from './floating-comms-surface-window'
import {
  defaultFloatingCommsDetachedBounds,
  destroyUnusableFloatingCommsWindow,
  findFloatingCommsRecordBySender,
  requireFloatingCommsDetachedRecord,
  sameFloatingCommsIdentity,
  sendFloatingCommsSurfaceChange,
  sendFloatingCommsVisibility,
  type FloatingCommsDetachedRecord,
  type FloatingCommsReusableRecord
} from './floating-comms-detached-record'

export type FloatingCommsAttachedRecord = {
  identity: FloatingCommsSurfaceIdentity
  owner: BrowserWindow
  request: {
    appId: FloatingWorkspaceAppId
    requestId: number
    anchor: { x: number; y: number; width: number; height: number }
    workspace: { x: number; y: number; width: number; height: number }
    height: number
  }
  sessionState: FloatingCommsSessionState
}

type DetachedControllerHost = {
  emitChange: (
    previous: FloatingCommsSurfaceIdentity | null,
    current: FloatingCommsSurfaceIdentity | null,
    reason: FloatingCommsSurfaceChangedReason,
    sessionState: FloatingCommsSessionState | null
  ) => void
  identity: (
    request: { appId: FloatingWorkspaceAppId; requestId: number },
    mode: FloatingCommsSurfaceIdentity['mode']
  ) => FloatingCommsSurfaceIdentity
  presentation: (
    identity: FloatingCommsSurfaceIdentity,
    sessionState: FloatingCommsSessionState,
    visible: boolean
  ) => FloatingCommsSurfacePresentation
}

export class FloatingCommsDetachedSurfaceController {
  private readonly detached = new Map<FloatingWorkspaceAppId, FloatingCommsDetachedRecord>()
  private readonly reusable = new Map<FloatingWorkspaceAppId, FloatingCommsReusableRecord>()
  private layoutStore: FloatingCommsDetachedLayoutStore | null = null

  constructor(private readonly host: DetachedControllerHost) {}

  has = (appId: FloatingWorkspaceAppId): boolean => this.detached.has(appId)

  detachSurface(
    attached: FloatingCommsAttachedRecord,
    request: FloatingCommsDetachRequest
  ): FloatingCommsSurfacePresentation {
    const existing = this.detached.get(attached.identity.appId)
    if (existing) {
      return this.focus(existing.identity.appId)
    }
    let window: BrowserWindow | null = null
    if (attached.identity.mode === 'attached-native') {
      window = takeFloatingCommsSurfaceWindow(attached.identity)
    }
    const identity = this.host.identity(attached.identity, 'detached')
    const reusable = this.takeReusable(attached.identity.appId)
    let failedBeforeRegistration: BrowserWindow | null = null
    window ??=
      reusable?.window ??
      createUnownedFloatingCommsSurfaceWindow(attached.owner, (failedWindow) => {
        const active = this.detached.get(identity.appId)
        if (active) {
          this.removeFailedLoad(identity, failedWindow)
        } else {
          failedBeforeRegistration = failedWindow
          if (!failedWindow.isDestroyed()) {
            failedWindow.destroy()
          }
        }
      })
    if (failedBeforeRegistration) {
      this.host.emitChange(attached.identity, null, 'crashed', null)
      throw new Error('floating_comms_detached_load_failed')
    }
    const bounds =
      this.layout().get(identity.appId) ?? defaultFloatingCommsDetachedBounds(attached.owner)
    const record: FloatingCommsDetachedRecord = {
      announced: false,
      identity,
      generation: identity.surfaceId,
      previousIdentity: attached.identity,
      sessionState: request.sessionState,
      window,
      binding: { release: () => void 0 }
    }
    record.binding = bindFloatingCommsDetachedWindow(window, bounds, {
      closed: () => this.remove(identity, window, 'closed'),
      crashed: () => this.remove(identity, window, 'crashed'),
      minimize: () => this.minimizeRecord(identity, record.sessionState),
      saveBounds: (nextBounds) => this.layout().set(identity.appId, nextBounds)
    })
    this.detached.set(identity.appId, record)
    if (!window.webContents.isLoading()) {
      window.webContents.send('floatingComms:stateChanged', identity)
    }
    if (window.isMinimized()) {
      window.restore()
    }
    window.show()
    window.focus()
    sendFloatingCommsSurfaceChange(
      window,
      attached.identity,
      identity,
      'detached',
      request.sessionState
    )
    sendFloatingCommsVisibility(window, identity, true)
    this.host.emitChange(attached.identity, identity, 'detached', request.sessionState)
    record.announced = true
    return this.host.presentation(identity, request.sessionState, true)
  }

  minimize(request: FloatingCommsMinimizeDetachedRequest): void {
    const record = requireFloatingCommsDetachedRecord(this.detached, request)
    record.sessionState = request.sessionState
    this.minimizeRecord(record.identity, request.sessionState)
  }

  focus(appId: FloatingWorkspaceAppId): FloatingCommsSurfacePresentation {
    const record = this.detached.get(appId)
    if (!record || record.window.isDestroyed()) {
      throw new Error('floating_comms_detached_unavailable')
    }
    if (record.window.isMinimized()) {
      record.window.restore()
    }
    record.window.show()
    record.window.focus()
    sendFloatingCommsVisibility(record.window, record.identity, true)
    return this.host.presentation(record.identity, record.sessionState, true)
  }

  close(appId: FloatingWorkspaceAppId): void {
    const record = this.detached.get(appId)
    if (record) {
      this.destroy(record, 'closed')
    }
  }

  disable(appId: FloatingWorkspaceAppId): void {
    const record = this.detached.get(appId)
    if (record) {
      this.destroy(record, 'disabled')
    }
    const reusable = this.takeReusable(appId)
    if (reusable && !reusable.window.isDestroyed()) {
      reusable.window.destroy()
    }
  }

  listPresentations(): FloatingCommsSurfacePresentation[] {
    return [...this.detached.values()].map((record) =>
      this.host.presentation(record.identity, record.sessionState, record.window.isVisible())
    )
  }

  getStateForSender(sender: WebContents): FloatingCommsSurfacePresentation | null {
    const record = this.findBySender(sender)
    return record
      ? this.host.presentation(record.identity, record.sessionState, record.window.isVisible())
      : null
  }

  isSender(sender: WebContents, identity: FloatingCommsSurfaceIdentity): boolean {
    const record = this.detached.get(identity.appId)
    return Boolean(
      record &&
      sameFloatingCommsIdentity(record.identity, identity) &&
      record.window.webContents === sender &&
      !sender.isDestroyed()
    )
  }

  takeReusable(appId: FloatingWorkspaceAppId): FloatingCommsReusableRecord | null {
    const reusable = this.reusable.get(appId) ?? null
    this.reusable.delete(appId)
    return reusable?.window.isDestroyed() ? null : reusable
  }

  restoreReusable(appId: FloatingWorkspaceAppId, record: FloatingCommsReusableRecord): void {
    this.reusable.set(appId, record)
  }

  shutdown(): Promise<void> {
    for (const record of this.detached.values()) {
      record.binding.release()
      if (!record.window.isDestroyed()) {
        record.window.destroy()
      }
    }
    this.detached.clear()
    for (const record of this.reusable.values()) {
      if (!record.window.isDestroyed()) {
        record.window.destroy()
      }
    }
    this.reusable.clear()
    return this.layoutStore?.flush() ?? Promise.resolve()
  }

  private minimizeRecord(
    identity: FloatingCommsSurfaceIdentity,
    sessionState: FloatingCommsSessionState
  ): void {
    const record = requireFloatingCommsDetachedRecord(this.detached, identity)
    this.layout().set(identity.appId, record.window.getBounds())
    record.binding.release()
    this.detached.delete(identity.appId)
    if (destroyUnusableFloatingCommsWindow(record.window)) {
      this.host.emitChange(identity, null, 'crashed', null)
      return
    }
    sendFloatingCommsVisibility(record.window, identity, false)
    if (record.window.isMinimized()) {
      record.window.restore()
    }
    record.window.hide()
    record.window.setAlwaysOnTop(false)
    this.reusable.set(identity.appId, {
      previousIdentity: identity,
      window: record.window,
      sessionState
    })
    this.host.emitChange(identity, null, 'minimized', sessionState)
  }

  private remove(
    identity: FloatingCommsSurfaceIdentity,
    window: BrowserWindow,
    reason: Extract<FloatingCommsSurfaceChangedReason, 'closed' | 'crashed'>
  ): void {
    const record = this.detached.get(identity.appId)
    if (
      !record ||
      record.window !== window ||
      !sameFloatingCommsIdentity(record.identity, identity)
    ) {
      return
    }
    record.binding.release()
    this.detached.delete(identity.appId)
    if (!record.window.isDestroyed()) {
      record.window.destroy()
    }
    this.host.emitChange(identity, null, reason, null)
  }

  private removeFailedLoad(identity: FloatingCommsSurfaceIdentity, window: BrowserWindow): void {
    const record = this.detached.get(identity.appId)
    if (
      !record ||
      record.generation !== identity.surfaceId ||
      !sameFloatingCommsIdentity(record.identity, identity) ||
      record.window !== window
    ) {
      if (!window.isDestroyed()) {
        window.destroy()
      }
      return
    }
    record.binding.release()
    this.detached.delete(identity.appId)
    if (!window.isDestroyed()) {
      window.destroy()
    }
    this.host.emitChange(
      record.announced ? identity : record.previousIdentity,
      null,
      'crashed',
      null
    )
  }

  private destroy(
    record: FloatingCommsDetachedRecord,
    reason: Extract<FloatingCommsSurfaceChangedReason, 'closed' | 'disabled'>
  ): void {
    this.layout().set(record.identity.appId, record.window.getBounds())
    record.binding.release()
    this.detached.delete(record.identity.appId)
    if (!record.window.isDestroyed()) {
      record.window.destroy()
    }
    this.host.emitChange(record.identity, null, reason, null)
  }

  private findBySender(sender: WebContents): FloatingCommsDetachedRecord | null {
    return findFloatingCommsRecordBySender(this.detached.values(), sender)
  }

  private layout(): FloatingCommsDetachedLayoutStore {
    this.layoutStore ??= new FloatingCommsDetachedLayoutStore(app.getPath('userData'))
    return this.layoutStore
  }
}
