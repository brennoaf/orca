import { Maximize2, Mic, MicOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DiscordVoiceSnapshot } from '../../../../shared/discord-voice'
import { Button } from '../ui/button'
import { ParticipantAvatar } from './DiscordVoiceParticipantRow'
import { translate } from '@/i18n/i18n'

const DRAG: React.CSSProperties = { WebkitAppRegion: 'drag' } as React.CSSProperties
const NO_DRAG: React.CSSProperties = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

export function DiscordVoiceCompactPill({
  snapshot,
  onExpand
}: {
  snapshot: DiscordVoiceSnapshot
  onExpand: () => void
}): React.JSX.Element {
  const speaker = snapshot.participants.find((participant) => participant.speaking) ?? null
  const self =
    snapshot.participants.find((participant) => participant.userId === snapshot.selfUserId) ?? null
  const muted = self ? self.mute || self.selfMute : false

  return (
    <div className="flex h-screen items-center gap-2 px-2" style={DRAG}>
      {speaker ? (
        <ParticipantAvatar participant={speaker} />
      ) : (
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
          {snapshot.participants.length}
        </div>
      )}
      <span className="min-w-0 flex-1 truncate text-xs">
        {speaker?.displayName ??
          snapshot.channelName ??
          translate('discordVoice.channel.unknown', 'Voice channel')}
      </span>
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center',
          self?.mute ? 'text-destructive' : 'text-muted-foreground'
        )}
        aria-label={
          muted
            ? translate('discordVoice.state.selfMuted', 'Muted')
            : translate('discordVoice.control.mute', 'Mute')
        }
      >
        {muted ? <MicOff className="size-3.5" /> : <Mic className="size-3.5" />}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6"
        style={NO_DRAG}
        aria-label={translate('discordVoice.action.expand', 'Expand overlay')}
        onClick={onExpand}
      >
        <Maximize2 className="size-3.5" />
      </Button>
    </div>
  )
}
