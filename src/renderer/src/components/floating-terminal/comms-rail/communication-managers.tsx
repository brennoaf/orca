import { useState, type ComponentType, type ReactNode } from 'react'
import { HeadphoneOff, Headphones, LoaderCircle, PictureInPicture2, Unplug } from 'lucide-react'
import type { DiscordVoiceSnapshot } from '../../../../../shared/discord-voice'
import type { CommunicationProviderId } from '../../../../../shared/communication-integrations'
import type { FloatingCommsSessionState } from '../../../../../shared/floating-comms-surface'
import {
  listEnabledFloatingWorkspaceApps,
  type FloatingWorkspaceApp,
  type FloatingWorkspaceAppId,
  type FloatingWorkspaceAppPreferences
} from '../../../../../shared/floating-workspace-apps'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DiscordVoiceControls } from '@/components/discord-voice/DiscordVoiceControls'
import {
  callDiscordVoice,
  useDiscordVoiceSnapshot
} from '@/components/discord-voice/useDiscordVoiceSnapshot'
import { translate } from '@/i18n/i18n'
import {
  useCommunicationManagerRuntime,
  useCommunicationManagerStatuses
} from './communication-manager-runtime'
import { WhatsAppWebFastResponsePresentation } from './WhatsAppWebFastResponsePresentation'
import type { WhatsAppFastResponseHostBinding } from './use-whatsapp-fast-response-host'
import { SlackWebFastResponsePresentation } from './SlackWebFastResponsePresentation'
import type { SlackFastResponseHostBinding } from './use-slack-fast-response-host'
import {
  useDiscordWebFastResponseHost,
  type DiscordWebFastResponseHostBinding
} from './use-discord-web-fast-response-host'
import { useOpenCommunicationSettings } from './communication-manager-actions'
import { DiscordWebCompactModeAction } from './DiscordWebCompactModeAction'

export { getCommunicationSettingsTarget } from './communication-manager-actions'
export {
  createCommunicationManagerSessionSnapshot,
  createCommunicationManagerSessionState
} from './communication-manager-sessions'

export {
  CommunicationManagerRuntimeProvider,
  type CommunicationManagerRuntime
} from './communication-manager-runtime'

export type CommunicationManagerStatus =
  | { kind: 'loading' }
  | { kind: 'unavailable'; reason: string }
  | { kind: 'setup' }
  | { kind: 'idle' }
  | { kind: 'active' }

export type CommunicationManagerPresentation = {
  status: CommunicationManagerStatus
  tooltip: string
  content: ReactNode
  sessionState: FloatingCommsSessionState
  minimal?: boolean
  headerActions?: ReactNode
  hideFooter?: boolean
}

type CommunicationManagerPresentationProps = {
  isPopoverOpen: boolean
  initialSessionState?: FloatingCommsSessionState
  onSessionStateChange?: (sessionState: FloatingCommsSessionState) => void
  whatsappHost?: WhatsAppFastResponseHostBinding
  slackHost?: SlackFastResponseHostBinding
  discordWebHost?: DiscordWebFastResponseHostBinding
  children: (presentation: CommunicationManagerPresentation) => ReactNode
}

export type CommunicationManager = {
  Presentation: ComponentType<CommunicationManagerPresentationProps>
}

function runDiscordCommand(
  command: (method: string, params?: unknown) => Promise<DiscordVoiceSnapshot>,
  method: string,
  apply: (next: DiscordVoiceSnapshot) => void
): void {
  void command(method)
    .then(apply)
    .catch((error: unknown) => console.error(`[discord-voice] ${method} failed:`, error))
}

