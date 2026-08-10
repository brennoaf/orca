import type {
  CommunicationsDockActivateLeafRequest,
  CommunicationsDockActivateTabRequest,
  CommunicationsDockMoveAppRequest,
  CommunicationsDockReorderTabRequest,
  CommunicationsDockSnapshot,
  CommunicationsDockSplitAppRequest,
  CommunicationsDockUpdateRatioRequest
} from '../../shared/communications-dock'
import type { WebContents } from 'electron'

export type CommunicationsDockLayoutCommand =
  | CommunicationsDockActivateLeafRequest
  | CommunicationsDockActivateTabRequest
  | CommunicationsDockMoveAppRequest
  | CommunicationsDockReorderTabRequest
  | CommunicationsDockSplitAppRequest
  | CommunicationsDockUpdateRatioRequest

export function createCommunicationsDockLayoutCommands(args: {
  run: (sender: WebContents, request: CommunicationsDockLayoutCommand) => CommunicationsDockSnapshot
}): {
  activateTab: (
    sender: WebContents,
    request: CommunicationsDockActivateTabRequest
  ) => CommunicationsDockSnapshot
  activateLeaf: (
    sender: WebContents,
    request: CommunicationsDockActivateLeafRequest
  ) => CommunicationsDockSnapshot
  moveApp: (
    sender: WebContents,
    request: CommunicationsDockMoveAppRequest | CommunicationsDockSplitAppRequest
  ) => CommunicationsDockSnapshot
  reorderTab: (
    sender: WebContents,
    request: CommunicationsDockReorderTabRequest
  ) => CommunicationsDockSnapshot
  updateRatio: (
    sender: WebContents,
    request: CommunicationsDockUpdateRatioRequest
  ) => CommunicationsDockSnapshot
} {
  return {
    activateTab: args.run,
    activateLeaf: args.run,
    moveApp: args.run,
    reorderTab: args.run,
    updateRatio: args.run
  }
}
