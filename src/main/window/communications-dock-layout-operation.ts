import type {
  CommunicationsDockActivateLeafRequest,
  CommunicationsDockActivateTabRequest,
  CommunicationsDockLayout,
  CommunicationsDockMoveAppRequest,
  CommunicationsDockReorderTabRequest,
  CommunicationsDockSplitAppRequest,
  CommunicationsDockUpdateRatioRequest
} from '../../shared/communications-dock'
import {
  activateCommunicationsDockLeaf,
  activateCommunicationsDockTab,
  moveCommunicationsDockApp,
  reorderCommunicationsDockTab,
  updateCommunicationsDockRatio
} from './communications-dock-state'

export function applyCommunicationsDockLayoutOperation(
  layout: CommunicationsDockLayout,
  request:
    | CommunicationsDockActivateLeafRequest
    | CommunicationsDockActivateTabRequest
    | CommunicationsDockMoveAppRequest
    | CommunicationsDockReorderTabRequest
    | CommunicationsDockSplitAppRequest
    | CommunicationsDockUpdateRatioRequest
): CommunicationsDockLayout {
  if ('targetTabId' in request) {
    return moveCommunicationsDockApp(
      layout,
      request.appId,
      request.targetTabId,
      request.targetAppId,
      request.side
    )
  }
  if ('path' in request) {
    return updateCommunicationsDockRatio(layout, request.tabId, request.path, request.ratio)
  }
  if ('index' in request) {
    return reorderCommunicationsDockTab(layout, request.tabId, request.index)
  }
  if ('appId' in request) {
    return activateCommunicationsDockLeaf(layout, request.tabId, request.appId)
  }
  return activateCommunicationsDockTab(layout, request.tabId)
}
