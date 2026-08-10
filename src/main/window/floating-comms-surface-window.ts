import { app, BrowserWindow, screen, type WebContents } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'node:path'
import {
  clampFloatingCommsSurfaceHeight,
  type FloatingCommsOpenRequest,
  type FloatingCommsSurfaceIdentity
} from '../../shared/floating-comms-surface'
import { installPrivilegedWindowNavigationPolicy } from './privileged-window-navigation'
import { getTrustedUIRendererWindow, sendToTrustedUIRenderer } from '../ipc/ui'
import { placeFloatingCommsSurface } from './floating-comms-surface-placement'
import { floatingCommsSurfaceWindowOptions } from './floating-comms-surface-window-options'

let floatingCommsWindow: BrowserWindow | null = null
let currentRequest: FloatingCommsOpenRequest | null = null
let visibleRequest: FloatingCommsSurfaceIdentity | null = null
let releaseWindowListeners: (() => void) | null = null
let surfaceLoaded = false
let surfaceMeasured = false

export function shouldUseFloatingCommsDomFallback(): boolean {
  return (
    process.platform === 'linux' &&
    (process.env.XDG_SESSION_TYPE?.toLowerCase() === 'wayland' ||
      Boolean(process.env.WAYLAND_DISPLAY))
  )
}

export function isFloatingCommsSurfaceRenderer(sender: WebContents): boolean {
  return floatingCommsWindow?.webContents === sender && !sender.isDestroyed()
}

function identity(request: FloatingCommsOpenRequest): FloatingCommsSurfaceIdentity {
  return { appId: request.appId, requestId: request.requestId }
}

function isCurrentWindow(window: BrowserWindow): boolean {
  return floatingCommsWindow === window && !window.isDestroyed()
}

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

