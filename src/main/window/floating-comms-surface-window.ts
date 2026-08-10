import type { BrowserWindow, WebContents } from 'electron'
import {
  clampFloatingCommsSurfaceHeight,
  type FloatingCommsOpenRequest,
  type FloatingCommsSurfaceIdentity,
  type FloatingCommsUpdateRequest
} from '../../shared/floating-comms-surface'
import { getTrustedUIRendererWindow, sendToTrustedUIRenderer } from '../ipc/ui'
import { createFloatingCommsSurfaceChildWindow } from './floating-comms-surface-child-window'
import {
  bindFloatingCommsGeometryListeners,
  createFloatingCommsGeometryCoordinator,
  floatingCommsWorkspaceIntersectsBounds,
  getFloatingCommsSurfacePlacement
} from './floating-comms-surface-geometry'

export { shouldUseFloatingCommsDomFallback } from './floating-comms-surface-child-window'

let floatingCommsWindow: BrowserWindow | null = null
let floatingCommsOwner: BrowserWindow | null = null
let currentRequest: FloatingCommsOpenRequest | null = null
let visibleRequest: FloatingCommsSurfaceIdentity | null = null
let releaseWindowListeners: (() => void) | null = null
let surfaceLoaded = false
let surfaceMeasured = false

export function isFloatingCommsSurfaceRenderer(sender: WebContents): boolean {
  return floatingCommsWindow?.webContents === sender && !sender.isDestroyed()
}

function identity(request: FloatingCommsOpenRequest): FloatingCommsSurfaceIdentity {
  return { appId: request.appId, requestId: request.requestId }
}

function isCurrentWindow(window: BrowserWindow): boolean {
  return floatingCommsWindow === window && !window.isDestroyed()
}

function isCurrentOwner(owner: BrowserWindow): boolean {
  return (
    floatingCommsOwner === owner && !owner.isDestroyed() && getTrustedUIRendererWindow() === owner
  )
}

const geometryCoordinator = createFloatingCommsGeometryCoordinator({
  isCurrent: (owner, requestIdentity) =>
    isCurrentOwner(owner) &&
    currentRequest?.appId === requestIdentity.appId &&
    currentRequest.requestId === requestIdentity.requestId,
  onTimeout: (requestIdentity) => {
    destroyFloatingCommsSurface()
    sendToTrustedUIRenderer('floatingComms:fallback', requestIdentity)
  }
})

export function getFloatingCommsSurfaceIdentity(): FloatingCommsSurfaceIdentity | null {
  return currentRequest ? identity(currentRequest) : null
}

export function isFloatingCommsSurfaceVisible(): boolean {
  const window = floatingCommsWindow
  return Boolean(
    currentRequest &&
    visibleRequest &&
    currentRequest.appId === visibleRequest.appId &&
    currentRequest.requestId === visibleRequest.requestId &&
    window &&
    !window.isDestroyed() &&
    window.isVisible()
  )
}

function requestFreshGeometry(owner: BrowserWindow): void {
  const window = floatingCommsWindow
  if (!isCurrentOwner(owner)) {
    destroyFloatingCommsSurface()
    return
  }
  if (!window || window.isDestroyed() || !currentRequest) {
    return
  }
  geometryCoordinator.begin(owner, identity(currentRequest), window, visibleRequest)
}

function reposition(owner: BrowserWindow, freshGeometry = false): boolean | null {
  const window = floatingCommsWindow
  if (!window || window.isDestroyed() || !currentRequest) {
    return null
  }
  if (!isCurrentOwner(owner)) {
    destroyFloatingCommsSurface()
    return null
  }
  if (geometryCoordinator.isAwaiting() && !freshGeometry) {
    return null
  }
  const placement = getFloatingCommsSurfacePlacement(owner, currentRequest)
  if (!placement) {
    const requestIdentity = identity(currentRequest)
    destroyFloatingCommsSurface()
    sendToTrustedUIRenderer('floatingComms:fallback', requestIdentity)
    return false
  }
  window.setBounds(placement, false)
  if (freshGeometry) {
    const { suspendedRequest, shouldFocus } = geometryCoordinator.complete()
    if (
      suspendedRequest &&
      suspendedRequest.appId === currentRequest.appId &&
      suspendedRequest.requestId === currentRequest.requestId &&
      surfaceLoaded &&
      surfaceMeasured
    ) {
      visibleRequest = identity(currentRequest)
      if (shouldFocus) {
        window.show()
        window.focus()
      } else {
        window.showInactive()
      }
    }
  }
  return true
}

export function closeFloatingCommsSurface(requestId?: number): void {
  const request = currentRequest
  if (!request || (requestId !== undefined && request.requestId !== requestId)) {
    return
  }
  const requestIdentity = identity(request)
  currentRequest = null
  surfaceMeasured = false
  geometryCoordinator.reset()
  const window = floatingCommsWindow
  if (window && !window.isDestroyed()) {
    visibleRequest = null
    if (surfaceLoaded) {
      window.webContents.send('floatingComms:visibilityChanged', {
        ...requestIdentity,
        visible: false
      })
    }
    window.hide()
  }
  sendToTrustedUIRenderer('floatingComms:closed', requestIdentity)
}

