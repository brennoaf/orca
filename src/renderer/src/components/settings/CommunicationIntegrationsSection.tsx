import { useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Hash,
  Loader2,
  MessageCircle,
  MessageSquare
} from 'lucide-react'
import type {
  CommunicationIntegrationStatus,
  DiscordCommunicationIntegrationStatus
} from '../../../../shared/communication-integrations'
import { COMMUNICATION_INTEGRATION_SECTION_IDS } from '../../../../shared/communication-integrations'
import { DiscordVoiceOverlaySwitch } from '@/components/discord-voice/DiscordVoiceOverlaySwitch'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { DiscordCommunicationIntegrationDialog } from './CommunicationIntegrationDialog'
import {
  IntegrationCardDetails,
  IntegrationCardShell,
  type IntegrationCardStatusTone
} from './integration-card-shell'
import { useCommunicationIntegrationStatuses } from './use-communication-integration-statuses'
import { useAppStore } from '@/store'
import {
  FLOATING_WORKSPACE_APPS,
  getFloatingWorkspaceAppPreference
} from '../../../../shared/floating-workspace-apps'
import { openOrFocusFloatingWorkspaceAppTab } from '@/lib/floating-workspace-tab-creation'
import { SettingsSwitchRow } from './SettingsFormControls'
import {
  useCommunicationIntegrationCardActions,
  type CommunicationIntegrationTestResult
} from './use-communication-integration-card-actions'
import type { CommunicationIntegrationPendingOperation } from './CommunicationIntegrationDialogFields'

type CardPresentation = {
  label: string
  tone: IntegrationCardStatusTone
  checking: boolean
}

export function getCommunicationIntegrationCardPresentation(
  status: CommunicationIntegrationStatus | null,
  loading: boolean,
  loadError: string | null
): CardPresentation {
  if (!status && loading) {
    return {
      label: translate('communicationIntegrations.status.checking', 'Checking…'),
      tone: 'neutral',
      checking: true
    }
  }
  if (loadError || status?.readiness.lastError) {
    return {
      label: translate('communicationIntegrations.status.needsAttention', 'Needs attention'),
      tone: 'attention',
      checking: false
    }
  }
  if (!status?.readiness.configured) {
    return {
      label: translate('communicationIntegrations.status.notConfigured', 'Not configured'),
      tone: 'neutral',
      checking: false
    }
  }
  if (status.readiness.verified) {
    return {
      label: translate('communicationIntegrations.status.connected', 'Connected'),
      tone: 'connected',
      checking: false
    }
  }
  return {
    label: translate('communicationIntegrations.status.configured', 'Configured'),
    tone: 'neutral',
    checking: false
  }
}

function TestResultLine({
  result,
  duplicateError
}: {
  result: CommunicationIntegrationTestResult | null
  duplicateError: string | null
}): React.JSX.Element | null {
  if (!result || (result.kind === 'error' && result.message === duplicateError)) {
    return null
  }
  return (
    <p
      role={result.kind === 'ok' ? 'status' : 'alert'}
      className={
        result.kind === 'ok'
          ? 'flex items-center gap-1.5 text-xs text-status-success'
          : 'flex items-center gap-1.5 text-xs text-destructive'
      }
    >
      {result.kind === 'ok' ? (
        <CheckCircle2 className="size-3.5 shrink-0" />
      ) : (
        <AlertCircle className="size-3.5 shrink-0" />
      )}
      {result.message}
    </p>
  )
}

type CommonCardProps = {
  status: CommunicationIntegrationStatus | null
  loading: boolean
  loadError: string | null
}

function CardActions(props: {
  configured: boolean
  pending: CommunicationIntegrationPendingOperation
  onConfigure: () => void
  onTest: () => void
}): React.JSX.Element {
  return (
    <>
      {props.configured ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={props.pending !== null}
          onClick={props.onTest}
        >
          {props.pending === 'test' ? <Loader2 className="animate-spin" /> : null}
          {props.pending === 'test'
            ? translate('communicationIntegrations.action.testing', 'Testing…')
            : translate('communicationIntegrations.action.test', 'Test')}
        </Button>
      ) : null}
      <Button
        type="button"
        variant={props.configured ? 'outline' : 'default'}
        size="sm"
        disabled={props.pending !== null}
        onClick={props.onConfigure}
      >
        {props.configured
          ? translate('communicationIntegrations.action.edit', 'Edit')
          : translate('communicationIntegrations.action.configure', 'Configure')}
      </Button>
    </>
  )
}

function getStatusError(
  status: CommunicationIntegrationStatus | null,
  loadError: string | null
): string | null {
  return status?.readiness.lastError?.message ?? loadError
}

function StatusError({ message }: { message: string | null }): React.JSX.Element | null {
  return message ? (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  ) : null
}

