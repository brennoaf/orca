import type { BrowserWindow } from 'electron'

export function showCommunicationsDockWindow(window: BrowserWindow): void {
  if (window.isMinimized()) {
    window.restore()
  }
  window.show()
  window.focus()
}

export function requireCommunicationsDockWindow(window: BrowserWindow | null): BrowserWindow {
  if (!window || window.isDestroyed()) {
    throw new Error('communications_dock_unavailable')
  }
  return window
}
