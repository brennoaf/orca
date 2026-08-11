import {
  listCommunicationsDockApps,
  type CommunicationsDockLayout
} from '../../shared/communications-dock'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'
import {
  findCommunicationsDockTab,
  insertCommunicationsDockNode,
  removeCommunicationsDockApp,
  updateCommunicationsDockTabAfterRemoval,
  validateCommunicationsDockLayoutApps
} from './communications-dock-layout-tree'

export function moveCommunicationsDockTab(
  layout: CommunicationsDockLayout,
  sourceTabId: string,
  targetTabId: string,
  targetAppId: FloatingWorkspaceAppId,
  side: 'left' | 'right' | 'up' | 'down'
): CommunicationsDockLayout {
  validateCommunicationsDockLayoutApps(layout)
  if (sourceTabId === targetTabId) {
    throw new Error('communications_dock_move_same_tab')
  }
  const source = findCommunicationsDockTab(layout, sourceTabId)
  const target = findCommunicationsDockTab(layout, targetTabId)
  if (!source) {
    throw new Error('communications_dock_source_tab_missing')
  }
  if (!target) {
    throw new Error('communications_dock_target_tab_missing')
  }
  if (!listCommunicationsDockApps(target.layout).includes(targetAppId)) {
    throw new Error('communications_dock_target_leaf_missing')
  }
  const inserted = insertCommunicationsDockNode(target.layout, targetAppId, source.layout, side)
  if (!inserted) {
    throw new Error('communications_dock_target_leaf_missing')
  }
  return {
    ...layout,
    activeTabId: targetTabId,
    tabs: layout.tabs.flatMap((tab) => {
      if (tab.id === sourceTabId) {
        return []
      }
      if (tab.id === targetTabId) {
        return [{ ...tab, layout: inserted, activeLeafAppId: targetAppId }]
      }
      return [tab]
    })
  }
}

export function createCommunicationsDockTab(
  layout: CommunicationsDockLayout,
  sourceTabId: string,
  appId: FloatingWorkspaceAppId,
  index: number,
  tabId: string
): CommunicationsDockLayout {
  validateCommunicationsDockLayoutApps(layout)
  if (!Number.isInteger(index)) {
    throw new Error('communications_dock_tab_order_invalid')
  }
  if (tabId.length === 0 || layout.tabs.some((tab) => tab.id === tabId)) {
    throw new Error('communications_dock_tab_id_invalid')
  }
  const source = findCommunicationsDockTab(layout, sourceTabId)
  if (!source || !listCommunicationsDockApps(source.layout).includes(appId)) {
    throw new Error('communications_dock_source_leaf_missing')
  }
  const nextSource = removeCommunicationsDockApp(source.layout, appId)
  const sourceIndex = layout.tabs.findIndex((tab) => tab.id === sourceTabId)
  const tabs = layout.tabs.flatMap((tab) => {
    if (tab.id !== sourceTabId) {
      return [tab]
    }
    return nextSource ? [updateCommunicationsDockTabAfterRemoval(tab, nextSource)] : []
  })
  const adjustedIndex = nextSource || sourceIndex >= index ? index : index - 1
  const nextIndex = Math.min(Math.max(adjustedIndex, 0), tabs.length)
  const nextTab: CommunicationsDockLayout['tabs'][number] = {
    id: tabId,
    layout: { type: 'leaf', appId },
    activeLeafAppId: appId
  }
  tabs.splice(nextIndex, 0, nextTab)
  return { ...layout, tabs, activeTabId: tabId }
}
