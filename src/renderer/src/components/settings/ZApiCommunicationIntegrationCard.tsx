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
import { canStartZApiListeningValidation } from './ZApiWebhookVerificationStep'

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
  if (
    canStartZApiListeningValidation(status) &&
    status?.readiness.verified &&
    status.readiness.receiveReady
  ) {
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
  const currentStatus = status
  const presentation = getPresentation(currentStatus, loading, loadError)
  const configured =
    Boolean(currentStatus?.readiness.configured) || Boolean(currentStatus?.publicWebhookBaseUrl)
  const statusError = currentStatus?.readiness.lastError?.message ?? loadError
  const technicalConfigurationReady = canStartZApiListeningValidation(currentStatus)
  const listeningValidation = currentStatus?.listeningValidation
  const listeningValidationStatus =
    listeningValidation?.state === 'confirmed'
      ? translate(
          'communicationIntegrations.zApi.listeningValidation.confirmedAt',
          'Confirmed at {{timestamp}}',
          { timestamp: new Date(listeningValidation.confirmedAt).toLocaleString() }
        )
      : listeningValidation?.state === 'awaiting'
        ? translate(
            'communicationIntegrations.zApi.listeningValidation.awaitingShort',
            'Awaiting confirmation'
          )
        : listeningValidation?.state === 'expired'
          ? translate('communicationIntegrations.zApi.listeningValidation.expiredShort', 'Expired')
          : translate(
              'communicationIntegrations.zApi.listeningValidation.notConfirmed',
              'Not confirmed'
            )
  const instanceStatus =
    currentStatus?.instanceConnected === true
      ? translate('communicationIntegrations.zApi.connected', 'Connected')
      : currentStatus?.instanceConnected === false
        ? translate('communicationIntegrations.zApi.disconnected', 'Disconnected')
        : translate('communicationIntegrations.zApi.unknown', 'Unknown')
  const smartphoneStatus =
    currentStatus?.smartphoneConnected === true
      ? translate('communicationIntegrations.zApi.connected', 'Connected')
      : currentStatus?.smartphoneConnected === false
        ? translate('communicationIntegrations.zApi.disconnected', 'Disconnected')
        : translate('communicationIntegrations.zApi.unknown', 'Unknown')
  const receiverStatus =
    currentStatus?.ingressPrepared && currentStatus.localTunnelTarget
      ? translate('communicationIntegrations.zApi.listeningOn', 'Listening on {{target}}', {
          target: currentStatus.localTunnelTarget
        })
      : translate('communicationIntegrations.zApi.notPrepared', 'Not prepared')
  const publicIngressStatus =
    currentStatus !== null && currentStatus.publicIngressVerified
      ? translate('communicationIntegrations.zApi.verified', 'Verified')
      : currentStatus?.publicWebhookBaseUrl
        ? translate('communicationIntegrations.zApi.notVerified', 'Not verified')
        : translate('communicationIntegrations.zApi.notConfigured', 'Not configured')
  const webhooksStatus = currentStatus?.webhooksConfigured
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
        {!statusError && technicalConfigurationReady && !currentStatus?.readiness.receiveReady ? (
          <p className="text-xs text-muted-foreground">
            {listeningValidation?.state === 'awaiting'
              ? translate(
                  'communicationIntegrations.zApi.listeningValidation.awaitingNotice',
                  'Send the WhatsApp validation code to confirm listening.'
                )
              : translate(
                  'communicationIntegrations.zApi.listeningValidation.requiredNotice',
                  'Validate WhatsApp listening to finish setup.'
                )}
          </p>
        ) : null}
        <ReadinessRow
          label={translate('communicationIntegrations.zApi.instanceReadiness', 'Instance')}
          value={instanceStatus}
          ready={currentStatus?.instanceConnected === true}
        />
        <ReadinessRow
          label={translate('communicationIntegrations.zApi.smartphoneReadiness', 'Smartphone')}
          value={smartphoneStatus}
          ready={currentStatus?.smartphoneConnected === true}
        />
        <ReadinessRow
          label={translate('communicationIntegrations.zApi.receiverReadiness', 'Local receiver')}
          value={receiverStatus}
          ready={currentStatus?.ingressPrepared === true}
        />
        <ReadinessRow
          label={translate(
            'communicationIntegrations.zApi.publicIngressReadiness',
            'Public ingress'
          )}
          value={publicIngressStatus}
          ready={currentStatus !== null && currentStatus.publicIngressVerified}
        />
        <ReadinessRow
          label={translate('communicationIntegrations.zApi.webhooksReadiness', 'Webhooks')}
          value={webhooksStatus}
          ready={currentStatus?.webhooksConfigured === true}
        />
        <ReadinessRow
          label={translate(
            'communicationIntegrations.zApi.listeningValidation.readiness',
            'WhatsApp listening'
          )}
          value={listeningValidationStatus}
          ready={
            listeningValidation?.state === 'confirmed' &&
            currentStatus?.readiness.receiveReady === true
          }
        />
      </IntegrationCardDetails>
      <ZApiCommunicationIntegrationDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        status={currentStatus}
        pending={actions.pending}
        error={actions.error ?? status?.readiness.lastError?.message ?? null}
        onPrepare={actions.prepare}
        onDiscardPrepared={actions.discardPrepared}
        onSaveAndConfigure={actions.saveAndConfigure}
        onStartListeningValidation={actions.startListeningValidation}
        onCancelListeningValidation={actions.cancelListeningValidation}
        onRemove={actions.remove}
      />
    </IntegrationCardShell>
  )
}
