import type { CSSProperties } from 'react'
import { HeadphoneOff, Headphones, Mic, MicOff, PhoneOff } from 'lucide-react'
import { toast } from 'sonner'
import type {
  DiscordVoiceParticipant,
  DiscordVoiceSnapshot
} from '../../../../shared/discord-voice'
import { Button } from '../ui/button'
import { Toggle } from '../ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { callDiscordVoice } from './useDiscordVoiceSnapshot'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

const NO_DRAG = { WebkitAppRegion: 'no-drag' } as CSSProperties

function localParticipant(snapshot: DiscordVoiceSnapshot): DiscordVoiceParticipant | null {
  return (
    snapshot.participants.find((participant) => participant.userId === snapshot.selfUserId) ?? null
  )
}

export function DiscordVoiceControls({
  snapshot,
  apply,
  command = callDiscordVoice,
  compact = false
}: {
  snapshot: DiscordVoiceSnapshot
  apply: (next: DiscordVoiceSnapshot) => void
  command?: (method: string, params?: unknown) => Promise<DiscordVoiceSnapshot>
  compact?: boolean
}): React.JSX.Element {
  const self = localParticipant(snapshot)
  const muted = self?.selfMute ?? false
  const deafened = self?.selfDeaf ?? false

  const run = (method: string, params?: unknown, failure?: string): void => {
    void command(method, params)
      .then(apply)
      .catch((error: unknown) => {
        console.error(`[discord-voice] ${method} failed:`, error)
        toast.error(
          failure ?? translate('discordVoice.error.command', 'Discord rejected the action')
        )
      })
  }

  return (
    <div
      data-no-drag
      style={NO_DRAG}
      className={cn(
        'flex items-center gap-1',
        compact ? 'shrink-0' : null,
        compact ? null : 'border-t border-border/60 px-2 py-2'
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            className={compact ? 'h-7 min-w-7 px-1' : undefined}
            pressed={muted}
            aria-label={translate('discordVoice.control.mute', 'Mute')}
            onPressedChange={(pressed) => run('discordVoice.setSelfMute', { muted: pressed })}
          >
            {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>{translate('discordVoice.control.mute', 'Mute')}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Toggle
            size="sm"
            className={compact ? 'h-7 min-w-7 px-1' : undefined}
            pressed={deafened}
            aria-label={translate('discordVoice.control.deafen', 'Deafen')}
            onPressedChange={(pressed) => run('discordVoice.setSelfDeaf', { deafened: pressed })}
          >
            {deafened ? <HeadphoneOff className="size-4" /> : <Headphones className="size-4" />}
          </Toggle>
        </TooltipTrigger>
        <TooltipContent>{translate('discordVoice.control.deafen', 'Deafen')}</TooltipContent>
      </Tooltip>

      {compact ? null : <div className="flex-1" />}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="destructive"
            size={compact ? 'icon-xs' : 'sm'}
            aria-label={translate('discordVoice.control.disconnect', 'Disconnect')}
            onClick={() => run('discordVoice.leaveCall')}
          >
            <PhoneOff className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {translate('discordVoice.control.disconnect', 'Disconnect')}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
