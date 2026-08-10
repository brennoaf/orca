import type { BrowserWindow, WebContents } from 'electron'
import {
  clampFloatingCommsSurfaceHeight,
  type FloatingCommsOpenRequest,
  type FloatingCommsSurfaceIdentity,
  type FloatingCommsUpdateRequest
} from '../../shared/floating-comms-surface'
import { getTrustedUIRendererWindow } from '../ipc/ui'
import { createFloatingCommsSurfaceChildWindow } from './floating-comms-surface-child-window'
import { createFloatingCommsAttachedGeometry } from './floating-comms-attached-geometry'
import { openFloatingCommsAttachedSurface } from './floating-comms-attached-open'

export { shouldUseFloatingCommsDomFallback } from './floating-comms-surface-child-window'

let floatingCommsWindow: BrowserWindow | null = null
let floatingCommsOwner: BrowserWindow | null = null
let currentRequest: FloatingCommsOpenRequest | null = null
let currentIdentity: FloatingCommsSurfaceIdentity | null = null
let visibleRequest: FloatingCommsSurfaceIdentity | null = null
let releaseWindowListeners: (() => void) | null = null
let surfaceLoaded = false
let surfaceMeasured = false
let lifecycleHandlers: FloatingCommsAttachedLifecycleHandlers | null = null

export type FloatingCommsAttachedLifecycleHandlers = {
  onClosed: (identity: FloatingCommsSurfaceIdentity) => void
  onFallback: (identity: FloatingCommsSurfaceIdentity) => void
}

type FloatingCommsLegacyUpdateRequest = FloatingCommsOpenRequest & {
  geometryRequestId: number | null
}

export const isFloatingCommsSurfaceRenderer = (sender: WebContents): boolean =>
  floatingCommsWindow?.webContents === sender && !sender.isDestroyed()

function matchesIdentity(identity: FloatingCommsSurfaceIdentity): boolean {
  return (
    currentIdentity?.appId === identity.appId &&
    currentIdentity.requestId === identity.requestId &&
    currentIdentity.surfaceId === identity.surfaceId &&
    currentIdentity.mode === identity.mode
  )
}

const isCurrentWindow = (window: BrowserWindow): boolean =>
  floatingCommsWindow === window && !window.isDestroyed()

function isCurrentOwner(owner: BrowserWindow): boolean {
  return (
    floatingCommsOwner === owner && !owner.isDestroyed() && getTrustedUIRendererWindow() === owner
  )
}

function releaseFloatingCommsOwnership(): void {
  floatingCommsOwner = null
  currentRequest = null
  currentIdentity = null
  visibleRequest = null
  surfaceLoaded = false
  surfaceMeasured = false
  lifecycleHandlers = null
  attachedGeometry.reset()
  releaseWindowListeners?.()
  releaseWindowListeners = null
}

const attachedGeometry = createFloatingCommsAttachedGeometry({
  current: () => {
    const window = floatingCommsWindow
    if (!window || window.isDestroyed() || !currentRequest || !currentIdentity) {
      return null
    }
    return {
      identity: currentIdentity,
      loaded: surfaceLoaded,
      measured: surfaceMeasured,
      request: currentRequest,
      visible: visibleRequest,
      window
    }
  },
  destroy: () => destroyFloatingCommsSurface(),
  fallback: (requestIdentity) => {
    const handlers = lifecycleHandlers
    destroyFloatingCommsSurface()
    handlers?.onFallback({ ...requestIdentity, mode: 'attached-dom' })
  },
  isCurrentOwner,
  setVisible: (identity) => void (visibleRequest = identity)
})

export const getFloatingCommsSurfaceIdentity = (): FloatingCommsSurfaceIdentity | null =>
  currentIdentity

export function isFloatingCommsSurfaceVisible(): boolean {
  const window = floatingCommsWindow
  return Boolean(
    currentRequest &&
    visibleRequest &&
    matchesIdentity(visibleRequest) &&
    window &&
    !window.isDestroyed() &&
    window.isVisible()
  )
}

export function closeFloatingCommsSurface(identity?: FloatingCommsSurfaceIdentity | number): void {
  const request = currentRequest
  const requestIdentity = currentIdentity
  const identityMismatch =
    typeof identity === 'number'
      ? request?.requestId !== identity
      : identity !== undefined && !matchesIdentity(identity)
  if (!request || !requestIdentity || identityMismatch) {
    return
  }
  const handlers = lifecycleHandlers
  currentRequest = null
  currentIdentity = null
  lifecycleHandlers = null
  surfaceMeasured = false
  attachedGeometry.reset()
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
  handlers?.onClosed(requestIdentity)
}

