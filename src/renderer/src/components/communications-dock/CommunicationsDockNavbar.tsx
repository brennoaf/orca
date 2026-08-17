import { useDraggable, useDroppable } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  listCommunicationsDockApps,
  type CommunicationsDockTab
} from '../../../../shared/communications-dock'
import type { FloatingWorkspaceAppId } from '../../../../shared/floating-workspace-apps'
import { FLOATING_WORKSPACE_APPS } from '../../../../shared/floating-workspace-apps'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { FLOATING_WORKSPACE_APP_ICONS } from '@/lib/floating-workspace-app-icons'
import { cn } from '@/lib/utils'
import type {
  CommunicationsDockAppDragData,
  CommunicationsDockTabDragData,
  CommunicationsDockTabDropData,
  CommunicationsDockTabInsertionDropData
} from './communications-dock-drag-data'

function appLabel(appId: FloatingWorkspaceAppId): string {
  return FLOATING_WORKSPACE_APPS.find((app) => app.id === appId)?.label ?? appId
}

function DockTab({
  tab,
  selected,
  roving,
  onSelect,
  onActivateLeaf,
  onRovingMove,
  whatsappHasUnread
}: {
  tab: CommunicationsDockTab
  selected: boolean
  roving: boolean
  onSelect: (tabId: string) => void
  onActivateLeaf: (tabId: string, appId: FloatingWorkspaceAppId) => void
  onRovingMove: (tabId: string, direction: 'previous' | 'next' | 'first' | 'last') => void
  whatsappHasUnread: boolean
}): React.JSX.Element {
  const apps = listCommunicationsDockApps(tab.layout)
  const label = apps.map(appLabel).join(', ')
  const tabDragData: CommunicationsDockTabDragData = {
    type: 'communications-dock-tab',
    tabId: tab.id,
    groupId: tab.id,
    unifiedTabId: tab.id,
    visibleTabId: tab.id
  }
  const tabDropData: CommunicationsDockTabDropData = {
    type: 'communications-dock-tab-target',
    tabId: tab.id,
    groupId: tab.id,
    unifiedTabId: tab.id,
    visibleTabId: tab.id
  }
  const draggable = useDraggable({ id: `communications-dock-tab:${tab.id}`, data: tabDragData })
  const droppable = useDroppable({
    id: `communications-dock-tab-target:${tab.id}`,
    data: tabDropData
  })
  const buttonRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (roving && document.activeElement?.closest('[role="tablist"]')) {
      buttonRef.current?.focus()
    }
  }, [roving])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      onRovingMove(tab.id, 'previous')
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      onRovingMove(tab.id, 'next')
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      onRovingMove(tab.id, event.key === 'Home' ? 'first' : 'last')
      return
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const current = Math.max(0, apps.indexOf(tab.activeLeafAppId))
      const delta = event.key === 'ArrowDown' ? 1 : -1
      onActivateLeaf(tab.id, apps[(current + delta + apps.length) % apps.length])
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(tab.id)
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          ref={(element) => {
            buttonRef.current = element
            droppable.setNodeRef(element)
          }}
          role="tab"
          aria-selected={selected}
          aria-label={label}
          tabIndex={roving ? 0 : -1}
          className={cn(
            'relative flex h-7 min-w-10 shrink-0 items-stretch overflow-visible rounded-md border border-border bg-background outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
            selected && 'bg-accent text-accent-foreground',
            droppable.isOver && 'ring-2 ring-ring'
          )}
          onClick={() => onSelect(tab.id)}
          onKeyDown={handleKeyDown}
        >
          <span
            ref={draggable.setNodeRef}
            className="flex w-3 cursor-grab items-center justify-center border-r border-border/60 text-muted-foreground active:cursor-grabbing"
            {...draggable.attributes}
            {...draggable.listeners}
          >
            <GripVertical className="size-2.5" />
          </span>
          {apps.map((appId) => {
            const Icon = FLOATING_WORKSPACE_APP_ICONS[appId]
            return (
              <DockTabAppSegment
                key={appId}
                appId={appId}
                tabId={tab.id}
                active={tab.activeLeafAppId === appId}
                onActivate={() => onActivateLeaf(tab.id, appId)}
                hasUnread={appId === 'whatsapp-web' && whatsappHasUnread}
              >
                <Icon className="size-3.5" />
              </DockTabAppSegment>
            )
          })}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function DockTabAppSegment({
  appId,
  tabId,
  active,
  onActivate,
  children,
  hasUnread
}: {
  appId: FloatingWorkspaceAppId
  tabId: string
  active: boolean
  onActivate: () => void
  children: React.ReactNode
  hasUnread: boolean
}): React.JSX.Element {
  const data: CommunicationsDockAppDragData = {
    type: 'communications-dock-app',
    appId,
    sourceTabId: tabId
  }
  const draggable = useDraggable({ id: `communications-dock-navbar-app:${appId}`, data })
  return (
    <span
      ref={draggable.setNodeRef}
      aria-label={appLabel(appId)}
      className={cn(
        'relative flex min-w-7 flex-1 cursor-grab items-center justify-center border-l border-border/60 first:border-l-0 active:cursor-grabbing',
        active ? 'text-foreground' : 'text-muted-foreground'
      )}
      onClick={(event) => {
        event.stopPropagation()
        onActivate()
      }}
      {...draggable.attributes}
      {...draggable.listeners}
      onPointerDown={(event) => {
        event.stopPropagation()
        draggable.listeners?.onPointerDown?.(event)
      }}
    >
      {children}
      {hasUnread ? (
        <span
          aria-label={translate(
            'communicationIntegrations.whatsappWeb.unreadMessages',
            'Unread WhatsApp messages'
          )}
          className="absolute ml-3 mt-[-12px] size-1.5 rounded-full bg-status-warning"
        />
      ) : null}
    </span>
  )
}

