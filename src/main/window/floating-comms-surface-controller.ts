import type { BrowserWindow, WebContents } from 'electron'
import type {
  FloatingCommsAction,
  FloatingCommsDetachRequest,
  FloatingCommsDiscordCommand,
  FloatingCommsMinimizeDetachedRequest,
  FloatingCommsOpenRequest,
  FloatingCommsOpenResult,
  FloatingCommsSessionState,
  FloatingCommsSurfaceIdentity,
  FloatingCommsSurfacePresentation,
  FloatingCommsUpdateRequest
} from '../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'
import { sendToTrustedUIRenderer } from '../ipc/ui'
import {
  FloatingCommsDetachedSurfaceController,
  type FloatingCommsAttachedRecord
} from './floating-comms-detached-surface-controller'
import {
  defaultFloatingCommsSessionState,
  sendFloatingCommsVisibility
} from './floating-comms-detached-record'
import {
  closeFloatingCommsSurface,
  destroyFloatingCommsSurface,
  isFloatingCommsSurfaceRenderer,
  openFloatingCommsSurface,
  resizeFloatingCommsSurface,
  shouldUseFloatingCommsDomFallback,
  updateFloatingCommsSurface
} from './floating-comms-surface-window'
import { destroyAttachedFloatingCommsWindow } from './floating-comms-attached-window'
import {
  createFloatingCommsSurfaceIdentity,
  sameFloatingCommsSurfaceIdentity
} from './floating-comms-surface-identity'
import { takeAttachedFloatingCommsForDock } from './floating-comms-dock-detach'
import {
  createFloatingCommsSurfaceChange,
  createFloatingCommsPresentation,
  emitFloatingCommsSurfaceChange,
  restoreFloatingCommsMainWindow
} from './floating-comms-surface-presentation'
import {
  getFloatingCommsSurfacePresentation,
  getFloatingCommsSurfaceStateForSender,
  listFloatingCommsSurfacePresentations
} from './floating-comms-surface-presentations'

export class FloatingCommsSurfaceController {
  private attached: FloatingCommsAttachedRecord | null = null
  private nextSurfaceId = 0
  private readonly detached = new FloatingCommsDetachedSurfaceController({
    emitChange: (previous, current, reason, sessionState) =>
      emitFloatingCommsSurfaceChange(previous, current, reason, sessionState),
    identity: (request, mode) => this.identity(request, mode),
    presentation: (identity, sessionState, visible) =>
      createFloatingCommsPresentation(identity, sessionState, visible)
  })

  open(owner: BrowserWindow, request: FloatingCommsOpenRequest): FloatingCommsOpenResult {
    if (this.detached.has(request.appId)) {
      const { appId, requestId, surfaceId, mode } = this.detached.focus(request.appId)
      return { identity: { appId, requestId, surfaceId, mode } }
    }
    if (
      this.attached?.identity.appId === request.appId &&
      this.attached.identity.requestId === request.requestId
    ) {
      return { identity: this.attached.identity }
    }
    if (this.attached) {
      this.closeAttached(this.attached.identity)
    }
    const reusable = this.detached.takeReusable(request.appId)
    const nativeIdentity = this.identity(request, 'attached-native')
    const record: FloatingCommsAttachedRecord = {
      identity: nativeIdentity,
      owner,
      request,
      sessionState: reusable?.sessionState ?? defaultFloatingCommsSessionState(request.appId)
    }
    this.attached = record
    const openedNative =
      !shouldUseFloatingCommsDomFallback() &&
      openFloatingCommsSurface(
        owner,
        request,
        nativeIdentity,
        {
          onClosed: (identity) => this.handleAttachedClosed(identity),
          onFallback: (identity) => this.handleAttachedFallback(identity)
        },
        reusable?.window
      )
    if (!openedNative) {
      if (reusable) {
        this.detached.restoreReusable(request.appId, reusable)
      }
      record.identity = this.identity(request, 'attached-dom')
    }
    const previousIdentity = reusable?.previousIdentity ?? null
    if (openedNative && reusable) {
      reusable.window.webContents.send(
        'floatingComms:surfaceChanged',
        createFloatingCommsSurfaceChange(
          previousIdentity,
          record.identity,
          'opened',
          record.sessionState
        )
      )
      sendFloatingCommsVisibility(reusable.window, record.identity, true)
    }
    emitFloatingCommsSurfaceChange(previousIdentity, record.identity, 'opened', record.sessionState)
    return { identity: record.identity }
  }

  update(owner: BrowserWindow, request: FloatingCommsUpdateRequest): FloatingCommsOpenResult {
    const record = this.requireAttached(request)
    if (record.owner !== owner) {
      throw new Error('floating_comms_update_owner_mismatch')
    }
    record.request = {
      appId: request.appId,
      requestId: request.requestId,
      anchor: request.anchor,
      workspace: request.workspace,
      height: request.height
    }
    if (
      record.identity.mode === 'attached-native' &&
      updateFloatingCommsSurface(owner, request) === null
    ) {
      throw new Error('floating_comms_update_stale')
    }
    return { identity: this.attached?.identity ?? record.identity }
  }

  closeAttached(identity: FloatingCommsSurfaceIdentity): void {
    const record = this.requireAttached(identity)
    if (record.identity.mode === 'attached-native') {
      closeFloatingCommsSurface(identity)
      return
    }
    this.attached = null
    emitFloatingCommsSurfaceChange(identity, null, 'closed', record.sessionState)
  }

