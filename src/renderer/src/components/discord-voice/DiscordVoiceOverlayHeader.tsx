import { Minimize2, X } from 'lucide-react'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { callDiscordVoice } from './useDiscordVoiceSnapshot'
import { translate } from '@/i18n/i18n'

const DRAG: React.CSSProperties = { WebkitAppRegion: 'drag' } as React.CSSProperties
const NO_DRAG: React.CSSProperties = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

function closeOverlay(): void {
  void callDiscordVoice('discordVoice.closeOverlay').catch((error: unknown) =>
    console.error('[discord-voice] failed to close the overlay:', error)
  )
}

export function DiscordVoiceOverlayHeader({
  title,
  onCollapse
}: {
  title: string
  onCollapse: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-1 border-b border-border/60 px-2 py-1.5" style={DRAG}>
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground">
        {title}
      </span>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            style={NO_DRAG}
            aria-label={translate('discordVoice.action.collapse', 'Collapse to pill')}
            onClick={onCollapse}
          >
            <Minimize2 className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {translate('discordVoice.action.collapse', 'Collapse to pill')}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            style={NO_DRAG}
            aria-label={translate('discordVoice.action.close', 'Close overlay')}
            onClick={closeOverlay}
          >
            <X className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{translate('discordVoice.action.close', 'Close overlay')}</TooltipContent>
      </Tooltip>
    </div>
  )
}
