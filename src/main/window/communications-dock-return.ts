import type { CommunicationsDockHost } from './communications-dock-host'
import type { FloatingCommsSessionRegistry } from './floating-comms-session-registry'

export function returnCommunicationsDockSessions(
  sessions: FloatingCommsSessionRegistry,
  host: CommunicationsDockHost
): boolean {
  if (sessions.getLocation() === 'panel') {
    return false
  }
  const returned = sessions.returnToPanel()
  if (returned.activeAppId) {
    host.reattach(returned.activeAppId, returned.sessions)
  }
  return true
}
