import type { BrowserWindow, WebContents } from 'electron'
import type {
  FloatingCommsSessionState,
  FloatingCommsSurfaceChangedReason,
  FloatingCommsSurfaceIdentity
} from '../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'
import {
  FLOATING_COMMS_DETACHED_DEFAULT_HEIGHT,
  FLOATING_COMMS_DETACHED_DEFAULT_WIDTH
} from './floating-comms-detached-layout'
import { createFloatingCommsSurfaceChange } from './floating-comms-surface-presentation'

export type FloatingCommsDetachedRecord = {
  announced: boolean
  binding: { release: () => void }
  generation: number
  identity: FloatingCommsSurfaceIdentity
  previousIdentity: FloatingCommsSurfaceIdentity
  sessionState: FloatingCommsSessionState
  window: BrowserWindow
}

export type FloatingCommsReusableRecord = {
  previousIdentity: FloatingCommsSurfaceIdentity
  sessionState: FloatingCommsSessionState
  window: BrowserWindow
}

export function defaultFloatingCommsSessionState(
  appId: FloatingWorkspaceAppId
): FloatingCommsSessionState {
  return appId === 'whatsapp-web' ? { appId, selectedConversationId: null, draft: '' } : { appId }
}

export function destroyUnusableFloatingCommsWindow(window: BrowserWindow): boolean {
  if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
    return false
  }
  if (!window.isDestroyed()) {
    window.destroy()
  }
  return true
}

export function findFloatingCommsRecordBySender(
  records: Iterable<FloatingCommsDetachedRecord>,
  sender: WebContents
): FloatingCommsDetachedRecord | null {
  for (const record of records) {
    if (record.window.webContents === sender && !sender.isDestroyed()) {
      return record
    }
  }
  return null
}

export function requireFloatingCommsDetachedRecord(
  records: Map<FloatingWorkspaceAppId, FloatingCommsDetachedRecord>,
  identity: FloatingCommsSurfaceIdentity
): FloatingCommsDetachedRecord {
  const record = records.get(identity.appId)
  if (!record || !sameFloatingCommsIdentity(record.identity, identity)) {
    throw new Error('floating_comms_detached_stale')
  }
  return record
}

export function sameFloatingCommsIdentity(
  left: FloatingCommsSurfaceIdentity,
  right: FloatingCommsSurfaceIdentity
): boolean {
  return (
    left.appId === right.appId &&
    left.requestId === right.requestId &&
    left.surfaceId === right.surfaceId &&
    left.mode === right.mode
  )
}

export function defaultFloatingCommsDetachedBounds(owner: BrowserWindow): {
  x: number
  y: number
  width: number
  height: number
} {
  const ownerBounds = owner.getBounds()
  return {
    x: Math.round(ownerBounds.x + (ownerBounds.width - FLOATING_COMMS_DETACHED_DEFAULT_WIDTH) / 2),
    y: Math.round(
      ownerBounds.y + (ownerBounds.height - FLOATING_COMMS_DETACHED_DEFAULT_HEIGHT) / 2
    ),
    width: FLOATING_COMMS_DETACHED_DEFAULT_WIDTH,
    height: FLOATING_COMMS_DETACHED_DEFAULT_HEIGHT
  }
}

export function sendFloatingCommsVisibility(
  window: BrowserWindow,
  identity: FloatingCommsSurfaceIdentity,
  visible: boolean
): void {
  window.webContents.send('floatingComms:visibilityChanged', { ...identity, visible })
}

export function sendFloatingCommsSurfaceChange(
  window: BrowserWindow,
  previous: FloatingCommsSurfaceIdentity | null,
  current: FloatingCommsSurfaceIdentity | null,
  reason: FloatingCommsSurfaceChangedReason,
  sessionState: FloatingCommsSessionState | null
): void {
  window.webContents.send(
    'floatingComms:surfaceChanged',
    createFloatingCommsSurfaceChange(previous, current, reason, sessionState)
  )
}
