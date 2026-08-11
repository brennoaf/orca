import type {
  CommunicationsDockActivateLeafRequest,
  CommunicationsDockActivateTabRequest,
  CommunicationsDockCreateTabRequest,
  CommunicationsDockMoveAppRequest,
  CommunicationsDockMoveTabRequest,
  CommunicationsDockReorderTabRequest,
  CommunicationsDockSnapshot,
  CommunicationsDockSplitAppRequest,
  CommunicationsDockUpdateRatioRequest
} from '../../shared/communications-dock'
import type { WebContents } from 'electron'
import type { CommunicationsDockLayoutOperation } from './communications-dock-layout-operation'

export type CommunicationsDockLayoutCommand = CommunicationsDockLayoutOperation

export function createCommunicationsDockLayoutCommands(args: {
  run: (sender: WebContents, request: CommunicationsDockLayoutCommand) => CommunicationsDockSnapshot
  createTabId: () => string
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
  moveTab: (
    sender: WebContents,
    request: CommunicationsDockMoveTabRequest
  ) => CommunicationsDockSnapshot
  createTab: (
    sender: WebContents,
    request: CommunicationsDockCreateTabRequest
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
    moveTab: (sender, request) => args.run(sender, { operation: 'move-tab', request }),
    createTab: (sender, request) =>
      args.run(sender, { operation: 'create-tab', request, tabId: args.createTabId() }),
    reorderTab: args.run,
    updateRatio: args.run
  }
}
