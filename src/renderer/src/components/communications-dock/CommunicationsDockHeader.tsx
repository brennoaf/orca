import { ChevronDown, ChevronUp, Minimize2 } from 'lucide-react'
import type { CSSProperties, RefObject } from 'react'
import type {
  CommunicationsDockSnapshot,
  CommunicationsDockTab
} from '../../../../shared/communications-dock'
import type { FloatingWorkspaceAppId } from '../../../../shared/floating-workspace-apps'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { CommunicationsDockNavbar } from './CommunicationsDockNavbar'

const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as CSSProperties

function IconAction({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function CommunicationsDockHeader({
  snapshot,
  activeTab,
  whatsappHasUnread,
  headerRef,
  setHeaderActionsTarget,
  onActivateTab,
  onActivateLeaf,
  onToggle,
  onReattach
}: {
  snapshot: CommunicationsDockSnapshot
  activeTab: CommunicationsDockTab
  whatsappHasUnread: boolean
  headerRef: RefObject<HTMLDivElement | null>
  setHeaderActionsTarget: (element: HTMLDivElement | null) => void
  onActivateTab: (tabId: string) => void
  onActivateLeaf: (tabId: string, appId: FloatingWorkspaceAppId) => void
  onToggle: () => void
  onReattach: () => void
}): React.JSX.Element {
  const collapseLabel = snapshot.layout.collapsed
    ? translate('communicationsDock.show', 'Show dock content')
    : translate('communicationsDock.collapse', 'Collapse dock')
  const reattachLabel = translate('communicationsDock.reattach', 'Back to panel')

  return (
    <header
      ref={headerRef}
      className="flex min-h-10 min-w-0 shrink-0 items-center gap-1 border-b border-border bg-card px-1"
      data-drag-region
      style={DRAG}
    >
      <div className="flex min-w-0 shrink" data-no-drag style={NO_DRAG}>
        <CommunicationsDockNavbar
          tabs={snapshot.layout.tabs}
          activeTabId={snapshot.layout.activeTabId}
          whatsappHasUnread={whatsappHasUnread}
          onActivateTab={onActivateTab}
          onActivateLeaf={onActivateLeaf}
        />
      </div>
      <div
        className="min-w-0 flex-1"
        data-communications-dock-drag-spacer
        data-drag-region
        style={DRAG}
      />
      <div
        ref={setHeaderActionsTarget}
        role={activeTab.activeLeafAppId === 'discord' ? 'region' : undefined}
        aria-label={
          activeTab.activeLeafAppId === 'discord'
            ? translate('communicationRail.controls', 'Discord controls')
            : undefined
        }
        tabIndex={activeTab.activeLeafAppId === 'discord' ? 0 : undefined}
        className="scrollbar-sleek flex min-w-0 max-w-full shrink items-center overflow-x-auto overflow-y-hidden"
        data-communications-dock-header-actions
        data-no-drag
        style={NO_DRAG}
      />
      <div className="flex shrink-0 items-center" data-no-drag style={NO_DRAG}>
        <IconAction label={collapseLabel} onClick={onToggle}>
          {snapshot.layout.collapsed ? <ChevronDown /> : <ChevronUp />}
        </IconAction>
        <IconAction label={reattachLabel} onClick={onReattach}>
          <Minimize2 />
        </IconAction>
      </div>
    </header>
  )
}