  resize(identity: FloatingCommsSurfaceIdentity, height: number): void {
    this.requireAttached(identity)
    resizeFloatingCommsSurface(identity, height)
  }

  detachSurface(request: FloatingCommsDetachRequest): FloatingCommsSurfacePresentation {
    const record = this.requireAttached(request)
    if (record.identity.appId !== request.sessionState.appId) {
      throw new Error('floating_comms_session_app_mismatch')
    }
    this.attached = null
    return this.detached.detachSurface(record, request)
  }

  takeAttachedForDock(request: FloatingCommsDetachRequest): FloatingCommsSessionState {
    const record = this.requireAttached(request)
    this.attached = null
    return takeAttachedFloatingCommsForDock(record, request)
  }

  minimizeDetached(request: FloatingCommsMinimizeDetachedRequest): void {
    if (request.appId !== request.sessionState.appId) {
      throw new Error('floating_comms_session_app_mismatch')
    }
    this.detached.minimize(request)
  }

  focusDetached(appId: FloatingWorkspaceAppId): FloatingCommsSurfacePresentation {
    return this.detached.focus(appId)
  }

  closeDetached(appId: FloatingWorkspaceAppId): void {
    this.detached.close(appId)
  }

  disable(appId: FloatingWorkspaceAppId): void {
    this.detached.disable(appId)
    const attached = this.attached
    if (!attached || attached.identity.appId !== appId) {
      return
    }
    if (attached.identity.mode === 'attached-native') {
      destroyAttachedFloatingCommsWindow(attached.identity)
    }
    this.attached = null
    emitFloatingCommsSurfaceChange(attached.identity, null, 'disabled', null)
  }

  listPresentations(): FloatingCommsSurfacePresentation[] {
    return listFloatingCommsSurfacePresentations(this.detached, this.attached)
  }

  getPresentation(appId: FloatingWorkspaceAppId): FloatingCommsSurfacePresentation | null {
    return getFloatingCommsSurfacePresentation(this.detached, this.attached, appId)
  }

  getStateForSender(sender: WebContents): FloatingCommsSurfacePresentation | null {
    return getFloatingCommsSurfaceStateForSender(this.detached, this.attached, sender)
  }

  isAttachedSender(sender: WebContents, identity: FloatingCommsSurfaceIdentity): boolean {
    return Boolean(
      this.attached &&
      sameFloatingCommsSurfaceIdentity(this.attached.identity, identity) &&
      isFloatingCommsSurfaceRenderer(sender)
    )
  }

  isDetachedSender(sender: WebContents, identity: FloatingCommsSurfaceIdentity): boolean {
    return this.detached.isSender(sender, identity)
  }

  isSurfaceSender(sender: WebContents, identity: FloatingCommsSurfaceIdentity): boolean {
    return this.isAttachedSender(sender, identity) || this.isDetachedSender(sender, identity)
  }

  handleAction(sender: WebContents, action: FloatingCommsAction): void {
    if (!this.isSurfaceSender(sender, action)) {
      throw new Error('floating_comms_action_stale')
    }
    restoreFloatingCommsMainWindow()
    sendToTrustedUIRenderer('floatingComms:action', action)
    if (action.mode !== 'detached') {
      this.closeAttached(action)
    }
  }

  assertDiscordCommandSender(sender: WebContents, command: FloatingCommsDiscordCommand): void {
    if (!this.isSurfaceSender(sender, command)) {
      throw new Error('floating_comms_command_stale')
    }
  }

  shutdown(): Promise<void> {
    if (this.attached?.identity.mode === 'attached-native') {
      destroyAttachedFloatingCommsWindow(this.attached.identity)
    }
    this.attached = null
    destroyFloatingCommsSurface()
    return this.detached.shutdown()
  }

  private handleAttachedClosed(identity: FloatingCommsSurfaceIdentity): void {
    const record = this.attached
    if (record && sameFloatingCommsSurfaceIdentity(record.identity, identity)) {
      this.attached = null
      emitFloatingCommsSurfaceChange(identity, null, 'closed', record.sessionState)
    }
  }

  private handleAttachedFallback(identity: FloatingCommsSurfaceIdentity): void {
    const record = this.attached
    if (
      !record ||
      record.identity.appId !== identity.appId ||
      record.identity.requestId !== identity.requestId
    ) {
      return
    }
    const previous = record.identity
    record.identity = this.identity(identity, 'attached-dom')
    sendToTrustedUIRenderer('floatingComms:fallback', record.identity)
    emitFloatingCommsSurfaceChange(previous, record.identity, 'fallback', record.sessionState)
  }

  private requireAttached(identity: FloatingCommsSurfaceIdentity): FloatingCommsAttachedRecord {
    if (!this.attached || !sameFloatingCommsSurfaceIdentity(this.attached.identity, identity)) {
      throw new Error('floating_comms_attached_stale')
    }
    return this.attached
  }

  private identity(
    request: { appId: FloatingWorkspaceAppId; requestId: number },
    mode: FloatingCommsSurfaceIdentity['mode']
  ): FloatingCommsSurfaceIdentity {
    const identity = createFloatingCommsSurfaceIdentity(request, mode, this.nextSurfaceId)
    this.nextSurfaceId = identity.surfaceId
    return identity
  }
}

export const floatingCommsSurfaceController = new FloatingCommsSurfaceController()