function DockTabInsertion({ index }: { index: number }): React.JSX.Element {
  const data: CommunicationsDockTabInsertionDropData = {
    type: 'communications-dock-tab-insertion',
    index
  }
  const droppable = useDroppable({
    id: `communications-dock-tab-insertion:${index}`,
    data
  })
  return (
    <div
      ref={droppable.setNodeRef}
      className={cn('h-7 w-1 shrink-0 rounded-sm', droppable.isOver && 'bg-ring')}
      data-communications-dock-tab-insertion={index}
    />
  )
}

export function CommunicationsDockNavbar({
  tabs,
  activeTabId,
  onActivateTab,
  onActivateLeaf,
  whatsappHasUnread
}: {
  tabs: readonly CommunicationsDockTab[]
  activeTabId: string
  onActivateTab: (tabId: string) => void
  onActivateLeaf: (tabId: string, appId: FloatingWorkspaceAppId) => void
  whatsappHasUnread: boolean
}): React.JSX.Element {
  const [rovingTabId, setRovingTabId] = useState(activeTabId)
  useEffect(() => {
    if (!tabs.some((tab) => tab.id === rovingTabId)) {
      setRovingTabId(activeTabId)
    }
  }, [activeTabId, rovingTabId, tabs])
  const moveRoving = (tabId: string, direction: 'previous' | 'next' | 'first' | 'last'): void => {
    const index = tabs.findIndex((tab) => tab.id === tabId)
    const nextIndex =
      direction === 'first'
        ? 0
        : direction === 'last'
          ? tabs.length - 1
          : (index + (direction === 'next' ? 1 : -1) + tabs.length) % tabs.length
    setRovingTabId(tabs[nextIndex].id)
  }
  return (
    <div
      role="tablist"
      aria-label={translate('communicationsDock.tabs', 'Communication layouts')}
      className="flex min-w-0 max-w-full items-center gap-1 overflow-x-auto px-1"
    >
      <DockTabInsertion index={0} />
      {tabs.map((tab, index) => (
        <div key={tab.id} className="flex shrink-0 items-center">
          <DockTab
            tab={tab}
            selected={tab.id === activeTabId}
            roving={tab.id === rovingTabId}
            onSelect={(tabId) => {
              setRovingTabId(tabId)
              onActivateTab(tabId)
            }}
            onActivateLeaf={(tabId, appId) => {
              setRovingTabId(tabId)
              onActivateLeaf(tabId, appId)
            }}
            onRovingMove={moveRoving}
            whatsappHasUnread={whatsappHasUnread}
          />
          <DockTabInsertion index={index + 1} />
        </div>
      ))}
    </div>
  )
}
