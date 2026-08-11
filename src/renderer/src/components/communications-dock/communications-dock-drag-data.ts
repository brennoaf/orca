import type { FloatingWorkspaceAppId } from '../../../../shared/floating-workspace-apps'

export type CommunicationsDockDragSide = 'left' | 'right' | 'up' | 'down'

export type CommunicationsDockAppDragData = {
  type: 'communications-dock-app'
  appId: FloatingWorkspaceAppId
  sourceTabId: string
}

export type CommunicationsDockTabDragData = {
  type: 'communications-dock-tab'
  tabId: string
  groupId: string
  unifiedTabId: string
  visibleTabId: string
}

export type CommunicationsDockDragData =
  | CommunicationsDockAppDragData
  | CommunicationsDockTabDragData

export type CommunicationsDockLeafDropData = {
  type: 'communications-dock-leaf'
  appId: FloatingWorkspaceAppId
  tabId: string
}

export type CommunicationsDockTabDropData = {
  type: 'communications-dock-tab-target'
  tabId: string
  groupId: string
  unifiedTabId: string
  visibleTabId: string
}

export type CommunicationsDockTabInsertionData =
  | CommunicationsDockTabDragData
  | CommunicationsDockTabDropData

export type CommunicationsDockTabInsertionDropData = {
  type: 'communications-dock-tab-insertion'
  index: number
}

export function isCommunicationsDockDragData(value: unknown): value is CommunicationsDockDragData {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return false
  }
  const type = value.type
  return type === 'communications-dock-app' || type === 'communications-dock-tab'
}

export function isCommunicationsDockTabInsertionData(
  value: unknown
): value is CommunicationsDockTabInsertionData {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'type' in value &&
    (value.type === 'communications-dock-tab' || value.type === 'communications-dock-tab-target')
  )
}

export function isCommunicationsDockTabInsertionTargetData(
  value: unknown
): value is CommunicationsDockTabDropData {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'type' in value &&
    value.type === 'communications-dock-tab-target'
  )
}

export function isCommunicationsDockLeafDropData(
  value: unknown
): value is CommunicationsDockLeafDropData {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'type' in value &&
    value.type === 'communications-dock-leaf'
  )
}

export function isCommunicationsDockTabDropData(
  value: unknown
): value is CommunicationsDockTabDropData {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'type' in value &&
    value.type === 'communications-dock-tab-target'
  )
}

export function isCommunicationsDockTabInsertionDropData(
  value: unknown
): value is CommunicationsDockTabInsertionDropData {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'type' in value &&
    value.type === 'communications-dock-tab-insertion'
  )
}
