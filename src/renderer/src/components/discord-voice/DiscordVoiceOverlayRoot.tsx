import { RefreshCw } from 'lucide-react'
import type { DiscordVoiceSnapshot } from '../../../../shared/discord-voice'
import { Button } from '../ui/button'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '../ui/tooltip'
import { DiscordVoiceCompactPill } from './DiscordVoiceCompactPill'
import { DiscordVoiceControls } from './DiscordVoiceControls'
import { DiscordVoiceOverlayHeader } from './DiscordVoiceOverlayHeader'
import { DiscordVoiceParticipantRow } from './DiscordVoiceParticipantRow'
import { useDiscordVoiceOverlayCompact } from './useDiscordVoiceOverlayCompact'
import { callDiscordVoice, useDiscordVoiceSnapshot } from './useDiscordVoiceSnapshot'
import { translate } from '@/i18n/i18n'

function OverlayMessage({
  message,
  action
}: {
  message: string
  action?: React.JSX.Element
}): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-xs text-muted-foreground">{message}</p>
      {action}
    </div>
  )
}

function ReconnectButton({
  apply
}: {
  apply: (next: DiscordVoiceSnapshot) => void
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() =>
        void callDiscordVoice('discordVoice.reconnect')
          .then(apply)
          .catch((error: unknown) => console.error('[discord-voice] reconnect failed:', error))
      }
    >
      <RefreshCw className="size-3.5" />
      {translate('discordVoice.action.reconnect', 'Reconnect')}
    </Button>
  )
}

function OverlayBody({
  snapshot,
  apply
}: {
  snapshot: DiscordVoiceSnapshot
  apply: (next: DiscordVoiceSnapshot) => void
}): React.JSX.Element {
  if (snapshot.connection === 'connecting') {
    return (
      <OverlayMessage
        message={translate('discordVoice.empty.connecting', 'Connecting to Discord…')}
      />
    )
  }
  if (!snapshot.credentialsConfigured) {
    return (
      <OverlayMessage
        message={translate(
          'discordVoice.empty.notConfigured',
          'Add your Discord application ID and client secret in Settings › Floating Workspace to use the call overlay.'
        )}
      />
    )
  }
  if (snapshot.connection === 'disconnected') {
    return (
      <OverlayMessage
        message={
          snapshot.lastError ??
          translate('discordVoice.empty.discordClosed', 'Discord desktop is not open.')
        }
        action={<ReconnectButton apply={apply} />}
      />
    )
  }
  if (snapshot.channelId === null) {
    return <OverlayMessage message={translate('discordVoice.empty.notInCall', 'Not in a call.')} />
  }
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto scrollbar-sleek px-1 pb-1">
        {snapshot.participants.map((participant) => (
          <DiscordVoiceParticipantRow key={participant.userId} participant={participant} />
        ))}
      </div>
      <DiscordVoiceControls snapshot={snapshot} apply={apply} />
    </div>
  )
}

export function DiscordVoiceOverlayRoot(): React.JSX.Element {
  const { snapshot, apply } = useDiscordVoiceSnapshot()
  const { compact, setCompact } = useDiscordVoiceOverlayCompact()

  if (compact) {
    return (
      <TooltipProvider>
        <div className="h-screen bg-background text-foreground">
          <DiscordVoiceCompactPill snapshot={snapshot} onExpand={() => setCompact(false)} />
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col bg-background text-foreground">
        <DiscordVoiceOverlayHeader
          title={snapshot.channelName ?? translate('discordVoice.channel.unknown', 'Voice channel')}
          onCollapse={() => setCompact(true)}
        />
        <OverlayBody snapshot={snapshot} apply={apply} />
      </div>
      <Toaster closeButton toastOptions={{ className: 'font-sans text-sm' }} />
    </TooltipProvider>
  )
}
