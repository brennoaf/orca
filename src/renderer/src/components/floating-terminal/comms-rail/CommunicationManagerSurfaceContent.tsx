import type { CSSProperties, ReactNode } from 'react'
import { ExternalLink, Minimize2, PictureInPicture2 } from 'lucide-react'
import type { FloatingWorkspaceApp } from '../../../../../shared/floating-workspace-apps'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'

const DRAG: CSSProperties = { WebkitAppRegion: 'drag' } as CSSProperties
const NO_DRAG: CSSProperties = { WebkitAppRegion: 'no-drag' } as CSSProperties

export function CommunicationManagerSurfaceContent({
  app,
  content,
  detached = false,
  minimal = false,
  headerActions,
  hideFooter = false,
  onOpenApp,
  onToggleDetached
}: {
  app: FloatingWorkspaceApp
  content: ReactNode
  detached?: boolean
  minimal?: boolean
  headerActions?: ReactNode
  hideFooter?: boolean
  onOpenApp: () => void
  onToggleDetached: () => void
}): React.JSX.Element {
  const toggleLabel = detached
    ? translate('communicationRail.returnToPanel', 'Back to panel')
    : translate('communicationRail.detach', 'Detach overlay')
  return (
    <div className={`flex h-full min-h-0 flex-1 flex-col ${minimal ? 'bg-white' : ''}`}>
      {minimal ? null : (
        <div
          key="header"
          className="flex min-w-0 shrink-0 items-center gap-2 border-b border-border/60 px-3 py-1.5 text-sm font-semibold"
          data-drag-region={detached || undefined}
          style={detached ? DRAG : undefined}
        >
          <span className="min-w-0 flex-1 truncate">{app.label}</span>
          {headerActions ? (
            <div
              role="region"
              aria-label={translate('communicationRail.controls', '{{app}} controls', {
                app: app.label
              })}
              tabIndex={0}
              className="scrollbar-sleek flex min-w-0 max-w-full shrink items-center overflow-x-auto overflow-y-hidden"
              data-communication-manager-header-actions
              data-no-drag
              style={NO_DRAG}
            >
              {headerActions}
            </div>
          ) : null}
          {hideFooter ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={translate('communicationRail.openApp', 'Open {{app}}', {
                    app: app.label
                  })}
                  data-no-drag={detached || undefined}
                  style={NO_DRAG}
                  onClick={onOpenApp}
                >
                  <ExternalLink />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {translate('communicationRail.openApp', 'Open {{app}}', { app: app.label })}
              </TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={toggleLabel}
                data-no-drag={detached || undefined}
                style={NO_DRAG}
                onClick={onToggleDetached}
              >
                {detached ? <Minimize2 /> : <PictureInPicture2 />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {toggleLabel}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
      <div key="content" className="min-h-0 flex-1" style={detached ? NO_DRAG : undefined}>
        {content}
      </div>
      {minimal || hideFooter ? null : (
        <div
          key="footer"
          className="shrink-0 border-t border-border/60 p-1"
          style={detached ? NO_DRAG : undefined}
        >
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
      )}
    </div>
  )
}
