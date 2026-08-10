import type { BrowserWindow, WebContents } from 'electron'
import {
  listCommunicationsDockApps,
  type CommunicationsDockLayout
} from '../../shared/communications-dock'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'

export function isCommunicationsDockAppFocusedVisible(args: {
  window: BrowserWindow | null
  sender: WebContents | null
  appId: FloatingWorkspaceAppId
  layout: CommunicationsDockLayout
}): boolean {
  const { window } = args
  if (
    !window ||
    window.isDestroyed() ||
    (args.sender !== null && window.webContents !== args.sender) ||
    !window.isVisible() ||
    !window.isFocused() ||
    args.layout.collapsed
  ) {
    return false
  }
  const tab =
    args.layout.tabs.find((entry) => entry.id === args.layout.activeTabId) ?? args.layout.tabs[0]
  return listCommunicationsDockApps(tab.layout).includes(args.appId)
}
