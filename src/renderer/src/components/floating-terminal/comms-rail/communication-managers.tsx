import type { ComponentType, ReactNode } from 'react'
import type {
  DiscordVoiceSnapshot,
  DiscordVoiceParticipant
} from '../../../../../shared/discord-voice'
import type {
  CommunicationIntegrationStatus,
  CommunicationProviderId
} from '../../../../../shared/communication-integrations'
import {
  listEnabledFloatingWorkspaceApps,
  type FloatingWorkspaceApp,
  type FloatingWorkspaceAppId,
  type FloatingWorkspaceAppPreferences
} from '../../../../../shared/floating-workspace-apps'
import { Button } from '@/components/ui/button'
import { DiscordVoiceControls } from '@/components/discord-voice/DiscordVoiceControls'
import { DiscordVoiceParticipantRow } from '@/components/discord-voice/DiscordVoiceParticipantRow'
import {
  callDiscordVoice,
  useDiscordVoiceSnapshot
} from '@/components/discord-voice/useDiscordVoiceSnapshot'
import { translate } from '@/i18n/i18n'
import {
  useCommunicationManagerRuntime,
  useCommunicationManagerStatuses
} from './communication-manager-runtime'
import { ZApiCommunicationManagerPresentation } from './ZApiCommunicationManager'
import {
  CommunicationOverlayControl,
  useOpenCommunicationSettings
} from './communication-manager-actions'

export { getCommunicationSettingsTarget } from './communication-manager-actions'

export {
  CommunicationManagerRuntimeProvider,
  LOCAL_Z_API_COMMUNICATION_MANAGER_CLIENT,
  type CommunicationManagerRuntime
} from './communication-manager-runtime'

export type CommunicationManagerStatus =
  | { kind: 'unavailable'; reason: string }
  | { kind: 'setup' }
  | { kind: 'idle' }
  | { kind: 'active' }

export type CommunicationManagerPresentation = {
  status: CommunicationManagerStatus
  tooltip: string
  content: ReactNode
}

type CommunicationManagerPresentationProps = {
  isPopoverOpen: boolean
  children: (presentation: CommunicationManagerPresentation) => ReactNode
}

export type CommunicationManager = {
  Presentation: ComponentType<CommunicationManagerPresentationProps>
}

function ParticipantList({
  participants
}: {
  participants: readonly DiscordVoiceParticipant[]
}): React.JSX.Element {
  return (
    <div className="space-y-0.5 px-1 py-2">
      {participants.map((participant) => (
        <DiscordVoiceParticipantRow key={participant.userId} participant={participant} />
      ))}
    </div>
  )
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

function DiscordContent({
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
  let stateContent: React.JSX.Element
  const popoverState = getDiscordPopoverState(snapshot)
  if (popoverState === 'setup') {
    stateContent = (
      <div className="space-y-3 px-3 py-3">
        <div className="text-sm font-medium">
          {translate('communicationRail.discord.notConnected', 'Discord not connected')}
        </div>
        <p className="text-xs text-muted-foreground">
          {translate(
            'communicationRail.discord.configureCredentials',
            'Configure the Application ID and Client Secret to connect to Discord desktop.'
          )}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => openSettings('discord')}>
          {translate('communicationRail.discord.openSettings', 'Configure Discord')}
        </Button>
      </div>
    )
  } else if (popoverState === 'active') {
    stateContent = (
      <div>
        <div className="border-b border-border/60 px-3 py-2 text-sm font-medium">
          {snapshot.channelName ?? translate('discordVoice.channel.unknown', 'Voice channel')}
        </div>
        <ParticipantList participants={snapshot.participants} />
        <DiscordVoiceControls snapshot={snapshot} apply={apply} command={command} />
      </div>
    )
  } else if (popoverState === 'connecting') {
    stateContent = (
      <p className="px-3 py-3 text-xs text-muted-foreground">
        {translate('communicationRail.discord.connecting', 'Connecting to Discord desktop…')}
      </p>
    )
  } else if (popoverState === 'error') {
    stateContent = (
      <div className="space-y-3 px-3 py-3">
        <p className="text-xs text-destructive">{snapshot.lastError}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => runDiscordCommand(command, 'discordVoice.reconnect', apply)}
        >
          {translate('discordVoice.action.reconnect', 'Reconnect')}
        </Button>
      </div>
    )
  } else if (popoverState === 'idle') {
    stateContent = (
      <p className="px-3 py-3 text-xs text-muted-foreground">
        {translate('communicationRail.discord.outsideCall', 'Connected — not in a call')}
      </p>
    )
  } else {
    stateContent = (
      <div className="space-y-3 px-3 py-3">
        <p className="text-xs text-muted-foreground">
          {translate(
            'communicationRail.discord.desktopDisconnected',
            'Discord desktop disconnected.'
          )}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => runDiscordCommand(command, 'discordVoice.reconnect', apply)}
        >
          {translate('discordVoice.action.reconnect', 'Reconnect')}
        </Button>
      </div>
    )
  }

  return (
    <>
      {stateContent}
      <CommunicationOverlayControl />
    </>
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

function DiscordPresentation({
  isPopoverOpen,
  children
}: CommunicationManagerPresentationProps): React.JSX.Element {
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
        content: (
          <DiscordContent
            snapshot={snapshot}
            apply={apply}
            command={command}
            openSettings={openSettings}
          />
        )
      })}
    </>
  )
}

