import {
  clampCommunicationsDockRatio,
  listCommunicationsDockApps,
  type CommunicationsDockLayout,
  type CommunicationsDockLayoutNode
} from '../../shared/communications-dock'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'

function removeApp(
  node: CommunicationsDockLayoutNode,
  appId: FloatingWorkspaceAppId
): CommunicationsDockLayoutNode | null {
  if (node.type === 'leaf') {
    return node.appId === appId ? null : node
  }
  const first = removeApp(node.first, appId)
  const second = removeApp(node.second, appId)
  if (!first) {
    return second
  }
  if (!second) {
    return first
  }
  return { ...node, first, second }
}

function insertAt(
  node: CommunicationsDockLayoutNode,
  targetAppId: FloatingWorkspaceAppId,
  appId: FloatingWorkspaceAppId,
  side: 'left' | 'right' | 'up' | 'down'
): CommunicationsDockLayoutNode | null {
  if (node.type === 'leaf') {
    if (node.appId !== targetAppId) {
      return null
    }
    const moving: CommunicationsDockLayoutNode = { type: 'leaf', appId }
    const direction = side === 'left' || side === 'right' ? 'horizontal' : 'vertical'
    return {
      type: 'split',
      direction,
      ratio: 0.5,
      first: side === 'left' || side === 'up' ? moving : node,
      second: side === 'left' || side === 'up' ? node : moving
    }
  }
  const first = insertAt(node.first, targetAppId, appId, side)
  if (first) {
    return { ...node, first }
  }
  const second = insertAt(node.second, targetAppId, appId, side)
  return second ? { ...node, second } : null
}

export function activateCommunicationsDockTab(
  layout: CommunicationsDockLayout,
  tabId: string
): CommunicationsDockLayout {
  if (!layout.tabs.some((tab) => tab.id === tabId)) {
    throw new Error('communications_dock_tab_missing')
  }
  return { ...layout, activeTabId: tabId }
}

export function activateCommunicationsDockLeaf(
  layout: CommunicationsDockLayout,
  tabId: string,
  appId: FloatingWorkspaceAppId
): CommunicationsDockLayout {
  const tab = layout.tabs.find((entry) => entry.id === tabId)
  if (!tab || !listCommunicationsDockApps(tab.layout).includes(appId)) {
    throw new Error('communications_dock_leaf_missing')
  }
  return {
    ...layout,
    activeTabId: tabId,
    tabs: layout.tabs.map((entry) =>
      entry.id === tabId ? { ...entry, activeLeafAppId: appId } : entry
    )
  }
}

export function focusCommunicationsDockApp(
  layout: CommunicationsDockLayout,
  appId: FloatingWorkspaceAppId
): CommunicationsDockLayout {
  const tab = layout.tabs.find((entry) => listCommunicationsDockApps(entry.layout).includes(appId))
  if (!tab) {
    throw new Error('communications_dock_app_missing')
  }
  return activateCommunicationsDockLeaf(layout, tab.id, appId)
}

export function moveCommunicationsDockApp(
  layout: CommunicationsDockLayout,
  appId: FloatingWorkspaceAppId,
  targetTabId: string,
  targetAppId: FloatingWorkspaceAppId,
  side: 'left' | 'right' | 'up' | 'down'
): CommunicationsDockLayout {
  if (appId === targetAppId) {
    throw new Error('communications_dock_move_same_leaf')
  }
  if (!layout.tabs.some((tab) => listCommunicationsDockApps(tab.layout).includes(appId))) {
    throw new Error('communications_dock_app_missing')
  }
  const pruned = layout.tabs.flatMap((tab) => {
    const next = removeApp(tab.layout, appId)
    if (!next) {
      return []
    }
    const apps = listCommunicationsDockApps(next)
    return [
      {
        ...tab,
        layout: next,
        activeLeafAppId: apps.includes(tab.activeLeafAppId) ? tab.activeLeafAppId : apps[0]
      }
    ]
  })
  const target = pruned.find((tab) => tab.id === targetTabId)
  if (!target) {
    throw new Error('communications_dock_target_tab_missing')
  }
  const inserted = insertAt(target.layout, targetAppId, appId, side)
  if (!inserted) {
    throw new Error('communications_dock_target_leaf_missing')
  }
  return {
    ...layout,
    activeTabId: targetTabId,
    tabs: pruned.map((tab) =>
      tab.id === targetTabId ? { ...tab, layout: inserted, activeLeafAppId: appId } : tab
    )
  }
}

export function reorderCommunicationsDockTab(
  layout: CommunicationsDockLayout,
  tabId: string,
  index: number
): CommunicationsDockLayout {
  const current = layout.tabs.findIndex((tab) => tab.id === tabId)
  if (current < 0 || index < 0 || index >= layout.tabs.length) {
    throw new Error('communications_dock_tab_order_invalid')
  }
  const tabs = [...layout.tabs]
  const [tab] = tabs.splice(current, 1)
  tabs.splice(index, 0, tab)
  return { ...layout, tabs }
}

function updateRatioAtPath(
  node: CommunicationsDockLayoutNode,
  path: readonly ('first' | 'second')[],
  ratio: number
): CommunicationsDockLayoutNode {
  if (path.length === 0) {
    if (node.type !== 'split') {
      throw new Error('communications_dock_ratio_leaf')
    }
    return { ...node, ratio: clampCommunicationsDockRatio(ratio) }
  }
  if (node.type !== 'split') {
    throw new Error('communications_dock_ratio_path_invalid')
  }
  const [head, ...tail] = path
  return { ...node, [head]: updateRatioAtPath(node[head], tail, ratio) }
}

export function updateCommunicationsDockRatio(
  layout: CommunicationsDockLayout,
  tabId: string,
  path: readonly ('first' | 'second')[],
  ratio: number
): CommunicationsDockLayout {
  const found = layout.tabs.some((tab) => tab.id === tabId)
  if (!found) {
    throw new Error('communications_dock_tab_missing')
  }
  return {
    ...layout,
    tabs: layout.tabs.map((tab) =>
      tab.id === tabId ? { ...tab, layout: updateRatioAtPath(tab.layout, path, ratio) } : tab
    )
  }
}
