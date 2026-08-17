import { BrowserWindow, screen } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'node:path'
import type { CommunicationsDockBounds } from '../../shared/communications-dock'
import { installPrivilegedWindowNavigationPolicy } from './privileged-window-navigation'
import { registerNativeAppearanceWindow } from '../native-appearance-windows'
import {
  COMMUNICATIONS_DOCK_MAX_WIDTH,
  COMMUNICATIONS_DOCK_MIN_HEIGHT,
  COMMUNICATIONS_DOCK_MIN_WIDTH
} from './communications-dock-layout'

export type CommunicationsDockWindowLifecycle = {
  boundsChanged: (bounds: CommunicationsDockBounds) => void
  closed: () => void
  crashed: () => void
  hideRequested: () => void
  loaded: () => void
}

export function clampCommunicationsDockBounds(
  bounds: CommunicationsDockBounds
): CommunicationsDockBounds {
  const display = screen.getDisplayMatching(bounds)
  const area = display.workArea
  const width = Math.min(
    Math.max(bounds.width, COMMUNICATIONS_DOCK_MIN_WIDTH),
    Math.min(COMMUNICATIONS_DOCK_MAX_WIDTH, area.width)
  )
  const height = Math.min(Math.max(bounds.height, COMMUNICATIONS_DOCK_MIN_HEIGHT), area.height)
  return {
    x: Math.min(Math.max(bounds.x, area.x), area.x + area.width - width),
    y: Math.min(Math.max(bounds.y, area.y), area.y + area.height - height),
    width,
    height
  }
}

export function communicationsDockMaximumHeight(bounds: CommunicationsDockBounds): number {
  return Math.max(COMMUNICATIONS_DOCK_MIN_HEIGHT, screen.getDisplayMatching(bounds).workArea.height)
}

export function createCommunicationsDockWindow(
  bounds: CommunicationsDockBounds,
  lifecycle: CommunicationsDockWindowLifecycle
): BrowserWindow {
  const initialBounds = clampCommunicationsDockBounds(bounds)
  const window = new BrowserWindow({
    ...initialBounds,
    frame: false,
    transparent: false,
    thickFrame: process.platform === 'win32',
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    minWidth: COMMUNICATIONS_DOCK_MIN_WIDTH,
    minHeight: COMMUNICATIONS_DOCK_MIN_HEIGHT,
    maxWidth: COMMUNICATIONS_DOCK_MAX_WIDTH,
    maxHeight: communicationsDockMaximumHeight(initialBounds),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'orca-floating-comms-surface',
      webviewTag: false
    }
  })
  registerNativeAppearanceWindow(window)
  installPrivilegedWindowNavigationPolicy(window.webContents)
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
  window.webContents.session.setPermissionCheckHandler(() => false)
  let suppressBounds = false
  let boundsTimer: ReturnType<typeof setTimeout> | null = null
  let maximumHeight = communicationsDockMaximumHeight(initialBounds)
  const saveBounds = (): void => {
    if (suppressBounds) {
      return
    }
    if (boundsTimer) {
      clearTimeout(boundsTimer)
    }
    boundsTimer = setTimeout(() => {
      boundsTimer = null
      if (!window.isDestroyed()) {
        lifecycle.boundsChanged(window.getBounds())
      }
    }, 200)
  }
  window.on('move', () => {
    const nextMaximumHeight = communicationsDockMaximumHeight(window.getBounds())
    if (nextMaximumHeight !== maximumHeight) {
      maximumHeight = nextMaximumHeight
      window.setMaximumSize(COMMUNICATIONS_DOCK_MAX_WIDTH, maximumHeight)
    }
    saveBounds()
  })
  window.on('resize', saveBounds)
  window.on('close', (event) => {
    event.preventDefault()
    lifecycle.hideRequested()
  })
  window.on('closed', lifecycle.closed)
  window.webContents.on('render-process-gone', lifecycle.crashed)
  window.webContents.on('did-finish-load', lifecycle.loaded)
  const originalSetBounds = window.setBounds.bind(window)
  window.setBounds = (nextBounds, animate): void => {
    suppressBounds = true
    originalSetBounds(nextBounds, animate)
    queueMicrotask(() => {
      suppressBounds = false
    })
  }
  void (
    is.dev && process.env.ELECTRON_RENDERER_URL
      ? window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/floating-comms.html`)
      : window.loadFile(join(__dirname, '../renderer/floating-comms.html'))
  ).catch((error: unknown) => {
    console.error('[communications-dock] renderer load failed:', error)
    lifecycle.crashed()
  })
  return window
}
