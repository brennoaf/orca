import type {
  CommunicationsDockLayout,
  CommunicationsDockSnapshot
} from '../../shared/communications-dock'
import type { FloatingCommsSessionState } from '../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'

export function communicationsDockSnapshot(args: {
  generation: number
  revision: number
  layout: CommunicationsDockLayout
  sessions: Partial<Record<FloatingWorkspaceAppId, FloatingCommsSessionState>>
  visible: boolean
}): CommunicationsDockSnapshot {
  return {
    generation: args.generation,
    revision: args.revision,
    layout: args.layout,
    sessions: { ...args.sessions },
    visible: args.visible
  }
}