function createFloatingCommsWindow(parent: BrowserWindow): BrowserWindow {
  return createFloatingCommsSurfaceChildWindow(parent, {
    close: closeFloatingCommsSurface,
    isCurrent: isCurrentWindow,
    loaded: () => {
      surfaceLoaded = true
      return currentRequest ? identity(currentRequest) : null
    },
    closed: (window) => {
      if (floatingCommsWindow !== window) {
        return
      }
      const closedRequest = currentRequest ? identity(currentRequest) : visibleRequest
      releaseWindowListeners?.()
      releaseWindowListeners = null
      floatingCommsWindow = null
      floatingCommsOwner = null
      currentRequest = null
      visibleRequest = null
      surfaceLoaded = false
      surfaceMeasured = false
      geometryCoordinator.reset()
      if (closedRequest) {
        sendToTrustedUIRenderer('floatingComms:closed', closedRequest)
      }
    },
    takeVisible: () => {
      const request = visibleRequest
      visibleRequest = null
      return request
    },
    visible: () => visibleRequest
  })
}

export function openFloatingCommsSurface(
  owner: BrowserWindow,
  request: FloatingCommsOpenRequest
): boolean {
  if (owner.isDestroyed() || getTrustedUIRendererWindow() !== owner) {
    throw new Error('floating_comms_parent_unavailable')
  }
  if (floatingCommsOwner && floatingCommsOwner !== owner) {
    destroyFloatingCommsSurface()
  }
  const placement = getFloatingCommsSurfacePlacement(owner, request)
  if (!placement) {
    destroyFloatingCommsSurface()
    return false
  }
  floatingCommsOwner = owner
  currentRequest = request
  surfaceMeasured = false
  geometryCoordinator.reset()
  let window = floatingCommsWindow
  if (!window || window.isDestroyed()) {
    const createdWindow = createFloatingCommsWindow(owner)
    window = createdWindow
    floatingCommsWindow = createdWindow
    releaseWindowListeners = bindFloatingCommsGeometryListeners({
      owner,
      window: createdWindow,
      isCurrentWindow: () => isCurrentWindow(createdWindow),
      isDisplayRelevant: (bounds) =>
        floatingCommsWorkspaceIntersectsBounds(owner, currentRequest, bounds),
      reposition: () => void reposition(owner),
      requestRefresh: () => requestFreshGeometry(owner)
    })
  }
  window.setBounds(placement, false)
  if (surfaceLoaded) {
    window.webContents.send('floatingComms:stateChanged', identity(request))
  }
  return true
}

export function updateFloatingCommsSurface(
  owner: BrowserWindow,
  request: FloatingCommsUpdateRequest
): boolean | null {
  if (
    floatingCommsOwner !== owner ||
    !currentRequest ||
    currentRequest.appId !== request.appId ||
    currentRequest.requestId !== request.requestId
  ) {
    if (floatingCommsOwner && getTrustedUIRendererWindow() !== floatingCommsOwner) {
      destroyFloatingCommsSurface()
    }
    return null
  }
  if (!geometryCoordinator.accept(request.geometryRequestId)) {
    return null
  }
  const { geometryRequestId, ...nextRequest } = request
  currentRequest = nextRequest
  return reposition(owner, geometryRequestId !== null)
}

export function resizeFloatingCommsSurface(requestId: number, height: number): void {
  const request = currentRequest
  if (!request || request.requestId !== requestId) {
    return
  }
  const resizedRequest = { ...request, height: clampFloatingCommsSurfaceHeight(height) }
  currentRequest = resizedRequest
  const window = floatingCommsWindow
  const firstMeasurement = Boolean(
    !surfaceMeasured && surfaceLoaded && window && !window.isDestroyed()
  )
  if (firstMeasurement) {
    surfaceMeasured = true
  }
  if (geometryCoordinator.isAwaiting()) {
    if (firstMeasurement) {
      geometryCoordinator.recordFirstMeasurement(identity(resizedRequest))
    }
    return
  }
  const owner = floatingCommsOwner
  if (!owner || reposition(owner) !== true) {
    return
  }
  if (firstMeasurement && window && !window.isDestroyed()) {
    visibleRequest = identity(resizedRequest)
    if (window.isVisible()) {
      window.webContents.send('floatingComms:visibilityChanged', {
        ...visibleRequest,
        visible: true
      })
    } else {
      window.show()
    }
    window.focus()
  }
}

export function destroyFloatingCommsSurface(): void {
  const window = floatingCommsWindow
  floatingCommsWindow = null
  floatingCommsOwner = null
  currentRequest = null
  visibleRequest = null
  surfaceLoaded = false
  surfaceMeasured = false
  geometryCoordinator.reset()
  releaseWindowListeners?.()
  releaseWindowListeners = null
  if (window && !window.isDestroyed()) {
    window.destroy()
  }
}
