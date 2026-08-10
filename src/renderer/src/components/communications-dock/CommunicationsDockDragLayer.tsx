import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useState } from 'react'
import {
  listCommunicationsDockApps,
  type CommunicationsDockTab
} from '../../../../shared/communications-dock'
import type { FloatingWorkspaceAppId } from '../../../../shared/floating-workspace-apps'
import { FLOATING_WORKSPACE_APPS } from '../../../../shared/floating-workspace-apps'
import { FLOATING_WORKSPACE_APP_ICONS } from '@/lib/floating-workspace-app-icons'
import { TabDragPointerSensor } from '@/components/tab-group/tab-drag-pointer-sensor'
import { getDragPointer } from '@/components/tab-group/tab-drag-pointer'
import { resolveDropZone } from '@/components/tab-group/tab-drop-zone'
import TabPaneColumnSplitDragOverlay from '@/components/tab-group/TabPaneColumnSplitDragOverlay'
import {
  isCommunicationsDockDragData,
  isCommunicationsDockLeafDropData,
  isCommunicationsDockTabDropData,
  type CommunicationsDockDragData,
  type CommunicationsDockDragSide
} from './communications-dock-drag-data'

type HoveredLeaf = {
  tabId: string
  appId: FloatingWorkspaceAppId
  side: CommunicationsDockDragSide
  rect: DOMRect
}

const dockCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args)
  return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args)
}

export function resolveCommunicationsDockDropSide(
  rect: { left: number; top: number; width: number; height: number },
  pointer: { x: number; y: number }
): CommunicationsDockDragSide | null {
  const zone = resolveDropZone(rect, pointer)
  return zone === 'center' ? null : zone
}

export function canDropCommunicationsDockApp(
  appId: FloatingWorkspaceAppId,
  targetAppId: FloatingWorkspaceAppId
): boolean {
  return appId !== targetAppId
}

export function getCommunicationsDockTabReorderIndex(
  tabs: readonly CommunicationsDockTab[],
  targetTabId: string
): number | null {
  const index = tabs.findIndex((tab) => tab.id === targetTabId)
  return index < 0 ? null : index
}

function appLabel(appId: FloatingWorkspaceAppId): string {
  return FLOATING_WORKSPACE_APPS.find((app) => app.id === appId)?.label ?? appId
}

function draggedApp(
  drag: CommunicationsDockDragData,
  tabs: readonly CommunicationsDockTab[]
): FloatingWorkspaceAppId | null {
  if (drag.type === 'communications-dock-app') {
    return drag.appId
  }
  const tab = tabs.find((candidate) => candidate.id === drag.tabId)
  if (!tab) {
    return null
  }
  const apps = listCommunicationsDockApps(tab.layout)
  return apps.length === 1 ? apps[0] : null
}

export function CommunicationsDockDragLayer({
  tabs,
  children,
  onMoveApp,
  onReorderTab
}: {
  tabs: readonly CommunicationsDockTab[]
  children: React.ReactNode
  onMoveApp: (request: {
    appId: FloatingWorkspaceAppId
    targetTabId: string
    targetAppId: FloatingWorkspaceAppId
    side: CommunicationsDockDragSide
  }) => void
  onReorderTab: (tabId: string, index: number) => void
}): React.JSX.Element {
  const sensors = useSensors(
    useSensor(TabDragPointerSensor, { activationConstraint: { distance: 12 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const [activeDrag, setActiveDrag] = useState<CommunicationsDockDragData | null>(null)
  const [hoveredLeaf, setHoveredLeaf] = useState<HoveredLeaf | null>(null)
  const resolveHoveredLeaf = (event: DragMoveEvent | DragEndEvent): HoveredLeaf | null => {
    const drag = isCommunicationsDockDragData(event.active.data.current)
      ? event.active.data.current
      : null
    const over = event.over
    if (!over || !isCommunicationsDockLeafDropData(over.data.current)) {
      return null
    }
    const drop = over.data.current
    const appId = drag ? draggedApp(drag, tabs) : null
    const pointer = getDragPointer(event)
    if (!appId || !pointer || !canDropCommunicationsDockApp(appId, drop.appId)) {
      return null
    }
    const side = resolveCommunicationsDockDropSide(over.rect, pointer)
    if (!side) {
      return null
    }
    return {
      tabId: drop.tabId,
      appId: drop.appId,
      side,
      rect: new DOMRect(over.rect.left, over.rect.top, over.rect.width, over.rect.height)
    }
  }

  const handleDragStart = (event: DragStartEvent): void => {
    const data = event.active.data.current
    setActiveDrag(isCommunicationsDockDragData(data) ? data : null)
    setHoveredLeaf(null)
  }
  const handleDragMove = (event: DragMoveEvent): void => {
    setHoveredLeaf(resolveHoveredLeaf(event))
  }
  const clearDrag = (): void => {
    setActiveDrag(null)
    setHoveredLeaf(null)
  }
  const handleDragEnd = (event: DragEndEvent): void => {
    const drag = isCommunicationsDockDragData(event.active.data.current)
      ? event.active.data.current
      : null
    const over = event.over
    const tabDrop =
      over && isCommunicationsDockTabDropData(over.data.current) ? over.data.current : null
    const leaf = resolveHoveredLeaf(event)
    if (drag?.type === 'communications-dock-tab' && tabDrop) {
      const index = getCommunicationsDockTabReorderIndex(tabs, tabDrop.tabId)
      if (index !== null && drag.tabId !== tabDrop.tabId) {
        onReorderTab(drag.tabId, index)
      }
    } else if (drag && leaf) {
      const appId = draggedApp(drag, tabs)
      if (appId) {
        onMoveApp({
          appId,
          targetTabId: leaf.tabId,
          targetAppId: leaf.appId,
          side: leaf.side
        })
      }
    }
    clearDrag()
  }

  const previewAppId = activeDrag ? draggedApp(activeDrag, tabs) : null
  const PreviewIcon = previewAppId ? FLOATING_WORKSPACE_APP_ICONS[previewAppId] : null
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={dockCollisionDetection}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={clearDrag}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {PreviewIcon && previewAppId ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
            <PreviewIcon className="size-3.5" />
            <span>{appLabel(previewAppId)}</span>
          </div>
        ) : activeDrag?.type === 'communications-dock-tab' ? (
          <div className="rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
            {FLOATING_WORKSPACE_APPS.filter((app) => {
              const tab = tabs.find((candidate) => candidate.id === activeDrag.tabId)
              return tab ? listCommunicationsDockApps(tab.layout).includes(app.id) : false
            })
              .map((app) => app.label)
              .join(', ')}
          </div>
        ) : null}
      </DragOverlay>
      {hoveredLeaf ? (
        <TabPaneColumnSplitDragOverlay panelRect={hoveredLeaf.rect} zone={hoveredLeaf.side} />
      ) : null}
    </DndContext>
  )
}
