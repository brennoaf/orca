import { useState } from 'react'
import { HeadphoneOff, MicOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  discordVoiceInitials,
  type DiscordVoiceParticipant
} from '../../../../shared/discord-voice'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { translate } from '@/i18n/i18n'

export function ParticipantAvatar({
  participant
}: {
  participant: DiscordVoiceParticipant
}): React.JSX.Element {
  const [imageFailed, setImageFailed] = useState(false)
  const showImage = participant.avatarUrl !== null && !imageFailed

  return (
    <div
      className={cn(
        'flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-2 transition-colors',
        participant.speaking ? 'ring-status-success' : 'ring-transparent'
      )}
    >
      {showImage ? (
        <img
          src={participant.avatarUrl ?? ''}
          alt=""
          className="size-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="text-[10px] font-medium text-muted-foreground">
          {discordVoiceInitials(participant.displayName)}
        </span>
      )}
    </div>
  )
}

function StateIcon({
  icon,
  label,
  tone
}: {
  icon: React.JSX.Element
  label: string
  tone: 'server' | 'self'
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'flex size-4 items-center justify-center',
            tone === 'server' ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {icon}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function DiscordVoiceParticipantRow({
  participant
}: {
  participant: DiscordVoiceParticipant
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1">
      <ParticipantAvatar participant={participant} />
      <span className="min-w-0 flex-1 truncate text-xs">{participant.displayName}</span>
      <div className="flex items-center gap-1">
        {participant.deaf ? (
          <StateIcon
            icon={<HeadphoneOff className="size-3.5" />}
            label={translate('discordVoice.state.serverDeafened', 'Deafened by a moderator')}
            tone="server"
          />
        ) : participant.selfDeaf ? (
          <StateIcon
            icon={<HeadphoneOff className="size-3.5" />}
            label={translate('discordVoice.state.selfDeafened', 'Deafened')}
            tone="self"
          />
        ) : null}
        {participant.mute ? (
          <StateIcon
            icon={<MicOff className="size-3.5" />}
            label={translate('discordVoice.state.serverMuted', 'Muted by a moderator')}
            tone="server"
          />
        ) : participant.selfMute ? (
          <StateIcon
            icon={<MicOff className="size-3.5" />}
            label={translate('discordVoice.state.selfMuted', 'Muted')}
            tone="self"
          />
        ) : null}
      </div>
    </div>
  )
}
