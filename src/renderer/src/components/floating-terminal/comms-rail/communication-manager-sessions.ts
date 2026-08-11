import type { FloatingCommsSessionState } from '../../../../../shared/floating-comms-surface'
import type {
  FloatingWorkspaceApp,
  FloatingWorkspaceAppId
} from '../../../../../shared/floating-workspace-apps'

export function createCommunicationManagerSessionState(
  appId: FloatingWorkspaceAppId
): FloatingCommsSessionState {
  return appId === 'whatsapp-web' ? { appId, selectedConversationId: null, draft: '' } : { appId }
}

export function createCommunicationManagerSessionSnapshot(
  entries: readonly { app: FloatingWorkspaceApp }[],
  sessions: ReadonlyMap<FloatingWorkspaceAppId, FloatingCommsSessionState>
): Partial<Record<FloatingWorkspaceAppId, FloatingCommsSessionState>> {
  return Object.fromEntries(
    entries.map(({ app }) => [
      app.id,
      sessions.get(app.id) ?? createCommunicationManagerSessionState(app.id)
    ])
  )
}
