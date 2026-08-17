import { app, type BrowserWindow, type WebContents } from 'electron'
import type {
  FloatingCommsAction,
  FloatingCommsDetachRequest,
  FloatingCommsDiscordCommand,
  FloatingCommsOpenRequest,
  FloatingCommsOpenResult,
  FloatingCommsSessionState,
  FloatingCommsSurfaceIdentity,
  FloatingCommsSurfacePresentation,
  FloatingCommsUpdateRequest
} from '../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'
import { clampFloatingCommsSurfaceHeight } from '../../shared/floating-comms-surface'
import { FloatingCommsAttachedHeightStore } from './floating-comms-attached-height'
import { sendToTrustedUIRenderer } from '../ipc/ui'
import {
  defaultFloatingCommsSessionState,
  type FloatingCommsAttachedRecord
} from './floating-comms-attached-record'
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
  emitFloatingCommsSurfaceChange,
  restoreFloatingCommsMainWindow
} from './floating-comms-surface-presentation'
import {
  getFloatingCommsSurfacePresentation,
  getFloatingCommsSurfaceStateForSender,
  listFloatingCommsSurfacePresentations
} from './floating-comms-surface-presentations'

const RESIZABLE_ATTACHED_APP_IDS = new Set<FloatingWorkspaceAppId>(['whatsapp-web', 'slack'])

export class FloatingCommsSurfaceController {
  private attached: FloatingCommsAttachedRecord | null = null
  private nextSurfaceId = 0
  private attachedHeightStore: FloatingCommsAttachedHeightStore | null = null

  open(owner: BrowserWindow, request: FloatingCommsOpenRequest): FloatingCommsOpenResult {
    request = { ...request, height: this.attachedHeights().get(request.appId) }
    if (
      this.attached?.identity.appId === request.appId &&
      this.attached.identity.requestId === request.requestId
    ) {
      return { identity: this.attached.identity, height: this.attached.request.height }
    }
    if (this.attached) {
      this.closeAttached(this.attached.identity)
    }
    const nativeIdentity = this.identity(request, 'attached-native')
    const record: FloatingCommsAttachedRecord = {
      identity: nativeIdentity,
      owner,
      request,
      sessionState: defaultFloatingCommsSessionState(request.appId),
      hasInitialMeasurement: false
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
        undefined
      )
    if (!openedNative) {
      record.identity = this.identity(request, 'attached-dom')
    }
    emitFloatingCommsSurfaceChange(null, record.identity, 'opened', record.sessionState)
    return { identity: record.identity, height: record.request.height }
  }

  update(owner: BrowserWindow, request: FloatingCommsUpdateRequest): FloatingCommsOpenResult {
    const record = this.requireAttached(request)
    if (record.owner !== owner) {
      throw new Error('floating_comms_update_owner_mismatch')
    }
    const height = clampFloatingCommsSurfaceHeight(request.height)
    record.request = {
      appId: request.appId,
      requestId: request.requestId,
      anchor: request.anchor,
      workspace: request.workspace,
      height
    }
    if (
      record.identity.mode === 'attached-native' &&
      updateFloatingCommsSurface(owner, request) === null
    ) {
      throw new Error('floating_comms_update_stale')
    }
    return { identity: this.attached?.identity ?? record.identity, height }
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

  measure(sender: WebContents, identity: FloatingCommsSurfaceIdentity, height: number): void {
    if (!this.isAttachedSender(sender, identity)) {
      throw new Error('floating_comms_measure_denied')
    }
    const record = this.requireAttached(identity)
    const isInitialDiscordNativeMeasurement =
      record.identity.mode === 'attached-native' &&
      record.identity.appId === 'discord' &&
      !record.hasInitialMeasurement
    const isResizableDomMeasurement =
      record.identity.mode === 'attached-dom' &&
      RESIZABLE_ATTACHED_APP_IDS.has(record.identity.appId)
    if (!isInitialDiscordNativeMeasurement && !isResizableDomMeasurement) {
      throw new Error('floating_comms_measure_denied')
    }
    const nextHeight = clampFloatingCommsSurfaceHeight(height)
    record.request = { ...record.request, height: nextHeight }
    if (isInitialDiscordNativeMeasurement) {
      record.hasInitialMeasurement = true
    }
    resizeFloatingCommsSurface(identity, nextHeight)
  }

  resize(identity: FloatingCommsSurfaceIdentity, height: number, persist = false): void {
    const record = this.requireAttached(identity)
    if (
      record.identity.mode !== 'attached-dom' ||
      !RESIZABLE_ATTACHED_APP_IDS.has(record.identity.appId)
    ) {
      throw new Error('floating_comms_resize_denied')
    }
    const nextHeight = clampFloatingCommsSurfaceHeight(height)
    record.request = { ...record.request, height: nextHeight }
    if (persist) {
      this.attachedHeights().set(identity.appId, nextHeight)
    }
    resizeFloatingCommsSurface(identity, nextHeight)
  }

  takeAttachedForDock(request: FloatingCommsDetachRequest): FloatingCommsSessionState {
    const record = this.requireAttached(request)
    this.attached = null
    return takeAttachedFloatingCommsForDock(record, request)
  }

  disable(appId: FloatingWorkspaceAppId): void {
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
    return listFloatingCommsSurfacePresentations(this.attached)
  }

  getPresentation(appId: FloatingWorkspaceAppId): FloatingCommsSurfacePresentation | null {
    return getFloatingCommsSurfacePresentation(this.attached, appId)
  }

  getStateForSender(sender: WebContents): FloatingCommsSurfacePresentation | null {
    return getFloatingCommsSurfaceStateForSender(this.attached, sender)
  }

  isAttachedSender(sender: WebContents, identity: FloatingCommsSurfaceIdentity): boolean {
    const attached = this.attached
    if (!attached || !sameFloatingCommsSurfaceIdentity(attached.identity, identity)) {
      return false
    }
    return attached.identity.mode === 'attached-dom'
      ? attached.owner.webContents === sender
      : isFloatingCommsSurfaceRenderer(sender)
  }

  isSurfaceSender(sender: WebContents, identity: FloatingCommsSurfaceIdentity): boolean {
    return this.isAttachedSender(sender, identity)
  }

  isAttachedAppFocusedVisible(appId: FloatingWorkspaceAppId): boolean {
    const attached = this.attached
    return Boolean(
      attached &&
      attached.identity.appId === appId &&
      attached.owner.isFocused() &&
      (attached.identity.mode === 'attached-native' || attached.identity.mode === 'attached-dom')
    )
  }

  handleAction(sender: WebContents, action: FloatingCommsAction): void {
    if (!this.isSurfaceSender(sender, action)) {
      throw new Error('floating_comms_action_stale')
    }
    restoreFloatingCommsMainWindow()
    sendToTrustedUIRenderer('floatingComms:action', action)
    this.closeAttached(action)
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
    return Promise.resolve(this.attachedHeightStore?.flush()).then(() => undefined)
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

  private attachedHeights(): FloatingCommsAttachedHeightStore {
    this.attachedHeightStore ??= new FloatingCommsAttachedHeightStore(app.getPath('userData'))
    return this.attachedHeightStore
  }
}

export const floatingCommsSurfaceController = new FloatingCommsSurfaceController()
