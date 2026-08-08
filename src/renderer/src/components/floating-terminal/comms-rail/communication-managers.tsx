import type { ComponentType, ReactNode } from 'react'
import type {
  DiscordVoiceSnapshot,
  DiscordVoiceParticipant
} from '../../../../../shared/discord-voice'
import {
  COMMUNICATION_INTEGRATION_SECTION_IDS,
  type CommunicationIntegrationStatus,
  type CommunicationProviderId
} from '../../../../../shared/communication-integrations'
import {
  listEnabledFloatingWorkspaceApps,
  type FloatingWorkspaceApp,
  type FloatingWorkspaceAppId,
  type FloatingWorkspaceAppPreferences
} from '../../../../../shared/floating-workspace-apps'
import { Button } from '@/components/ui/button'
import { DiscordVoiceControls } from '@/components/discord-voice/DiscordVoiceControls'
import { DiscordVoiceOverlaySwitch } from '@/components/discord-voice/DiscordVoiceOverlaySwitch'
import { DiscordVoiceParticipantRow } from '@/components/discord-voice/DiscordVoiceParticipantRow'
import {
  callDiscordVoice,
  useDiscordVoiceSnapshot
} from '@/components/discord-voice/useDiscordVoiceSnapshot'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { useCommunicationIntegrationStatuses } from '@/components/settings/use-communication-integration-statuses'

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

function OverlayControl(): React.JSX.Element {
  return (
    <div className="border-t border-border/60 px-3 py-2">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-xs font-medium">
            {translate('communicationRail.overlaySeparate', 'Separate overlay')}
          </div>
          <p className="text-xs text-muted-foreground">
            {translate(
              'communicationRail.overlaySeparateDescription',
              'Appears automatically when you join a call.'
            )}
          </p>
        </div>
        <DiscordVoiceOverlaySwitch />
      </div>
    </div>
  )
}

export function getCommunicationSettingsTarget(provider: CommunicationProviderId) {
  return {
    pane: 'integrations' as const,
    repoId: null,
    sectionId: COMMUNICATION_INTEGRATION_SECTION_IDS[provider]
  }
}

function openCommunicationSettings(provider: CommunicationProviderId): void {
  const store = useAppStore.getState()
  store.openSettingsTarget(getCommunicationSettingsTarget(provider))
  store.openSettingsPage()
}

function runDiscordCommand(method: string, apply: (next: DiscordVoiceSnapshot) => void): void {
  void callDiscordVoice(method)
    .then(apply)
    .catch((error: unknown) => console.error(`[discord-voice] ${method} failed:`, error))
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

function DiscordContent({
  snapshot,
  apply
}: {
  snapshot: DiscordVoiceSnapshot
  apply: (next: DiscordVoiceSnapshot) => void
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => openCommunicationSettings('discord')}
        >
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
        <DiscordVoiceControls snapshot={snapshot} apply={apply} />
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
          onClick={() => runDiscordCommand('discordVoice.reconnect', apply)}
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
          onClick={() => runDiscordCommand('discordVoice.reconnect', apply)}
        >
          {translate('discordVoice.action.reconnect', 'Reconnect')}
        </Button>
      </div>
    )
  }

  return (
    <>
      {stateContent}
      <OverlayControl />
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
  useCommunicationIntegrationStatuses({ refreshWhen: isPopoverOpen })
  const { snapshot, apply } = useDiscordVoiceSnapshot({ activePolling: isPopoverOpen })
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
      {children({ status, tooltip, content: <DiscordContent snapshot={snapshot} apply={apply} /> })}
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
          onClick={() => openCommunicationSettings(props.provider)}
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
  const { getStatus } = useCommunicationIntegrationStatuses({ refreshWhen: isPopoverOpen })
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

function ZApiPresentation({
  isPopoverOpen,
  children
}: CommunicationManagerPresentationProps): React.JSX.Element {
  const { getStatus } = useCommunicationIntegrationStatuses({ refreshWhen: isPopoverOpen })
  const status = getStatus('z-api')
  const setupState = integrationSetupState(status?.provider === 'z-api' ? status : null)
  const reason = translate(
    'communicationRail.whatsappUnavailable',
    'WhatsApp fast responses are not enabled yet.'
  )
  return (
    <>
      {children({
        status: { kind: 'unavailable', reason },
        tooltip: translate('communicationRail.unavailableTooltip', '{{app}} — unavailable', {
          app: 'WhatsApp Web'
        }),
        content: (
          <UnavailableContent
            provider="z-api"
            providerName="Z-API"
            setupState={setupState}
            unconfiguredCopy={translate(
              'communicationRail.zApiUnconfigured',
              'Configure Z-API credentials and endpoint in Integrations.'
            )}
            configuredCopy={translate(
              'communicationRail.zApiConfigured',
              'Credentials configured. Fast responses are not enabled yet.'
            )}
            verifiedCopy={translate(
              'communicationRail.zApiVerified',
              'Credentials verified. Fast responses are not enabled yet.'
            )}
            persistentCopy={translate(
              'communicationRail.zApiRelayRequired',
              'Receiving WhatsApp messages requires an external public HTTPS relay. Orca does not provide one yet.'
            )}
          />
        )
      })}
    </>
  )
}

export const COMMUNICATION_MANAGER_REGISTRY: Record<FloatingWorkspaceAppId, CommunicationManager> =
  {
    'whatsapp-web': { Presentation: ZApiPresentation },
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
