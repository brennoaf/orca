import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import type { ZApiCommunicationIntegrationStatus } from '../../../../shared/communication-integrations'
import { COMMUNICATION_INTEGRATION_SECTION_IDS } from '../../../../shared/communication-integrations'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { CommunicationIntegrationPendingOperation } from './CommunicationIntegrationDialogFields'
import {
  IntegrationCardDetails,
  IntegrationCardShell,
  type IntegrationCardStatusTone
} from './integration-card-shell'
import { useZApiTransactionActions } from './use-z-api-transaction-actions'
import { ZApiCommunicationIntegrationDialog } from './ZApiCommunicationIntegrationDialog'

type ZApiCardPresentation = {
  label: string
  tone: IntegrationCardStatusTone
  checking: boolean
}

function getPresentation(
  status: ZApiCommunicationIntegrationStatus | null,
  loading: boolean,
  loadError: string | null
): ZApiCardPresentation {
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
  if (status?.readiness.sendReady && status.readiness.receiveReady) {
    return {
      label: translate('communicationIntegrations.status.ready', 'Ready'),
      tone: 'connected',
      checking: false
    }
  }
  if (status?.readiness.configured) {
    return {
      label: translate('communicationIntegrations.status.needsAttention', 'Needs attention'),
      tone: 'attention',
      checking: false
    }
  }
  return {
    label: translate('communicationIntegrations.status.notConfigured', 'Not configured'),
    tone: 'neutral',
    checking: false
  }
}

function ConfigureAction(props: {
  configured: boolean
  pending: CommunicationIntegrationPendingOperation
  loading: boolean
  onConfigure: () => void
}): React.JSX.Element {
  return (
    <Button
      type="button"
      variant={props.configured ? 'outline' : 'default'}
      size="sm"
      disabled={props.loading || props.pending !== null}
      onClick={props.onConfigure}
    >
      {props.configured
        ? translate('communicationIntegrations.action.edit', 'Edit')
        : translate('communicationIntegrations.action.configure', 'Configure')}
    </Button>
  )
}

function ReadinessRow(props: { label: string; value: string; ready: boolean }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-muted-foreground">{props.label}</span>
      <span className={props.ready ? 'text-status-success' : 'text-muted-foreground'}>
        {props.value}
      </span>
    </div>
  )
}

export function ZApiCommunicationIntegrationCard(props: {
  status: ZApiCommunicationIntegrationStatus | null
  loading: boolean
  loadError: string | null
}): React.JSX.Element {
  const { status, loading, loadError } = props
  const [dialogOpen, setDialogOpen] = useState(false)
  const actions = useZApiTransactionActions()
  const presentation = getPresentation(status, loading, loadError)
  const configured = Boolean(status?.readiness.configured) || Boolean(status?.publicWebhookBaseUrl)
  const statusError = status?.readiness.lastError?.message ?? loadError
  const instanceStatus =
    status?.instanceConnected === true
      ? translate('communicationIntegrations.zApi.connected', 'Connected')
      : status?.instanceConnected === false
        ? translate('communicationIntegrations.zApi.disconnected', 'Disconnected')
        : translate('communicationIntegrations.zApi.unknown', 'Unknown')
  const smartphoneStatus =
    status?.smartphoneConnected === true
      ? translate('communicationIntegrations.zApi.connected', 'Connected')
      : status?.smartphoneConnected === false
        ? translate('communicationIntegrations.zApi.disconnected', 'Disconnected')
        : translate('communicationIntegrations.zApi.unknown', 'Unknown')
  const receiverStatus =
    status?.ingressPrepared && status.localTunnelTarget
      ? translate('communicationIntegrations.zApi.listeningOn', 'Listening on {{target}}', {
          target: status.localTunnelTarget
        })
      : translate('communicationIntegrations.zApi.notPrepared', 'Not prepared')
  const publicIngressStatus =
    status !== null && status.publicIngressVerified
      ? translate('communicationIntegrations.zApi.verified', 'Verified')
      : status?.publicWebhookBaseUrl
        ? translate('communicationIntegrations.zApi.notVerified', 'Not verified')
        : translate('communicationIntegrations.zApi.notConfigured', 'Not configured')
  const webhooksStatus = status?.webhooksConfigured
    ? translate('communicationIntegrations.zApi.configured', 'Configured')
    : translate('communicationIntegrations.zApi.notConfigured', 'Not configured')

  return (
    <IntegrationCardShell
      settingsSectionId={COMMUNICATION_INTEGRATION_SECTION_IDS['z-api']}
      icon={<MessageCircle className="size-5" />}
      name="Z-API"
      description={translate(
        'communicationIntegrations.zApi.cardDescription',
        'Transactional Z-API receiver and WhatsApp fast responses.'
      )}
      checking={presentation.checking}
      statusLabel={presentation.label}
      statusTone={presentation.tone}
      actions={
        <ConfigureAction
          configured={configured}
          pending={actions.pending}
          loading={loading}
          onConfigure={() => setDialogOpen(true)}
        />
      }
    >
      <IntegrationCardDetails>
        {statusError ? (
          <p role="alert" className="text-xs text-destructive">
            {statusError}
          </p>
        ) : null}
        <ReadinessRow
          label={translate('communicationIntegrations.zApi.instanceReadiness', 'Instance')}
          value={instanceStatus}
          ready={status?.instanceConnected === true}
        />
        <ReadinessRow
          label={translate('communicationIntegrations.zApi.smartphoneReadiness', 'Smartphone')}
          value={smartphoneStatus}
          ready={status?.smartphoneConnected === true}
        />
        <ReadinessRow
          label={translate('communicationIntegrations.zApi.receiverReadiness', 'Local receiver')}
          value={receiverStatus}
          ready={status?.ingressPrepared === true}
        />
        <ReadinessRow
          label={translate(
            'communicationIntegrations.zApi.publicIngressReadiness',
            'Public ingress'
          )}
          value={publicIngressStatus}
          ready={status !== null && status.publicIngressVerified}
        />
        <ReadinessRow
          label={translate('communicationIntegrations.zApi.webhooksReadiness', 'Webhooks')}
          value={webhooksStatus}
          ready={status?.webhooksConfigured === true}
        />
      </IntegrationCardDetails>
      <ZApiCommunicationIntegrationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        status={status}
        pending={actions.pending}
        error={actions.error ?? status?.readiness.lastError?.message ?? null}
        onPrepare={actions.prepare}
        onDiscardPrepared={actions.discardPrepared}
        onSaveAndConfigure={actions.saveAndConfigure}
        onRemove={actions.remove}
      />
    </IntegrationCardShell>
  )
}
