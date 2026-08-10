import { BrowserWindow, type WebContents } from 'electron'
import { getTrustedUIRendererWindow } from '../ipc/ui'
import { communicationsDockController } from './communications-dock-controller'
import { floatingCommsSurfaceController } from './floating-comms-surface-controller'

const APP_ID = 'whatsapp-web' as const

export function isZApiAttentionVisible(): boolean {
  return (
    communicationsDockController.isAppFocusedVisible(null, APP_ID) ||
    isFloatingCommsAppFocusedVisible(null)
  )
}

export function canMarkZApiAttentionSeen(sender: WebContents): boolean {
  return (
    communicationsDockController.isAppFocusedVisible(sender, APP_ID) ||
    isFloatingCommsAppFocusedVisible(sender)
  )
}

function isFloatingCommsAppFocusedVisible(sender: WebContents | null): boolean {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  if (!focusedWindow || (sender && focusedWindow.webContents !== sender)) {
    return false
  }
  const presentation = floatingCommsSurfaceController.getPresentation(APP_ID)
  if (!presentation?.visible) {
    return false
  }
  if (presentation.mode === 'attached-dom') {
    return getTrustedUIRendererWindow()?.webContents === focusedWindow.webContents
  }
  return (
    floatingCommsSurfaceController.getStateForSender(focusedWindow.webContents)?.appId === APP_ID
  )
}
