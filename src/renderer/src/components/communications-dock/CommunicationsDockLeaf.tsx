import { useDraggable, useDroppable } from '@dnd-kit/core'
import { GripVertical } from 'lucide-react'
import { useCallback } from 'react'
import type { FloatingWorkspaceAppId } from '../../../../shared/floating-workspace-apps'
import { FLOATING_WORKSPACE_APPS } from '../../../../shared/floating-workspace-apps'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { FLOATING_WORKSPACE_APP_ICONS } from '@/lib/floating-workspace-app-icons'
import { cn } from '@/lib/utils'
import type {
  CommunicationsDockAppDragData,
  CommunicationsDockLeafDropData
} from './communications-dock-drag-data'

export function CommunicationsDockLeaf({
  appId,
  tabId,
  active,
  setContentTarget,
  onActivate
}: {
  appId: FloatingWorkspaceAppId
  tabId: string
  active: boolean
  setContentTarget: (appId: FloatingWorkspaceAppId, element: HTMLDivElement | null) => void
  onActivate: (tabId: string, appId: FloatingWorkspaceAppId) => void
}): React.JSX.Element {
  const app = FLOATING_WORKSPACE_APPS.find((candidate) => candidate.id === appId)
  if (!app) {
    throw new Error('communications_dock_app_invalid')
  }
  const Icon = FLOATING_WORKSPACE_APP_ICONS[appId]
  const dragData: CommunicationsDockAppDragData = {
    type: 'communications-dock-app',
    appId,
    sourceTabId: tabId
  }
  const dropData: CommunicationsDockLeafDropData = {
    type: 'communications-dock-leaf',
    appId,
    tabId
  }
  const draggable = useDraggable({ id: `communications-dock-app:${appId}`, data: dragData })
  const droppable = useDroppable({
    id: `communications-dock-leaf:${tabId}:${appId}`,
    data: dropData
  })
  const dragLabel = translate('communicationsDock.dragApp', 'Drag {{app}}', { app: app.label })
  const contentTargetRef = useCallback(
    (element: HTMLDivElement | null) => setContentTarget(appId, element),
    [appId, setContentTarget]
  )

  return (
    <section
      ref={droppable.setNodeRef}
      className={cn(
        'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background',
        active && 'ring-1 ring-inset ring-ring/50',
        droppable.isOver && 'bg-accent/30'
      )}
      data-communications-dock-leaf={appId}
      onPointerDown={() => onActivate(tabId, appId)}
    >
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/60 px-1.5 text-xs font-medium">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{app.label}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              ref={draggable.setNodeRef}
              type="button"
              aria-label={dragLabel}
              className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
              {...draggable.attributes}
              {...draggable.listeners}
            >
              <GripVertical className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            {dragLabel}
          </TooltipContent>
        </Tooltip>
      </div>
      <div ref={contentTargetRef} className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto" />
    </section>
  )
}
