import type { BrowserWindow } from 'electron'
import type {
  CommunicationsDockLayout,
  CommunicationsDockPresence
} from '../../shared/communications-dock'

export function communicationsDockPresence(
  window: BrowserWindow | null,
  layout: CommunicationsDockLayout | null
): CommunicationsDockPresence {
  if (!window || window.isDestroyed()) {
    return { exists: false, visible: false }
  }
  const tab = layout?.tabs.find((entry) => entry.id === layout.activeTabId) ?? layout?.tabs[0]
  return {
    exists: true,
    visible: window.isVisible(),
    ...(tab ? { activeAppId: tab.activeLeafAppId } : {})
  }
}
