import type { BrowserWindow } from 'electron'
import type {
  FloatingCommsSessionState,
  FloatingCommsSurfaceIdentity
} from '../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'

export type FloatingCommsAttachedRecord = {
  identity: FloatingCommsSurfaceIdentity
  owner: BrowserWindow
  request: {
    appId: FloatingWorkspaceAppId
    requestId: number
    anchor: { x: number; y: number; width: number; height: number }
    workspace: { x: number; y: number; width: number; height: number }
    height: number
  }
  sessionState: FloatingCommsSessionState
  hasInitialMeasurement: boolean
}

export function defaultFloatingCommsSessionState(
  appId: FloatingWorkspaceAppId
): FloatingCommsSessionState {
  return appId === 'whatsapp-web' ? { appId, selectedConversationId: null, draft: '' } : { appId }
}
