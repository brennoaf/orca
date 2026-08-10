import type { BrowserWindow } from 'electron'
import type {
  CommunicationsDockPresence,
  CommunicationsDockSnapshot
} from '../../shared/communications-dock'
import { sendToTrustedUIRenderer } from '../ipc/ui'

export function sendCommunicationsDockSnapshot(
  ready: boolean,
  window: BrowserWindow | null,
  snapshot: CommunicationsDockSnapshot
): void {
  if (ready && window && !window.isDestroyed()) {
    window.webContents.send('floatingCommsDock:snapshotChanged', snapshot)
  }
}

export function notifyCommunicationsDockPresence(presence: CommunicationsDockPresence): void {
  sendToTrustedUIRenderer('floatingCommsDock:presenceChanged', presence)
}
