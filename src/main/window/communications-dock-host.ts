import type { CommunicationsDockAction } from '../../shared/communications-dock'
import type { FloatingCommsSessionState } from '../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'
import { sendToTrustedUIRenderer } from '../ipc/ui'
import { restoreFloatingCommsMainWindow } from './floating-comms-surface-presentation'

export type CommunicationsDockHost = {
  action: (action: CommunicationsDockAction) => void
  reattach: (
    appId: FloatingWorkspaceAppId,
    sessions: Partial<Record<FloatingWorkspaceAppId, FloatingCommsSessionState>>
  ) => void
}

export function defaultCommunicationsDockSession(
  appId: FloatingWorkspaceAppId
): FloatingCommsSessionState {
  return appId === 'whatsapp-web' ? { appId, selectedConversationId: null, draft: '' } : { appId }
}

export const defaultCommunicationsDockHost: CommunicationsDockHost = {
  action: (action) => {
    restoreFloatingCommsMainWindow()
    sendToTrustedUIRenderer('floatingCommsDock:action', action)
  },
  reattach: (appId, sessions) => {
    restoreFloatingCommsMainWindow()
    sendToTrustedUIRenderer('floatingCommsDock:reattached', { appId, sessions })
  }
}
