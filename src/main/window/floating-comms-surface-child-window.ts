import { BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'node:path'
import type { FloatingCommsSurfaceIdentity } from '../../shared/floating-comms-surface'
import { installPrivilegedWindowNavigationPolicy } from './privileged-window-navigation'
import { floatingCommsSurfaceWindowOptions } from './floating-comms-surface-window-options'

export function shouldUseFloatingCommsDomFallback(): boolean {
  return (
    process.platform === 'linux' &&
    (process.env.XDG_SESSION_TYPE?.toLowerCase() === 'wayland' ||
      Boolean(process.env.WAYLAND_DISPLAY))
  )
}

async function loadFloatingCommsSurface(window: BrowserWindow): Promise<void> {
  await (is.dev && process.env.ELECTRON_RENDERER_URL
    ? window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/floating-comms.html`)
    : window.loadFile(join(__dirname, '../renderer/floating-comms.html')))
}

export function createFloatingCommsSurfaceChildWindow(
  parent: BrowserWindow,
  lifecycle: {
    close: (identity: FloatingCommsSurfaceIdentity) => void
    isCurrent: (window: BrowserWindow) => boolean
    loaded: (window: BrowserWindow) => FloatingCommsSurfaceIdentity | null
    loadFailed?: (window: BrowserWindow, error: unknown) => void
    closed: (window: BrowserWindow) => void
    takeVisible: () => FloatingCommsSurfaceIdentity | null
    visible: () => FloatingCommsSurfaceIdentity | null
  }
): BrowserWindow {
  const window = new BrowserWindow(
    floatingCommsSurfaceWindowOptions(parent, join(__dirname, '../preload/index.js'))
  )
  installPrivilegedWindowNavigationPolicy(window.webContents)
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
  window.webContents.session.setPermissionCheckHandler(() => false)
  window.on('blur', () => {
    const visibleRequest = lifecycle.isCurrent(window) ? lifecycle.visible() : null
    if (visibleRequest) {
      lifecycle.close(visibleRequest)
    }
  })
  window.on('show', () => {
    const visibleRequest = lifecycle.isCurrent(window) ? lifecycle.visible() : null
    if (visibleRequest) {
      window.webContents.send('floatingComms:visibilityChanged', {
        ...visibleRequest,
        visible: true
      })
    }
  })
  window.on('hide', () => {
    if (!lifecycle.isCurrent(window)) {
      return
    }
    const hiddenRequest = lifecycle.takeVisible()
    if (hiddenRequest) {
      window.webContents.send('floatingComms:visibilityChanged', {
        ...hiddenRequest,
        visible: false
      })
    }
  })
  window.webContents.on('before-input-event', (event, input) => {
    if (lifecycle.isCurrent(window) && input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault()
      const visibleRequest = lifecycle.visible()
      if (visibleRequest) {
        lifecycle.close(visibleRequest)
      }
    }
  })
  window.webContents.on('did-finish-load', () => {
    if (!lifecycle.isCurrent(window)) {
      return
    }
    const requestIdentity = lifecycle.loaded(window)
    if (requestIdentity) {
      window.webContents.send('floatingComms:stateChanged', requestIdentity)
    }
  })
  window.on('closed', () => {
    lifecycle.closed(window)
  })
  void loadFloatingCommsSurface(window).catch((error: unknown) => {
    console.error('[floating-comms] renderer load failed:', error)
    if (lifecycle.loadFailed) {
      lifecycle.loadFailed(window, error)
    } else if (lifecycle.isCurrent(window)) {
      window.destroy()
    }
  })
  return window
}
