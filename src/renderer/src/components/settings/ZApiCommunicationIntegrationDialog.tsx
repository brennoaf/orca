import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import type {
  SaveAndConfigureZApiParams,
  ZApiCommunicationIntegrationStatus,
  ZApiPreparedIngressSnapshot,
  ZApiSecretMutation
} from '../../../../shared/communication-integrations'
import { DEFAULT_Z_API_BASE_URL } from '../../../../shared/communication-integrations'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import {
  CommunicationIntegrationDialogFrame,
  CommunicationIntegrationEndpointFields,
  CommunicationIntegrationField,
  CommunicationIntegrationSecretField,
  getCommunicationEndpointAuthority,
  getCommunicationEndpointTrust,
  type CommunicationIntegrationPendingOperation
} from './CommunicationIntegrationDialogFields'
import { ZApiIngressFields } from './ZApiIngressFields'

type ZApiCommunicationIntegrationDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: ZApiCommunicationIntegrationStatus | null
  pending: CommunicationIntegrationPendingOperation
  error: string | null
  onPrepare: (listenPort: number) => Promise<ZApiPreparedIngressSnapshot | null>
  onDiscardPrepared: () => Promise<boolean>
  onSaveAndConfigure: (params: SaveAndConfigureZApiParams) => Promise<boolean>
  onRemove: () => Promise<boolean>
}

function secretMutation(value: string): ZApiSecretMutation {
  return value ? { action: 'replace', value } : { action: 'keep' }
}

function parseListenPort(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null
  }
  const port = Number(value)
  return Number.isSafeInteger(port) && port >= 1 && port <= 65_535 ? port : null
}