async function loadSurface(window: BrowserWindow): Promise<void> {
  await (is.dev && process.env.ELECTRON_RENDERER_URL
    ? window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/floating-comms.html`)
    : window.loadFile(join(__dirname, '../renderer/floating-comms.html')))
}

function getPlacement(
  parent: BrowserWindow,
  request: FloatingCommsOpenRequest
): Electron.Rectangle | null {
  const contentBounds = parent.getContentBounds()
  const zoomFactor = parent.webContents.getZoomFactor()
  const anchor = request.anchor
  const matchingRect = {
    x: Math.round(contentBounds.x + anchor.x * zoomFactor),
    y: Math.round(contentBounds.y + anchor.y * zoomFactor),
    width: Math.max(1, Math.round(anchor.width * zoomFactor)),
    height: Math.max(1, Math.round(anchor.height * zoomFactor))
  }
  return placeFloatingCommsSurface({
    parentBounds: parent.getBounds(),
    contentBounds,
    workArea: screen.getDisplayMatching(matchingRect).workArea,
    anchor,
    zoomFactor,
    measuredHeight: request.height
  })
}

function reposition(): boolean | null {
  const window = floatingCommsWindow
  const parent = getTrustedUIRendererWindow()
  if (!window || window.isDestroyed() || !parent || parent.isDestroyed() || !currentRequest) {
    return null
  }
  const placement = getPlacement(parent, currentRequest)
  if (!placement) {
    const requestIdentity = identity(currentRequest)
    destroyFloatingCommsSurface()
    sendToTrustedUIRenderer('floatingComms:fallback', requestIdentity)
    return false
  }
  window.setBounds(placement, false)
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
  const window = new BrowserWindow(
    floatingCommsSurfaceWindowOptions(parent, join(__dirname, '../preload/index.js'))
  )
  installPrivilegedWindowNavigationPolicy(window.webContents)
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
  window.webContents.session.setPermissionCheckHandler(() => false)
  window.on('blur', () => {
    if (isCurrentWindow(window) && visibleRequest) {
      closeFloatingCommsSurface(visibleRequest.requestId)
    }
  })
  window.on('show', () => {
    if (isCurrentWindow(window) && visibleRequest) {
      window.webContents.send('floatingComms:visibilityChanged', {
        ...visibleRequest,
        visible: true
      })
    }
  })
  window.on('hide', () => {
    if (!isCurrentWindow(window)) {
      return
    }
    const hiddenRequest = visibleRequest
    visibleRequest = null
    if (hiddenRequest) {
      window.webContents.send('floatingComms:visibilityChanged', {
        ...hiddenRequest,
        visible: false
      })
    }
  })
  window.webContents.on('before-input-event', (event, input) => {
    if (!isCurrentWindow(window)) {
      return
    }
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault()
      if (visibleRequest) {
        closeFloatingCommsSurface(visibleRequest.requestId)
      }
    }
  })
  window.webContents.on('did-finish-load', () => {
    if (!isCurrentWindow(window)) {
      return
    }
    surfaceLoaded = true
    if (currentRequest) {
      window.webContents.send('floatingComms:stateChanged', identity(currentRequest))
    }
  })
  window.on('closed', () => {
    if (floatingCommsWindow !== window) {
      return
    }
    const closedRequest = currentRequest ? identity(currentRequest) : visibleRequest
    releaseWindowListeners?.()
    releaseWindowListeners = null
    floatingCommsWindow = null
    currentRequest = null
    visibleRequest = null
    surfaceLoaded = false
    surfaceMeasured = false
    if (closedRequest) {
      sendToTrustedUIRenderer('floatingComms:closed', closedRequest)
    }
  })
  void loadSurface(window).catch((error: unknown) => {
    console.error('[floating-comms] renderer load failed:', error)
    if (isCurrentWindow(window)) {
      window.destroy()
    }
  })
  return window
}

export function openFloatingCommsSurface(request: FloatingCommsOpenRequest): boolean {
  const parent = getTrustedUIRendererWindow()
  if (!parent || parent.isDestroyed()) {
    throw new Error('floating_comms_parent_unavailable')
  }
  const placement = getPlacement(parent, request)
  if (!placement) {
    destroyFloatingCommsSurface()
    return false
  }
  currentRequest = request
  surfaceMeasured = false
  let window = floatingCommsWindow
  if (!window || window.isDestroyed()) {
    const createdWindow = createFloatingCommsWindow(parent)
    window = createdWindow
    floatingCommsWindow = createdWindow
    const update = (): void => {
      if (isCurrentWindow(createdWindow)) {
        reposition()
      }
    }
    parent.on('move', update)
    parent.on('resize', update)
    parent.webContents.on('zoom-changed', update)
    screen.on('display-added', update)
    screen.on('display-removed', update)
    screen.on('display-metrics-changed', update)
    const destroy = (): void => {
      if (isCurrentWindow(createdWindow)) {
        createdWindow.destroy()
      }
    }
    parent.once('closed', destroy)
    app.once('before-quit', destroy)
    releaseWindowListeners = () => {
      parent.removeListener('move', update)
      parent.removeListener('resize', update)
      parent.webContents.removeListener('zoom-changed', update)
      parent.removeListener('closed', destroy)
      app.removeListener('before-quit', destroy)
      screen.removeListener('display-added', update)
      screen.removeListener('display-removed', update)
      screen.removeListener('display-metrics-changed', update)
    }
  }
  window.setBounds(placement, false)
  if (surfaceLoaded) {
    window.webContents.send('floatingComms:stateChanged', identity(request))
  }
  return true
}

export function updateFloatingCommsSurface(request: FloatingCommsOpenRequest): boolean | null {
  if (
    !currentRequest ||
    currentRequest.appId !== request.appId ||
    currentRequest.requestId !== request.requestId
  ) {
    return null
  }
  currentRequest = request
  return reposition()
}

export function resizeFloatingCommsSurface(requestId: number, height: number): void {
  const request = currentRequest
  if (!request || request.requestId !== requestId) {
    return
  }
  const resizedRequest = { ...request, height: clampFloatingCommsSurfaceHeight(height) }
  currentRequest = resizedRequest
  if (reposition() !== true) {
    return
  }
  const window = floatingCommsWindow
  if (!surfaceMeasured && surfaceLoaded && window && !window.isDestroyed()) {
    surfaceMeasured = true
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
  currentRequest = null
  visibleRequest = null
  surfaceLoaded = false
  surfaceMeasured = false
  releaseWindowListeners?.()
  releaseWindowListeners = null
  if (window && !window.isDestroyed()) {
    window.destroy()
  }
}
