import type { FloatingCommsSessionState } from '../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'

export type FloatingCommsSessionLocation = 'panel' | 'dock'

export class FloatingCommsSessionRegistry {
  private sessions: Partial<Record<FloatingWorkspaceAppId, FloatingCommsSessionState>> = {}
  private location: FloatingCommsSessionLocation = 'panel'
  private activeAppId: FloatingWorkspaceAppId | undefined

  enterDock(
    appId: FloatingWorkspaceAppId,
    sessions: Partial<Record<FloatingWorkspaceAppId, FloatingCommsSessionState>>
  ): void {
    this.sessions = { ...sessions }
    this.activeAppId = appId
    this.location = 'dock'
  }

  update(sessionState: FloatingCommsSessionState): void {
    this.sessions[sessionState.appId] = sessionState
  }

  returnToPanel(): {
    activeAppId: FloatingWorkspaceAppId | undefined
    sessions: Partial<Record<FloatingWorkspaceAppId, FloatingCommsSessionState>>
  } {
    this.location = 'panel'
    return { activeAppId: this.activeAppId, sessions: { ...this.sessions } }
  }

  getLocation(): FloatingCommsSessionLocation {
    return this.location
  }

  getActiveAppId(): FloatingWorkspaceAppId | undefined {
    return this.activeAppId
  }

  getSessions(): Partial<Record<FloatingWorkspaceAppId, FloatingCommsSessionState>> {
    return { ...this.sessions }
  }
}