export function ZApiCommunicationIntegrationDialog({
  open,
  onOpenChange,
  status,
  pending,
  error,
  onPrepare,
  onDiscardPrepared,
  onSaveAndConfigure,
  onRemove
}: ZApiCommunicationIntegrationDialogProps): React.JSX.Element {
  const instanceIdInputId = useId()
  const instanceTokenInputId = useId()
  const clientTokenInputId = useId()
  const publicWebhookInputId = useId()
  const takeoverInputId = useId()
  const hydratedOpenRef = useRef(false)
  const [instanceId, setInstanceId] = useState('')
  const [instanceToken, setInstanceToken] = useState('')
  const [clientToken, setClientToken] = useState('')
  const [baseUrl, setBaseUrl] = useState(DEFAULT_Z_API_BASE_URL)
  const [trusted, setTrusted] = useState(false)
  const [publicWebhookBaseUrl, setPublicWebhookBaseUrl] = useState('')
  const [useCustomPort, setUseCustomPort] = useState(false)
  const [customPort, setCustomPort] = useState('')
  const [preparedIngress, setPreparedIngress] = useState<ZApiPreparedIngressSnapshot | null>(null)
  const [takeoverConfirmed, setTakeoverConfirmed] = useState(false)
  const [copied, setCopied] = useState(false)

  const authority = getCommunicationEndpointAuthority(baseUrl)
  const defaultAuthority = getCommunicationEndpointAuthority(DEFAULT_Z_API_BASE_URL)
  const endpointTrust = getCommunicationEndpointTrust(baseUrl, DEFAULT_Z_API_BASE_URL)
  const publicWebhookAuthority = getCommunicationEndpointAuthority(publicWebhookBaseUrl)
  const parsedCustomPort = parseListenPort(customPort)
  const active = status?.publicWebhookBaseUrl !== null && status?.publicWebhookBaseUrl !== undefined
  const removable =
    active ||
    Boolean(status?.readiness.configured) ||
    status?.lastErrorCode === 'webhook_restore_failed'
  const customEndpoint = authority !== null && authority !== defaultAuthority
  const secretsAvailable =
    (status?.instanceTokenStored || Boolean(instanceToken)) &&
    (status?.clientTokenStored || Boolean(clientToken))
  useEffect(() => {
    if (!open) {
      hydratedOpenRef.current = false
      return
    }
    if (!status || hydratedOpenRef.current) {
      return
    }
    setInstanceId(status.instanceId ?? '')
    setInstanceToken('')
    setClientToken('')
    setBaseUrl(status.endpoint.baseUrl)
    setTrusted(false)
    setPublicWebhookBaseUrl(status.publicWebhookBaseUrl ?? '')
    setUseCustomPort(false)
    setCustomPort('')
    setPreparedIngress(
      (status.ingressPrepared || status.publicWebhookBaseUrl !== null) &&
        status.listenPort !== null &&
        status.localTunnelTarget
        ? {
            listenPort: status.listenPort,
            localTunnelTarget: status.localTunnelTarget
          }
        : null
    )
    setTakeoverConfirmed(false)
    setCopied(false)
    hydratedOpenRef.current = true
  }, [open, status])

  useEffect(() => setTrusted(false), [authority])

  const prepare = async (): Promise<void> => {
    const requestedPort = useCustomPort ? parsedCustomPort : 0
    if (requestedPort === null) {
      return
    }
    const prepared = await onPrepare(requestedPort)
    if (prepared) {
      setPreparedIngress(prepared)
      setCopied(false)
    }
  }

  const changePort = async (): Promise<void> => {
    if (await onDiscardPrepared()) {
      setPreparedIngress(null)
      setUseCustomPort(false)
      setCustomPort('')
      setCopied(false)
    }
  }

  const copyTarget = async (): Promise<void> => {
    if (!preparedIngress) {
      return
    }
    try {
      await window.api.ui.writeClipboardText(preparedIngress.localTunnelTarget)
      setCopied(true)
    } catch {
      setCopied(false)
      toast.error(
        translate(
          'communicationIntegrations.zApi.copyFailed',
          'Could not copy the local tunnel target.'
        )
      )
    }
  }

  const saveAndConfigure = (): Promise<boolean> => {
    if (endpointTrust === null || preparedIngress === null) {
      return Promise.resolve(false)
    }
    return onSaveAndConfigure({
      instanceId: instanceId.trim(),
      instanceToken: secretMutation(instanceToken),
      clientToken: secretMutation(clientToken),
      apiBaseUrl: baseUrl,
      endpointTrust,
      publicWebhookBaseUrl: publicWebhookBaseUrl.trim(),
      listenPort: preparedIngress.listenPort
    })
  }

  const busy = pending !== null
  const saveDisabled =
    !instanceId.trim() ||
    !secretsAvailable ||
    endpointTrust === null ||
    (customEndpoint && !trusted) ||
    publicWebhookAuthority === null ||
    preparedIngress === null ||
    !takeoverConfirmed

  return (
    <CommunicationIntegrationDialogFrame
      open={open}
      onOpenChange={onOpenChange}
      providerName="Z-API"
      description={translate(
        'communicationIntegrations.zApi.dialogDescription',
        "Prepare Orca's local receiver and configure Z-API webhooks for WhatsApp fast responses."
      )}
      configured={removable}
      pending={pending}
      saveDisabled={saveDisabled}
      error={error}
      saveLabel={translate('communicationIntegrations.zApi.saveAndConfigure', 'Save and configure')}
      savingLabel={translate(
        'communicationIntegrations.zApi.savingAndConfiguring',
        'Saving and configuring…'
      )}
      clearConfirmation={{
        title: translate('communicationIntegrations.zApi.removeTitle', 'Remove Z-API integration?'),
        description: translate(
          'communicationIntegrations.zApi.removeDescription',
          'Orca will stop the local receiver and restore the webhook configuration captured before setup.'
        ),
        confirmLabel: translate(
          'communicationIntegrations.zApi.removeConfirm',
          'Remove integration'
        ),
        buttonLabel: translate('communicationIntegrations.zApi.removeAction', 'Remove integration')
      }}
      onClear={onRemove}
      onSave={saveAndConfigure}
    >
      <CommunicationIntegrationField
        id={instanceIdInputId}
        label={translate('communicationIntegrations.zApi.instanceId', 'Instance ID')}
        description={translate(
          'communicationIntegrations.zApi.instanceIdDescription',
          'The identifier shown for your Z-API instance.'
        )}
      >
        <Input
          id={instanceIdInputId}
          value={instanceId}
          disabled={busy}
          onChange={(event) => setInstanceId(event.target.value)}
        />
      </CommunicationIntegrationField>
      <CommunicationIntegrationSecretField
        id={instanceTokenInputId}
        label={translate('communicationIntegrations.zApi.instanceToken', 'Instance Token')}
        description={translate(
          'communicationIntegrations.zApi.instanceTokenDescription',
          'The token assigned to the Z-API instance.'
        )}
        stored={status?.instanceTokenStored ?? false}
        value={instanceToken}
        cleared={false}
        disabled={busy}
        allowClear={false}
        onValueChange={setInstanceToken}
        onClearedChange={() => undefined}
      />
      <CommunicationIntegrationSecretField
        id={clientTokenInputId}
        label={translate('communicationIntegrations.zApi.clientToken', 'Client Token')}
        description={translate(
          'communicationIntegrations.zApi.clientTokenDescription',
          'The client security token configured for the instance.'
        )}
        stored={status?.clientTokenStored ?? false}
        value={clientToken}
        cleared={false}
        disabled={busy}
        allowClear={false}
        onValueChange={setClientToken}
        onClearedChange={() => undefined}
      />
      <CommunicationIntegrationEndpointFields
        baseUrl={baseUrl}
        defaultBaseUrl={DEFAULT_Z_API_BASE_URL}
        trusted={trusted}
        disabled={busy}
        onBaseUrlChange={setBaseUrl}
        onTrustedChange={setTrusted}
      />
      <ZApiIngressFields
        preparedIngress={preparedIngress}
        active={active}
        busy={busy}
        pending={pending}
        useCustomPort={useCustomPort}
        customPort={customPort}
        customPortValid={parsedCustomPort !== null}
        copied={copied}
        onUseCustomPortChange={setUseCustomPort}
        onCustomPortChange={setCustomPort}
        onPrepare={() => void prepare()}
        onCopy={() => void copyTarget()}
        onChangePort={() => void changePort()}
      />
      <CommunicationIntegrationField
        id={publicWebhookInputId}
        label={translate(
          'communicationIntegrations.zApi.publicWebhookBaseUrl',
          'Public HTTPS tunnel or reverse proxy URL'
        )}
        description={translate(
          'communicationIntegrations.zApi.publicWebhookBaseUrlDescription',
          'The public HTTPS base URL that forwards to the local target. Orca adds a private callback path.'
        )}
      >
        <Input
          id={publicWebhookInputId}
          type="url"
          value={publicWebhookBaseUrl}
          disabled={busy}
          aria-invalid={publicWebhookBaseUrl.length > 0 && publicWebhookAuthority === null}
          onChange={(event) => setPublicWebhookBaseUrl(event.target.value)}
        />
      </CommunicationIntegrationField>
      <div className="space-y-2 rounded-md border border-border bg-muted/50 p-3">
        <div className="space-y-1">
          <p className="text-xs font-medium">
            {translate('communicationIntegrations.zApi.takeoverTitle', 'Webhook takeover')}
          </p>
          <p className="text-xs text-muted-foreground">
            {translate(
              'communicationIntegrations.zApi.takeoverDescription',
              'Saving replaces every webhook URL for this instance and clears all receive filters. Orca restores the captured webhook configuration when you remove the integration.'
            )}
          </p>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            id={takeoverInputId}
            checked={takeoverConfirmed}
            disabled={busy}
            onCheckedChange={(checked) => setTakeoverConfirmed(checked === true)}
          />
          <Label htmlFor={takeoverInputId} className="text-xs leading-5">
            {translate(
              'communicationIntegrations.zApi.takeoverConfirm',
              "I understand that Orca will take over this instance's webhooks."
            )}
          </Label>
        </div>
      </div>
    </CommunicationIntegrationDialogFrame>
  )
}
