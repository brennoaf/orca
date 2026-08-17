import { useCallback, useRef, useState } from 'react'
import { PictureInPicture2 } from 'lucide-react'
import type {
  FloatingCommsSessionState,
  FloatingCommsSurfaceIdentity
} from '../../../../../shared/floating-comms-surface'
import type { FloatingWorkspaceApp } from '../../../../../shared/floating-workspace-apps'
import { PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FLOATING_WORKSPACE_APP_ICONS } from '@/lib/floating-workspace-app-icons'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { CommunicationManagerSurfaceContent } from './CommunicationManagerSurfaceContent'
import type { CommunicationManager } from './communication-managers'
import type { WhatsAppFastResponseHostBinding } from './use-whatsapp-fast-response-host'
import type { SlackFastResponseHostBinding } from './use-slack-fast-response-host'
import type { DiscordWebFastResponseHostBinding } from './use-discord-web-fast-response-host'
import { clampFloatingCommsSurfaceHeight } from '../../../../../shared/floating-comms-surface'

export function FloatingCommsRailItem({
  app,
  manager,
  attached,
  domAttached,
  detached,
  hasUnread,
  initialSessionState,
  onSessionStateChange,
  onSelect,
  onDetach,
  onOpenApp,
  buttonRef,
  portalContainer,
  whatsappHost,
  slackHost,
  discordWebHost,
  resizeIdentity,
  attachedHeight
}: {
  app: FloatingWorkspaceApp
  manager: CommunicationManager
  attached: boolean
  domAttached: boolean
  detached: boolean
  hasUnread: boolean
  initialSessionState: FloatingCommsSessionState
  onSessionStateChange: (sessionState: FloatingCommsSessionState) => void
  onSelect: () => void
  onDetach: (sessionState: FloatingCommsSessionState) => void
  onOpenApp: () => void
  buttonRef: (element: HTMLButtonElement | null) => void
  portalContainer: HTMLElement | null
  whatsappHost?: WhatsAppFastResponseHostBinding
  slackHost?: SlackFastResponseHostBinding
  discordWebHost?: DiscordWebFastResponseHostBinding
  resizeIdentity?: FloatingCommsSurfaceIdentity
  attachedHeight?: number
}): React.JSX.Element {
  const Icon = FLOATING_WORKSPACE_APP_ICONS[app.id]
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const dragHeightRef = useRef<number | null>(null)
  const dragStartRef = useRef<{ height: number; pointerId: number; y: number } | null>(null)
  const handleSessionStateChange = useCallback(
    (sessionState: FloatingCommsSessionState) => onSessionStateChange(sessionState),
    [onSessionStateChange]
  )
  return (
    <manager.Presentation
      isPopoverOpen={attached}
      initialSessionState={initialSessionState}
      onSessionStateChange={handleSessionStateChange}
      whatsappHost={app.id === 'whatsapp-web' ? whatsappHost : undefined}
      slackHost={app.id === 'slack' ? slackHost : undefined}
      discordWebHost={app.id === 'discord' ? discordWebHost : undefined}
    >
      {(presentation) => {
        const height = dragHeight ?? attachedHeight ?? 520
        const resizable =
          domAttached &&
          (app.id === 'whatsapp-web' || app.id === 'slack') &&
          resizeIdentity?.appId === app.id &&
          resizeIdentity.mode === 'attached-dom' &&
          !presentation.minimal
        const detachedAction = translate(
          'communicationsDock.focusApp',
          'Focus {{app}} in communication dock',
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
            {presentation.status.kind === 'active' ? (
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-status-success" />
            ) : null}
            {hasUnread ? (
              <span
                aria-label={translate(
                  'communicationIntegrations.whatsappWeb.unreadMessages',
                  'Unread WhatsApp messages'
                )}
                className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-status-warning"
              />
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
                data-fast-response-surface=""
                portalContainer={portalContainer}
                collisionBoundary={portalContainer}
                side="left"
                align="start"
                sideOffset={8}
                collisionPadding={8}
                style={
                  resizable
                    ? { height: `min(${height}px, var(--radix-popover-content-available-height))` }
                    : undefined
                }
                className={cn(
                  'w-80 p-0',
                  (app.id === 'whatsapp-web' || app.id === 'slack') &&
                    'data-[state=open]:animate-none data-[state=closed]:animate-none',
                  presentation.minimal
                    ? 'h-[min(320px,var(--radix-popover-content-available-height))] overflow-hidden bg-white'
                    : 'h-[min(420px,var(--radix-popover-content-available-height))] overflow-hidden'
                )}
              >
                <CommunicationManagerSurfaceContent
                  app={app}
                  content={presentation.content}
                  minimal={presentation.minimal}
                  headerActions={presentation.headerActions}
                  hideFooter={presentation.hideFooter}
                  onOpenApp={onOpenApp}
                  onToggleDetached={() => onDetach(presentation.sessionState)}
                />
                {resizable ? (
                  <div
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label={translate(
                      'communicationRail.resizeFastResponse',
                      'Resize fast response'
                    )}
                    className="absolute inset-x-0 bottom-0 z-10 h-2 cursor-ns-resize touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onPointerDown={(event) => {
                      const handle = event.currentTarget
                      handle.setPointerCapture(event.pointerId)
                      dragStartRef.current = {
                        height,
                        pointerId: event.pointerId,
                        y: event.clientY
                      }
                    }}
                    onPointerMove={(event) => {
                      const start = dragStartRef.current
                      if (!start || start.pointerId !== event.pointerId) {
                        return
                      }
                      const requestedHeight = clampFloatingCommsSurfaceHeight(
                        start.height + event.clientY - start.y
                      )
                      const availableHeight =
                        event.currentTarget.parentElement?.getBoundingClientRect().height
                      const nextHeight =
                        availableHeight && availableHeight > 0
                          ? Math.min(requestedHeight, availableHeight)
                          : requestedHeight
                      dragHeightRef.current = nextHeight
                      setDragHeight(nextHeight)
                    }}
                    onPointerUp={(event) => {
                      const start = dragStartRef.current
                      if (!start || start.pointerId !== event.pointerId) {
                        return
                      }
                      const nextHeight = dragHeightRef.current ?? height
                      dragStartRef.current = null
                      dragHeightRef.current = null
                      setDragHeight(nextHeight)
                      if (!resizeIdentity) {
                        return
                      }
                      const { appId, requestId, surfaceId, mode } = resizeIdentity
                      void window.api.floatingComms.resize({
                        appId,
                        requestId,
                        surfaceId,
                        mode,
                        height: nextHeight
                      })
                    }}
                    onPointerCancel={() => {
                      dragStartRef.current = null
                      dragHeightRef.current = null
                      setDragHeight(null)
                    }}
                  />
                ) : null}
              </PopoverContent>
            ) : null}
          </>
        )
      }}
    </manager.Presentation>
  )
}
