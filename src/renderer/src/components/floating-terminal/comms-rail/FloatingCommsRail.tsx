import { useLayoutEffect, type RefObject } from 'react'
import { ExternalLink } from 'lucide-react'
import type {
  FloatingWorkspaceApp,
  FloatingWorkspaceAppId
} from '../../../../../shared/floating-workspace-apps'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FLOATING_WORKSPACE_APP_ICONS } from '@/lib/floating-workspace-app-icons'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import {
  listEnabledCommunicationManagers,
  type CommunicationManager
} from './communication-managers'

type FloatingCommsRailProps = {
  panelRef: RefObject<HTMLDivElement | null>
  openAppId: FloatingWorkspaceAppId | null
  onOpenAppIdChange: (appId: FloatingWorkspaceAppId | null) => void
  onOpenApp: (app: FloatingWorkspaceApp) => void
}

function RailItem({
  app,
  manager,
  selected,
  panelRef,
  onSelect,
  onOpenApp
}: {
  app: FloatingWorkspaceApp
  manager: CommunicationManager
  selected: boolean
  panelRef: RefObject<HTMLDivElement | null>
  onSelect: () => void
  onOpenApp: () => void
}): React.JSX.Element {
  const Icon = FLOATING_WORKSPACE_APP_ICONS[app.id]

  return (
    <manager.Presentation isPopoverOpen={selected}>
      {(presentation) => {
        if (selected && !panelRef.current) {
          throw new Error('Floating communications popover requires the panel portal container')
        }
        const button = (
          <button
            type="button"
            className={cn(
              'relative flex size-10 items-center justify-center outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
              presentation.status.kind === 'unavailable'
                ? 'text-muted-foreground/40'
                : 'text-muted-foreground hover:text-foreground'
            )}
            aria-label={presentation.tooltip}
            onClick={onSelect}
          >
            <Icon size={18} />
            {presentation.status.kind === 'active' ? (
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-status-success" />
            ) : null}
            {selected ? (
              <span className="absolute right-0 top-[25%] bottom-[25%] w-[2px] bg-foreground rounded-l" />
            ) : null}
          </button>
        )

        return (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                {selected ? <PopoverAnchor asChild>{button}</PopoverAnchor> : button}
              </TooltipTrigger>
              <TooltipContent side="left">{presentation.tooltip}</TooltipContent>
            </Tooltip>
            {selected ? (
              <PopoverContent
                portalContainer={panelRef.current}
                collisionBoundary={panelRef.current}
                side="left"
                align="start"
                sideOffset={8}
                className="popover-scroll-content scrollbar-sleek max-h-[min(420px,var(--radix-popover-content-available-height))] w-80 overflow-y-auto p-0"
              >
                <div className="border-b border-border/60 px-3 py-2 text-sm font-semibold">
                  {app.label}
                </div>
                {presentation.content}
                <div className="border-t border-border/60 p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start gap-2"
                    onClick={onOpenApp}
                  >
                    <ExternalLink className="size-4" />
                    {translate('communicationRail.openApp', 'Open {{app}}', { app: app.label })}
                  </Button>
                </div>
              </PopoverContent>
            ) : null}
          </>
        )
      }}
    </manager.Presentation>
  )
}

export function FloatingCommsRail({
  panelRef,
  openAppId,
  onOpenAppIdChange,
  onOpenApp
}: FloatingCommsRailProps): React.JSX.Element | null {
  const preferences = useAppStore((state) => state.floatingWorkspaceApps)
  const entries = listEnabledCommunicationManagers(preferences)

  useLayoutEffect(() => {
    if (openAppId !== null && !entries.some(({ app }) => app.id === openAppId)) {
      onOpenAppIdChange(null)
    }
  }, [entries, onOpenAppIdChange, openAppId])

  if (entries.length === 0) {
    return null
  }

  return (
    <Popover
      modal={false}
      open={openAppId !== null}
      onOpenChange={(open) => {
        if (!open) {
          onOpenAppIdChange(null)
        }
      }}
    >
      <div className="flex w-10 shrink-0 flex-col border-l bg-background/95">
        {entries.map(({ app, manager }) => (
          <RailItem
            key={app.id}
            app={app}
            manager={manager}
            selected={openAppId === app.id}
            panelRef={panelRef}
            onSelect={() => onOpenAppIdChange(openAppId === app.id ? null : app.id)}
            onOpenApp={() => {
              onOpenAppIdChange(null)
              onOpenApp(app)
            }}
          />
        ))}
      </div>
    </Popover>
  )
}
