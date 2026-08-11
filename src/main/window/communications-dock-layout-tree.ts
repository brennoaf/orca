import {
  COMMUNICATIONS_DOCK_MAX_APPS,
  COMMUNICATIONS_DOCK_MAX_RATIO,
  COMMUNICATIONS_DOCK_MIN_RATIO,
  listCommunicationsDockApps,
  type CommunicationsDockLayout,
  type CommunicationsDockLayoutNode
} from '../../shared/communications-dock'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'
import {
  removeSplitLeaf,
  splitAtLeaf,
  type SplitPath,
  type SplitTreeAdapter
} from '../../shared/split-layout-tree'

const dockRatioRange = {
  min: COMMUNICATIONS_DOCK_MIN_RATIO,
  max: COMMUNICATIONS_DOCK_MAX_RATIO
}

const dockTreeAdapter: SplitTreeAdapter<CommunicationsDockLayoutNode, FloatingWorkspaceAppId> = {
  leaf: (node) => (node.type === 'leaf' ? node.appId : undefined),
  children: (node) =>
    node.type === 'split'
      ? {
          direction: node.direction,
          ratio: node.ratio,
          first: node.first,
          second: node.second
        }
      : undefined,
  createSplit: ({ direction, ratio, first, second }) => {
    if (ratio === undefined) {
      throw new Error('communications_dock_ratio_missing')
    }
    return { type: 'split', direction, ratio, first, second }
  },
  replaceChildren: (node, first, second) => {
    if (node.type === 'leaf') {
      throw new Error('communications_dock_split_expected')
    }
    return { ...node, first, second }
  },
  replaceRatio: (node, ratio) => {
    if (node.type === 'leaf') {
      throw new Error('communications_dock_split_expected')
    }
    return { ...node, ratio }
  }
}

export function communicationsDockRatioRange() {
  return dockRatioRange
}

export function communicationsDockTreeAdapter() {
  return dockTreeAdapter
}

export function findCommunicationsDockAppPath(
  node: CommunicationsDockLayoutNode,
  appId: FloatingWorkspaceAppId,
  path: SplitPath = []
): SplitPath | undefined {
  if (node.type === 'leaf') {
    return node.appId === appId ? path : undefined
  }
  return (
    findCommunicationsDockAppPath(node.first, appId, [...path, 'first']) ??
    findCommunicationsDockAppPath(node.second, appId, [...path, 'second'])
  )
}

export function removeCommunicationsDockApp(
  node: CommunicationsDockLayoutNode,
  appId: FloatingWorkspaceAppId
): CommunicationsDockLayoutNode | null {
  const path = findCommunicationsDockAppPath(node, appId)
  if (!path) {
    return node
  }
  const result = removeSplitLeaf(node, path, dockTreeAdapter)
  if (result === undefined) {
    throw new Error('communications_dock_app_missing')
  }
  return result
}

export function insertCommunicationsDockNode(
  node: CommunicationsDockLayoutNode,
  targetAppId: FloatingWorkspaceAppId,
  inserted: CommunicationsDockLayoutNode,
  side: 'left' | 'right' | 'up' | 'down'
): CommunicationsDockLayoutNode | null {
  const path = findCommunicationsDockAppPath(node, targetAppId)
  if (!path) {
    return null
  }
  return splitAtLeaf(node, path, side, inserted, dockTreeAdapter, 0.5, dockRatioRange) ?? null
}

export function validateCommunicationsDockLayoutApps(layout: CommunicationsDockLayout): void {
  const apps = layout.tabs.flatMap((tab) => listCommunicationsDockApps(tab.layout))
  if (apps.length > COMMUNICATIONS_DOCK_MAX_APPS || new Set(apps).size !== apps.length) {
    throw new Error('communications_dock_apps_invalid')
  }
}

export function findCommunicationsDockTab(layout: CommunicationsDockLayout, tabId: string) {
  return layout.tabs.find((tab) => tab.id === tabId)
}

export function updateCommunicationsDockTabAfterRemoval(
  tab: CommunicationsDockLayout['tabs'][number],
  layout: CommunicationsDockLayoutNode
): CommunicationsDockLayout['tabs'][number] {
  const apps = listCommunicationsDockApps(layout)
  return {
    ...tab,
    layout,
    activeLeafAppId: apps.includes(tab.activeLeafAppId) ? tab.activeLeafAppId : apps[0]
  }
}