function DiscordCommunicationIntegrationCard({
  status,
  loading,
  loadError
}: CommonCardProps & { status: DiscordCommunicationIntegrationStatus | null }): React.JSX.Element {
  const [dialogOpen, setDialogOpen] = useState(false)
  const actions = useCommunicationIntegrationCardActions('discord', 'Discord')
  const presentation = getCommunicationIntegrationCardPresentation(status, loading, loadError)
  const configured = status?.readiness.configured ?? false
  const statusError = getStatusError(status, loadError)

  return (
    <IntegrationCardShell
      settingsSectionId={COMMUNICATION_INTEGRATION_SECTION_IDS.discord}
      icon={<MessageSquare className="size-5" />}
      name="Discord"
      description={translate(
        'communicationIntegrations.discord.cardDescription',
        'Discord desktop RPC credentials and call overlay controls.'
      )}
      checking={presentation.checking}
      statusLabel={presentation.label}
      statusTone={presentation.tone}
      actions={
        <CardActions
          configured={configured}
          pending={actions.pending}
          onConfigure={() => setDialogOpen(true)}
          onTest={() => void actions.test()}
        />
      }
    >
      <IntegrationCardDetails>
        <StatusError message={statusError} />
        <TestResultLine result={actions.testResult} duplicateError={statusError} />
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-medium">
              {translate('communicationRail.overlaySeparate', 'Separate overlay')}
            </p>
            <p className="text-xs text-muted-foreground">
              {translate(
                'communicationRail.overlaySeparateDescription',
                'Appears automatically when you join a call.'
              )}
            </p>
          </div>
          <DiscordVoiceOverlaySwitch />
        </div>
      </IntegrationCardDetails>
      <DiscordCommunicationIntegrationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        status={status}
        pending={actions.pending}
        error={actions.error}
        onSave={actions.save}
        onClear={actions.clear}
      />
    </IntegrationCardShell>
  )
}

function SlackCommunicationIntegrationCard(): React.JSX.Element {
  const preferences = useAppStore((state) => state.floatingWorkspaceApps)
  const setPreference = useAppStore((state) => state.setFloatingWorkspaceAppPreference)
  const preference = getFloatingWorkspaceAppPreference(preferences, 'slack')

  const openSlack = (): void => {
    const app = FLOATING_WORKSPACE_APPS.find((candidate) => candidate.id === 'slack')
    if (!app) {
      throw new Error('Slack is missing from the floating workspace app catalog')
    }
    void openOrFocusFloatingWorkspaceAppTab(useAppStore.getState(), app)
  }

  return (
    <IntegrationCardShell
      settingsSectionId={COMMUNICATION_INTEGRATION_SECTION_IDS.slack}
      icon={<Hash className="size-5" />}
      name="Slack"
      description={translate(
        'communicationIntegrations.slack.cardDescription',
        'Slack Web uses its own persistent browser session for full and fast-response views.'
      )}
      statusLabel={
        preference.enabled
          ? translate('communicationIntegrations.status.enabled', 'Enabled')
          : translate('communicationIntegrations.status.disabled', 'Disabled')
      }
      statusTone="neutral"
      actions={
        <Button type="button" variant="outline" size="sm" onClick={openSlack}>
          <ExternalLink />
          {translate('communicationIntegrations.slack.open', 'Open Slack')}
        </Button>
      }
    >
      <IntegrationCardDetails>
        <SettingsSwitchRow
          label={translate('communicationIntegrations.slack.enabled', 'Show Slack')}
          description={translate(
            'communicationIntegrations.slack.enabledDescription',
            'Controls whether Slack appears in the communications rail and floating workspace menu.'
          )}
          checked={preference.enabled}
          onChange={() => setPreference('slack', { enabled: !preference.enabled })}
        />
        <p className="text-xs text-muted-foreground">
          {translate(
            'communicationIntegrations.slack.signInDescription',
            'Sign in directly in the Slack window. Orca does not store Slack API credentials.'
          )}
        </p>
      </IntegrationCardDetails>
    </IntegrationCardShell>
  )
}

function WhatsAppWebCommunicationIntegrationCard(): React.JSX.Element {
  const preferences = useAppStore((state) => state.floatingWorkspaceApps)
  const setPreference = useAppStore((state) => state.setFloatingWorkspaceAppPreference)
  const preference = getFloatingWorkspaceAppPreference(preferences, 'whatsapp-web')

  return (
    <IntegrationCardShell
      settingsSectionId={COMMUNICATION_INTEGRATION_SECTION_IDS.whatsappWeb}
      icon={<MessageCircle className="size-5" />}
      name="WhatsApp Web"
      description={translate(
        'communicationIntegrations.whatsappWeb.cardDescription',
        'Preferences for the compact fast-response view.'
      )}
      statusLabel={translate('communicationIntegrations.status.ready', 'Ready')}
      statusTone="neutral"
    >
      <IntegrationCardDetails>
        <SettingsSwitchRow
          label={translate(
            'communicationIntegrations.whatsappWeb.hideArchivedChats',
            'Hide archived chats from fast response'
          )}
          description={translate(
            'communicationIntegrations.whatsappWeb.hideArchivedChatsDescription',
            'Only affects the compact panel. Full WhatsApp Web remains unchanged.'
          )}
          checked={preference.hideArchivedChats}
          onChange={() =>
            setPreference('whatsapp-web', { hideArchivedChats: !preference.hideArchivedChats })
          }
        />
      </IntegrationCardDetails>
    </IntegrationCardShell>
  )
}

export function CommunicationIntegrationsSection(): React.JSX.Element {
  const { getStatus, loading, error } = useCommunicationIntegrationStatuses()
  const discordStatus = getStatus('discord')

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">
          {translate('communicationIntegrations.section.title', 'Communications')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {translate(
            'communicationIntegrations.section.description',
            'Manage communication apps, persistent web sessions, and provider-specific controls.'
          )}
        </p>
      </div>
      <div className="space-y-3">
        <WhatsAppWebCommunicationIntegrationCard />
        <DiscordCommunicationIntegrationCard
          status={discordStatus?.provider === 'discord' ? discordStatus : null}
          loading={loading}
          loadError={error}
        />
        <SlackCommunicationIntegrationCard />
      </div>
    </section>
  )
}
