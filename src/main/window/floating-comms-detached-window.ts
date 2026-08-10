import type { BrowserWindow } from 'electron'
import type { WindowRect } from './window-bounds-validation'
import {
  FLOATING_COMMS_DETACHED_MAX_HEIGHT,
  FLOATING_COMMS_DETACHED_MAX_WIDTH,
  FLOATING_COMMS_DETACHED_MIN_HEIGHT,
  FLOATING_COMMS_DETACHED_MIN_WIDTH
} from './floating-comms-detached-layout'

export type FloatingCommsDetachedWindowLifecycle = {
  closed: () => void
  crashed: () => void
  minimize: () => void
  saveBounds: (bounds: WindowRect) => void
}

export type FloatingCommsDetachedWindowBinding = {
  release: () => void
}

export function bindFloatingCommsDetachedWindow(
  window: BrowserWindow,
  bounds: WindowRect,
  lifecycle: FloatingCommsDetachedWindowLifecycle
): FloatingCommsDetachedWindowBinding {
  window.setParentWindow(null)
  window.setResizable(true)
  window.setMinimizable(true)
  window.setMaximizable(false)
  window.setMinimumSize(FLOATING_COMMS_DETACHED_MIN_WIDTH, FLOATING_COMMS_DETACHED_MIN_HEIGHT)
  window.setMaximumSize(FLOATING_COMMS_DETACHED_MAX_WIDTH, FLOATING_COMMS_DETACHED_MAX_HEIGHT)
  window.setAlwaysOnTop(true, 'normal')
  window.setSkipTaskbar(true)
  window.setBounds(bounds, false)

  let released = false
  let boundsTimer: ReturnType<typeof setTimeout> | null = null
  const saveBounds = (): void => {
    if (boundsTimer) {
      clearTimeout(boundsTimer)
    }
    boundsTimer = setTimeout(() => {
      boundsTimer = null
      if (!released && !window.isDestroyed() && !window.isMinimized()) {
        lifecycle.saveBounds(window.getBounds())
      }
    }, 200)
  }
  const minimize = (): void => {
    if (!released) {
      lifecycle.minimize()
    }
  }
  const close = (event: Electron.Event): void => {
    if (!released) {
      event.preventDefault()
      lifecycle.minimize()
    }
  }
  const closed = (): void => {
    if (!released) {
      lifecycle.closed()
    }
  }
  const crashed = (): void => {
    if (!released) {
      lifecycle.crashed()
    }
  }

  window.on('move', saveBounds)
  window.on('resize', saveBounds)
  window.on('minimize', minimize)
  window.on('close', close)
  window.on('closed', closed)
  window.webContents.on('render-process-gone', crashed)

  return {
    release: () => {
      if (released) {
        return
      }
      released = true
      if (boundsTimer) {
        clearTimeout(boundsTimer)
        boundsTimer = null
      }
      window.removeListener('move', saveBounds)
      window.removeListener('resize', saveBounds)
      window.removeListener('minimize', minimize)
      window.removeListener('close', close)
      window.removeListener('closed', closed)
      window.webContents.removeListener('render-process-gone', crashed)
    }
  }
}