function integrationSetupState(status: CommunicationIntegrationStatus | null) {
  if (status?.readiness.lastError) {
    return 'attention'
  }
  if (!status?.readiness.configured) {
    return 'unconfigured'
  }
  return status.readiness.verified ? 'verified' : 'configured'
}

function UnavailableContent(props: {
  provider: CommunicationProviderId
  providerName: string
  setupState: ReturnType<typeof integrationSetupState>
  configuredCopy: string
  verifiedCopy: string
  unconfiguredCopy: string
  persistentCopy?: string
  openSettings: (provider: CommunicationProviderId) => void
}): React.JSX.Element {
  const setupCopy =
    props.setupState === 'verified'
      ? props.verifiedCopy
      : props.setupState === 'configured'
        ? props.configuredCopy
        : props.setupState === 'attention'
          ? translate(
              'communicationRail.integrationNeedsAttention',
              'Saved credentials need attention. Review them in Integrations.'
            )
          : props.unconfiguredCopy
  return (
    <div className="space-y-3 px-3 py-3">
      <p className="text-xs text-muted-foreground">{setupCopy}</p>
      {props.persistentCopy ? (
        <p className="text-xs text-muted-foreground">{props.persistentCopy}</p>
      ) : null}
      {props.setupState === 'unconfigured' || props.setupState === 'attention' ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => props.openSettings(props.provider)}
        >
          {translate('communicationRail.configureProvider', 'Configure {{provider}}', {
            provider: props.providerName
          })}
        </Button>
      ) : null}
    </div>
  )
}

function SlackPresentation({
  isPopoverOpen,
  children
}: CommunicationManagerPresentationProps): React.JSX.Element {
  const runtime = useCommunicationManagerRuntime()
  const { getStatus } = useCommunicationManagerStatuses(runtime, isPopoverOpen)
  const openSettings = useOpenCommunicationSettings()
  const status = getStatus('slack')
  const setupState = integrationSetupState(status?.provider === 'slack' ? status : null)
  const reason = translate(
    'communicationRail.slackUnavailable',
    'Slack fast responses are not enabled yet.'
  )
  return (
    <>
      {children({
        status: { kind: 'unavailable', reason },
        tooltip: translate('communicationRail.unavailableTooltip', '{{app}} — unavailable', {
          app: 'Slack'
        }),
        content: (
          <UnavailableContent
            provider="slack"
            providerName="Slack"
            openSettings={openSettings}
            setupState={setupState}
            unconfiguredCopy={translate(
              'communicationRail.slackUnconfigured',
              'Configure Slack credentials in Integrations. Socket Mode transport is not active yet.'
            )}
            configuredCopy={translate(
              'communicationRail.slackConfigured',
              'Credentials configured. Fast responses are not enabled yet.'
            )}
            verifiedCopy={translate(
              'communicationRail.slackVerified',
              'Credentials verified. Fast responses are not enabled yet.'
            )}
          />
        )
      })}
    </>
  )
}

export const COMMUNICATION_MANAGER_REGISTRY: Record<FloatingWorkspaceAppId, CommunicationManager> =
  {
    'whatsapp-web': { Presentation: ZApiCommunicationManagerPresentation },
    slack: { Presentation: SlackPresentation },
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
