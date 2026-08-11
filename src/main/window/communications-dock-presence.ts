import type { BrowserWindow } from 'electron'
import type {
  CommunicationsDockLayout,
  CommunicationsDockPresence
} from '../../shared/communications-dock'
import type { FloatingCommsSessionLocation } from './floating-comms-session-registry'

export function communicationsDockPresence(
  window: BrowserWindow | null,
  layout: CommunicationsDockLayout | null,
  location: FloatingCommsSessionLocation
): CommunicationsDockPresence {
  if (!window || window.isDestroyed()) {
    return { exists: false, visible: false, location }
  }
  const tab = layout?.tabs.find((entry) => entry.id === layout.activeTabId) ?? layout?.tabs[0]
  return {
    exists: true,
    visible: window.isVisible(),
    location,
    ...(tab ? { activeAppId: tab.activeLeafAppId } : {})
  }
}