function createFloatingCommsWindow(
  parent: BrowserWindow,
  loadFailed?: (window: BrowserWindow, error: unknown) => void
): BrowserWindow {
  return createFloatingCommsSurfaceChildWindow(parent, {
    close: (identity) => closeFloatingCommsSurface(identity),
    isCurrent: isCurrentWindow,
    loaded: () => {
      surfaceLoaded = true
      return currentIdentity
    },
    loadFailed,
    closed: (window) => {
      if (floatingCommsWindow !== window) {
        return
      }
      const closedRequest = currentIdentity ?? visibleRequest
      const handlers = lifecycleHandlers
      floatingCommsWindow = null
      releaseFloatingCommsOwnership()
      if (closedRequest) {
        handlers?.onClosed(closedRequest)
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
  request: FloatingCommsOpenRequest,
  requestIdentity: FloatingCommsSurfaceIdentity = {
    appId: request.appId,
    requestId: request.requestId,
    surfaceId: request.requestId,
    mode: 'attached-native'
  },
  handlers: FloatingCommsAttachedLifecycleHandlers = {
    onClosed: () => void 0,
    onFallback: () => void 0
  },
  reusableWindow?: BrowserWindow
): boolean {
  lifecycleHandlers = handlers
  return openFloatingCommsAttachedSurface(owner, request, requestIdentity, reusableWindow, {
    createWindow: createFloatingCommsWindow,
    currentRequest: () => currentRequest,
    destroy: destroyFloatingCommsSurface,
    loaded: () => surfaceLoaded,
    owner: () => floatingCommsOwner,
    reposition: (currentOwner) => void attachedGeometry.reposition(currentOwner),
    requestRefresh: (currentOwner) => attachedGeometry.begin(currentOwner),
    resetGeometry: () => attachedGeometry.reset(),
    setCurrent: (currentOwner, currentRequestValue, identity) => {
      floatingCommsOwner = currentOwner
      currentRequest = currentRequestValue
      currentIdentity = identity
      surfaceMeasured = false
    },
    setReleaseListeners: (release) => {
      releaseWindowListeners?.()
      releaseWindowListeners = release
    },
    setWindow: (window) => {
      floatingCommsWindow = window
      surfaceLoaded = !window.webContents.isLoading()
    },
    window: () => floatingCommsWindow,
    windowIsCurrent: isCurrentWindow
  })
}

export function updateFloatingCommsSurface(
  owner: BrowserWindow,
  request: FloatingCommsUpdateRequest | FloatingCommsLegacyUpdateRequest
): boolean | null {
  const strictIdentity = 'surfaceId' in request && 'mode' in request
  if (
    floatingCommsOwner !== owner ||
    !currentRequest ||
    currentRequest.appId !== request.appId ||
    currentRequest.requestId !== request.requestId ||
    (strictIdentity && !matchesIdentity(request))
  ) {
    if (floatingCommsOwner && getTrustedUIRendererWindow() !== floatingCommsOwner) {
      destroyFloatingCommsSurface()
    }
    return null
  }
  if (!attachedGeometry.accept(request.geometryRequestId)) {
    return null
  }
  currentRequest = {
    appId: request.appId,
    requestId: request.requestId,
    anchor: request.anchor,
    workspace: request.workspace,
    height: request.height
  }
  return attachedGeometry.reposition(owner, request.geometryRequestId !== null)
}

export function resizeFloatingCommsSurface(
  requestIdentity: FloatingCommsSurfaceIdentity | number,
  height: number
): void {
  const request = currentRequest
  const admittedIdentity =
    typeof requestIdentity === 'number'
      ? currentIdentity?.requestId === requestIdentity
      : matchesIdentity(requestIdentity)
  if (!request || !admittedIdentity) {
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
  if (attachedGeometry.awaiting()) {
    if (firstMeasurement) {
      if (currentIdentity) {
        attachedGeometry.recordFirstMeasurement(currentIdentity)
      }
    }
    return
  }
  const owner = floatingCommsOwner
  if (!owner || attachedGeometry.reposition(owner) !== true) {
    return
  }
  if (firstMeasurement && window && !window.isDestroyed()) {
    visibleRequest = currentIdentity
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

export function takeFloatingCommsSurfaceWindow(
  requestIdentity: FloatingCommsSurfaceIdentity
): BrowserWindow | null {
  if (!matchesIdentity(requestIdentity)) {
    return null
  }
  const window = floatingCommsWindow
  floatingCommsWindow = null
  releaseFloatingCommsOwnership()
  return window && !window.isDestroyed() ? window : null
}

export function createUnownedFloatingCommsSurfaceWindow(
  owner: BrowserWindow,
  loadFailed: (window: BrowserWindow, error: unknown) => void
): BrowserWindow {
  const window = createFloatingCommsWindow(owner, loadFailed)
  window.setParentWindow(null)
  return window
}

export function destroyFloatingCommsSurface(): void {
  const window = floatingCommsWindow
  floatingCommsWindow = null
  releaseFloatingCommsOwnership()
  if (window && !window.isDestroyed()) {
    window.destroy()
  }
}
