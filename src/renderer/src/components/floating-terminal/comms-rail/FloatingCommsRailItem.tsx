import { useCallback } from 'react'
import { PictureInPicture2 } from 'lucide-react'
import type { FloatingCommsSessionState } from '../../../../../shared/floating-comms-surface'
import type { FloatingWorkspaceApp } from '../../../../../shared/floating-workspace-apps'
import { PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FLOATING_WORKSPACE_APP_ICONS } from '@/lib/floating-workspace-app-icons'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { CommunicationManagerSurfaceContent } from './CommunicationManagerSurfaceContent'
import type { CommunicationManager } from './communication-managers'
import { ZApiUnreadBadge } from './ZApiUnreadBadge'

export function FloatingCommsRailItem({
  app,
  manager,
  attached,
  domAttached,
  detached,
  initialSessionState,
  onSessionStateChange,
  onSelect,
  onDetach,
  onOpenApp,
  buttonRef,
  portalContainer,
  unreadCount
}: {
  app: FloatingWorkspaceApp
  manager: CommunicationManager
  attached: boolean
  domAttached: boolean
  detached: boolean
  initialSessionState: FloatingCommsSessionState
  onSessionStateChange: (sessionState: FloatingCommsSessionState) => void
  onSelect: () => void
  onDetach: (sessionState: FloatingCommsSessionState) => void
  onOpenApp: () => void
  buttonRef: (element: HTMLButtonElement | null) => void
  portalContainer: HTMLDivElement | null
  unreadCount: number
}): React.JSX.Element {
  const Icon = FLOATING_WORKSPACE_APP_ICONS[app.id]
  const handleSessionStateChange = useCallback(
    (sessionState: FloatingCommsSessionState) => onSessionStateChange(sessionState),
    [onSessionStateChange]
  )
  return (
    <manager.Presentation
      isPopoverOpen={attached}
      initialSessionState={initialSessionState}
      onSessionStateChange={handleSessionStateChange}
    >
      {(presentation) => {
        const detachedAction = translate(
          'communicationRail.focusDetached',
          'Focus {{app}} detached overlay',
          { app: app.label }
        )
        const label = detached ? `${presentation.tooltip}. ${detachedAction}` : presentation.tooltip
        const button = (
          <button
            ref={buttonRef}
            type="button"
            className={cn(
              'relative flex size-10 items-center justify-center outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
              presentation.status.kind === 'unavailable'
                ? 'text-muted-foreground/40'
                : 'text-muted-foreground hover:text-foreground'
            )}
            data-surface-mode={detached ? 'detached' : attached ? 'attached' : 'closed'}
            aria-label={label}
            onClick={onSelect}
          >
            <Icon size={18} />
            <ZApiUnreadBadge count={unreadCount} className="absolute right-0.5 top-0.5" />
            {presentation.status.kind === 'active' ? (
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-status-success" />
            ) : null}
            {attached ? (
              <span className="absolute right-0 top-[25%] bottom-[25%] w-[2px] rounded-l bg-foreground" />
            ) : null}
            {detached ? (
              <span className="absolute bottom-0.5 right-0.5 rounded-sm border border-border bg-background p-px text-foreground">
                <PictureInPicture2 className="size-2.5" />
              </span>
            ) : null}
          </button>
        )
        return (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                {domAttached ? <PopoverAnchor asChild>{button}</PopoverAnchor> : button}
              </TooltipTrigger>
              <TooltipContent side="left">{label}</TooltipContent>
            </Tooltip>
            {domAttached ? (
              <PopoverContent
                portalContainer={portalContainer}
                collisionBoundary={portalContainer}
                side="left"
                align="start"
                sideOffset={8}
                collisionPadding={8}
                className="popover-scroll-content scrollbar-sleek max-h-[min(420px,var(--radix-popover-content-available-height))] w-80 overflow-y-auto p-0"
              >
                <CommunicationManagerSurfaceContent
                  app={app}
                  content={presentation.content}
                  onOpenApp={onOpenApp}
                  onToggleDetached={() => onDetach(presentation.sessionState)}
                />
              </PopoverContent>
            ) : null}
          </>
        )
      }}
    </manager.Presentation>
  )
}
