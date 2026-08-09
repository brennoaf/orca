import { app, BrowserWindow, screen, type WebContents } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'node:path'
import type { FloatingCommsOpenRequest } from '../../shared/floating-comms-surface'
import { installPrivilegedWindowNavigationPolicy } from './privileged-window-navigation'
import { getTrustedUIRendererWindow, sendToTrustedUIRenderer } from '../ipc/ui'
import {
  FLOATING_COMMS_SURFACE_MAX_HEIGHT,
  FLOATING_COMMS_SURFACE_WIDTH,
  placeFloatingCommsSurface
} from './floating-comms-surface-placement'

const FLOATING_COMMS_PARTITION = 'orca-floating-comms-surface'

let floatingCommsWindow: BrowserWindow | null = null
let currentRequest: FloatingCommsOpenRequest | null = null
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

export function getFloatingCommsSurfaceAppId() {
  return currentRequest?.appId ?? null
}

export function isFloatingCommsSurfaceVisible(): boolean {
  const window = floatingCommsWindow
  return Boolean(currentRequest && window && !window.isDestroyed() && window.isVisible())
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
    const appId = currentRequest.appId
    destroyFloatingCommsSurface()
    sendToTrustedUIRenderer('floatingComms:fallback', appId)
    return false
  }
  window.setBounds(placement, false)
  return true
}

export function closeFloatingCommsSurface(): void {
  currentRequest = null
  surfaceMeasured = false
  const window = floatingCommsWindow
  if (window && !window.isDestroyed()) {
    window.hide()
  }
  sendToTrustedUIRenderer('floatingComms:closed', null)
}

function createFloatingCommsWindow(parent: BrowserWindow): BrowserWindow {
  const window = new BrowserWindow({
    parent,
    width: FLOATING_COMMS_SURFACE_WIDTH,
    height: FLOATING_COMMS_SURFACE_MAX_HEIGHT,
    modal: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: FLOATING_COMMS_PARTITION,
      webviewTag: false
    }
  })
  installPrivilegedWindowNavigationPolicy(window.webContents)
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
  window.webContents.session.setPermissionCheckHandler(() => false)
  window.on('blur', closeFloatingCommsSurface)
  window.on('show', () => window.webContents.send('floatingComms:visibilityChanged', true))
  window.on('hide', () => window.webContents.send('floatingComms:visibilityChanged', false))
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault()
      closeFloatingCommsSurface()
    }
  })
  window.webContents.on('did-finish-load', () => {
    surfaceLoaded = true
    if (currentRequest) {
      window.webContents.send('floatingComms:stateChanged', currentRequest.appId)
    }
  })
  window.on('closed', () => {
    const notifyClosed = currentRequest !== null
    releaseWindowListeners?.()
    releaseWindowListeners = null
    if (floatingCommsWindow === window) {
      floatingCommsWindow = null
    }
    currentRequest = null
    surfaceLoaded = false
    surfaceMeasured = false
    if (notifyClosed) {
      sendToTrustedUIRenderer('floatingComms:closed', null)
    }
  })
  void loadSurface(window).catch((error: unknown) => {
    console.error('[floating-comms] renderer load failed:', error)
    if (!window.isDestroyed()) {
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
      reposition()
    }
    parent.on('move', update)
    parent.on('resize', update)
    parent.webContents.on('zoom-changed', update)
    screen.on('display-added', update)
    screen.on('display-removed', update)
    screen.on('display-metrics-changed', update)
    const destroy = (): void => {
      if (!createdWindow.isDestroyed()) {
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
    window.webContents.send('floatingComms:stateChanged', request.appId)
  }
  return true
}

export function updateFloatingCommsSurface(request: FloatingCommsOpenRequest): boolean | null {
  if (!currentRequest || currentRequest.appId !== request.appId) {
    return null
  }
  currentRequest = request
  return reposition()
}

export function resizeFloatingCommsSurface(height: number): void {
  if (!currentRequest) {
    return
  }
  currentRequest = { ...currentRequest, height: Math.min(Math.max(height, 1), 420) }
  reposition()
  const window = floatingCommsWindow
  if (!surfaceMeasured && surfaceLoaded && window && !window.isDestroyed()) {
    surfaceMeasured = true
    window.show()
    window.focus()
  }
}

export function destroyFloatingCommsSurface(): void {
  const window = floatingCommsWindow
  floatingCommsWindow = null
  currentRequest = null
  surfaceLoaded = false
  surfaceMeasured = false
  releaseWindowListeners?.()
  releaseWindowListeners = null
  if (window && !window.isDestroyed()) {
    window.destroy()
  }
}