function DiscordVoiceHeaderActions({
  snapshot,
  apply,
  command,
  openSettings
}: {
  snapshot: DiscordVoiceSnapshot
  apply: (next: DiscordVoiceSnapshot) => void
  command: (method: string, params?: unknown) => Promise<DiscordVoiceSnapshot>
  openSettings: (provider: CommunicationProviderId) => void
}): React.JSX.Element {
  const runtime = useCommunicationManagerRuntime()
  const popoverState = getDiscordPopoverState(snapshot)
  const selection = snapshot.selection ?? {
    kind: 'idle' as const,
    revision: 0,
    requestId: 0,
    channelId: null,
    errorCode: null
  }
  const selectionStatus =
    selection.kind === 'pending'
      ? translate('communicationRail.discord.selectionPending', 'Selecting voice channel…')
      : selection.kind === 'failed'
        ? translate('communicationRail.discord.selectionFailed', 'Could not select voice channel.')
        : null
  const selectionIndicator = selectionStatus ? (
    <span role="status" aria-label={selectionStatus} className="text-xs text-muted-foreground">
      {selection.kind === 'pending' ? <LoaderCircle className="animate-spin" /> : <HeadphoneOff />}
    </span>
  ) : null
  if (popoverState === 'active') {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <span className="max-w-28 shrink-0 truncate text-xs font-normal text-muted-foreground">
          {snapshot.channelName ?? translate('discordVoice.channel.unknown', 'Voice channel')}
        </span>
        <DiscordVoiceControls snapshot={snapshot} apply={apply} command={command} compact />
        {selectionIndicator}
        {runtime ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={translate('communicationRail.overlaySeparate', 'Separate overlay')}
                aria-pressed={runtime.overlayOpen}
                onClick={() => runtime.setOverlayOpen(!runtime.overlayOpen)}
              >
                <PictureInPicture2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={4}>
              {translate('communicationRail.overlaySeparate', 'Separate overlay')}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    )
  }

  const label =
    popoverState === 'setup'
      ? translate(
          'communicationRail.discord.voiceNotConfigured',
          'Controles de voz não configurados'
        )
      : popoverState === 'connecting'
        ? translate('communicationRail.discord.connecting', 'Connecting to Discord desktop…')
        : popoverState === 'idle'
          ? translate('communicationRail.discord.outsideCall', 'Connected — not in a call')
          : (snapshot.lastError ??
            translate(
              'communicationRail.discord.desktopDisconnected',
              'Discord desktop disconnected.'
            ))
  const icon =
    popoverState === 'setup' ? (
      <Unplug />
    ) : popoverState === 'connecting' ? (
      <LoaderCircle className="animate-spin" />
    ) : popoverState === 'idle' ? (
      <Headphones />
    ) : (
      <HeadphoneOff />
    )
  const onClick =
    popoverState === 'setup'
      ? () => openSettings('discord')
      : popoverState === 'error' || popoverState === 'disconnected'
        ? () => runDiscordCommand(command, 'discordVoice.reconnect', apply)
        : undefined

  const trigger = onClick ? (
    <Button type="button" variant="ghost" size="icon-xs" aria-label={label} onClick={onClick}>
      {icon}
    </Button>
  ) : (
    <span
      role="status"
      aria-label={label}
      className="inline-flex size-7 items-center justify-center text-muted-foreground [&_svg]:size-4"
    >
      {icon}
    </span>
  )

  return (
    <div className="flex shrink-0 items-center gap-1">
      {selectionIndicator}
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={4}>
          {label}
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

export type DiscordPopoverState =
  | 'setup'
  | 'connecting'
  | 'error'
  | 'idle'
  | 'active'
  | 'disconnected'

export function getDiscordPopoverState(snapshot: DiscordVoiceSnapshot): DiscordPopoverState {
  if (!snapshot.credentialsConfigured) {
    return 'setup'
  }
  if (snapshot.channelId !== null) {
    return 'active'
  }
  if (snapshot.connection === 'connecting') {
    return 'connecting'
  }
  if (snapshot.connection === 'disconnected' && snapshot.lastError) {
    return 'error'
  }
  return snapshot.connection === 'connected' ? 'idle' : 'disconnected'
}

export function getDiscordCommunicationStatus(
  snapshot: DiscordVoiceSnapshot
): CommunicationManagerStatus {
  if (snapshot.channelId !== null) {
    return { kind: 'active' }
  }
  if (!snapshot.credentialsConfigured) {
    return { kind: 'setup' }
  }
  return { kind: 'idle' }
}

export function DiscordPresentation({
  isPopoverOpen,
  discordWebHost,
  children
}: CommunicationManagerPresentationProps): React.JSX.Element {
  const [webElement, setWebElement] = useState<HTMLDivElement | null>(null)
  const webState = useDiscordWebFastResponseHost({ binding: discordWebHost, element: webElement })
  const runtime = useCommunicationManagerRuntime()
  useCommunicationManagerStatuses(runtime, isPopoverOpen)
  const command = runtime?.commandDiscord ?? callDiscordVoice
  const openSettings = useOpenCommunicationSettings()
  const { snapshot, apply } = useDiscordVoiceSnapshot({ activePolling: isPopoverOpen, command })
  const status = getDiscordCommunicationStatus(snapshot)
  const tooltip = (() => {
    if (status.kind === 'active') {
      return translate('communicationRail.discord.tooltipActive', 'Discord — in a call')
    }
    if (status.kind === 'setup') {
      return translate('communicationRail.discord.tooltipSetup', 'Discord — setup required')
    }
    if (snapshot.connection === 'connecting') {
      return translate('communicationRail.discord.tooltipConnecting', 'Discord — connecting')
    }
    if (snapshot.lastError) {
      return translate('communicationRail.discord.tooltipError', 'Discord — connection error')
    }
    return translate('communicationRail.discord.tooltipIdle', 'Discord — not in a call')
  })()
  return (
    <>
      {children({
        status,
        tooltip,
        sessionState: { appId: 'discord' },
        headerActions: (
          <div className="flex w-max shrink-0 items-center gap-1">
            <DiscordWebCompactModeAction state={webState} />
            <DiscordVoiceHeaderActions
              snapshot={snapshot}
              apply={apply}
              command={command}
              openSettings={openSettings}
            />
          </div>
        ),
        hideFooter: true,
        content: discordWebHost ? (
          <div className="relative h-full min-h-0 overflow-hidden bg-background">
            <div
              ref={setWebElement}
              className="absolute inset-0"
              aria-label={translate('communicationRail.discord.web', 'Discord Web — fast response')}
            />
            {webState.kind === 'loading' ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                {translate('communicationRail.discord.webLoading', 'Loading Discord Web…')}
              </div>
            ) : webState.kind === 'crashed' || webState.kind === 'error' ? (
              <div
                role="alert"
                className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground"
              >
                {translate('communicationRail.discord.webError', 'Could not open Discord Web.')}
              </div>
            ) : webState.kind === 'ready' && webState.contentMode === 'unsupported' ? (
              <div
                role="status"
                className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground"
              >
                {translate(
                  'communicationRail.discord.webUnsupported',
                  'This Discord view is not available in fast response yet.'
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="h-full min-h-0 bg-background" />
        )
      })}
    </>
  )
}

export const COMMUNICATION_MANAGER_REGISTRY: Record<FloatingWorkspaceAppId, CommunicationManager> =
  {
    'whatsapp-web': { Presentation: WhatsAppWebFastResponsePresentation },
    slack: { Presentation: SlackWebFastResponsePresentation },
    discord: { Presentation: DiscordPresentation }
  }

export function listEnabledCommunicationManagers(
  preferences: FloatingWorkspaceAppPreferences | undefined
): readonly { app: FloatingWorkspaceApp; manager: CommunicationManager }[] {
  return listEnabledFloatingWorkspaceApps(preferences).map((app) => ({
    app,
    manager: COMMUNICATION_MANAGER_REGISTRY[app.id]
  }))
}
