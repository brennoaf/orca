import type {
  CommunicationsDockActivateLeafRequest,
  CommunicationsDockActivateTabRequest,
  CommunicationsDockCreateTabRequest,
  CommunicationsDockLayout,
  CommunicationsDockMoveAppRequest,
  CommunicationsDockMoveTabRequest,
  CommunicationsDockReorderTabRequest,
  CommunicationsDockSplitAppRequest,
  CommunicationsDockUpdateRatioRequest
} from '../../shared/communications-dock'
import {
  activateCommunicationsDockLeaf,
  activateCommunicationsDockTab,
  createCommunicationsDockTab,
  moveCommunicationsDockApp,
  moveCommunicationsDockTab,
  reorderCommunicationsDockTab,
  updateCommunicationsDockRatio
} from './communications-dock-state'

export type CommunicationsDockLayoutOperation =
  | CommunicationsDockActivateLeafRequest
  | CommunicationsDockActivateTabRequest
  | CommunicationsDockMoveAppRequest
  | CommunicationsDockReorderTabRequest
  | CommunicationsDockSplitAppRequest
  | CommunicationsDockUpdateRatioRequest
  | { operation: 'move-tab'; request: CommunicationsDockMoveTabRequest }
  | { operation: 'create-tab'; request: CommunicationsDockCreateTabRequest; tabId: string }

export function applyCommunicationsDockLayoutOperation(
  layout: CommunicationsDockLayout,
  request: CommunicationsDockLayoutOperation
): CommunicationsDockLayout {
  if ('operation' in request) {
    if (request.operation === 'move-tab') {
      const { sourceTabId, targetTabId, targetAppId, side } = request.request
      return moveCommunicationsDockTab(layout, sourceTabId, targetTabId, targetAppId, side)
    }
    const { sourceTabId, appId, index } = request.request
    return createCommunicationsDockTab(layout, sourceTabId, appId, index, request.tabId)
  }
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
