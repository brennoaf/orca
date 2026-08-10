import type { BrowserWindow } from 'electron'

export function destroyCommunicationsDockWindow(window: BrowserWindow | null): void {
  if (window && !window.isDestroyed()) {
    window.destroy()
  }
}
