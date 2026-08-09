import { useId } from 'react'
import { Copy, Loader2 } from 'lucide-react'
import type { ZApiPreparedIngressSnapshot } from '../../../../shared/communication-integrations'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import {
  CommunicationIntegrationField,
  type CommunicationIntegrationPendingOperation
} from './CommunicationIntegrationDialogFields'

type ZApiIngressFieldsProps = {
  preparedIngress: ZApiPreparedIngressSnapshot | null
  active: boolean
  busy: boolean
  pending: CommunicationIntegrationPendingOperation
  useCustomPort: boolean
  customPort: string
  customPortValid: boolean
  copied: boolean
  onUseCustomPortChange: (checked: boolean) => void
  onCustomPortChange: (value: string) => void
  onPrepare: () => void
  onCopy: () => void
  onChangePort: () => void
}

export function ZApiIngressFields(props: ZApiIngressFieldsProps): React.JSX.Element | null {
  const customPortToggleId = useId()
  const listenPortInputId = useId()
  const localTargetInputId = useId()

  if (!props.preparedIngress && !props.active) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2">
          <Checkbox
            id={customPortToggleId}
            checked={props.useCustomPort}
            disabled={props.busy}
            onCheckedChange={(checked) => props.onUseCustomPortChange(checked === true)}
          />
          <div className="space-y-1">
            <Label htmlFor={customPortToggleId} className="text-xs leading-5">
              {translate('communicationIntegrations.zApi.useCustomPort', 'Use a custom local port')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {translate(
                'communicationIntegrations.zApi.useCustomPortDescription',
                'Leave this off to let Orca choose an available port.'
              )}
            </p>
          </div>
        </div>
        {props.useCustomPort ? (
          <CommunicationIntegrationField
            id={listenPortInputId}
            label={translate('communicationIntegrations.zApi.localPort', 'Local port')}
            description={translate(
              'communicationIntegrations.zApi.localPortDescription',
              'Enter a port from 1 to 65535.'
            )}
          >
            <Input
              id={listenPortInputId}
              inputMode="numeric"
              value={props.customPort}
              disabled={props.busy}
              aria-invalid={props.customPort.length > 0 && !props.customPortValid}
              onChange={(event) => props.onCustomPortChange(event.target.value)}
            />
          </CommunicationIntegrationField>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={props.busy || (props.useCustomPort && !props.customPortValid)}
          onClick={props.onPrepare}
        >
          {props.pending === 'prepare' ? <Loader2 className="animate-spin" /> : null}
          {props.pending === 'prepare'
            ? translate('communicationIntegrations.zApi.preparingReceiver', 'Preparing…')
            : translate('communicationIntegrations.zApi.prepareReceiver', 'Prepare receiving')}
        </Button>
      </div>
    )
  }

  if (!props.preparedIngress) {
    return null
  }

  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/50 p-3">
      <div className="space-y-1">
        <Label htmlFor={localTargetInputId} className="text-xs font-medium">
          {translate('communicationIntegrations.zApi.localTunnelTarget', 'Local tunnel target')}
        </Label>
        <p className="text-xs text-muted-foreground">
          {translate(
            'communicationIntegrations.zApi.localTunnelTargetDescription',
            'Your public HTTPS tunnel or reverse proxy must forward requests, including their paths, to this local target. Enter its public URL below.'
          )}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={localTargetInputId}
          readOnly
          value={props.preparedIngress.localTunnelTarget}
          className="font-mono"
        />
        <Button type="button" variant="outline" disabled={props.busy} onClick={props.onCopy}>
          <Copy />
          {props.copied
            ? translate('communicationIntegrations.zApi.copied', 'Copied')
            : translate('communicationIntegrations.zApi.copy', 'Copy')}
        </Button>
        {!props.active ? (
          <Button
            type="button"
            variant="outline"
            disabled={props.busy}
            onClick={props.onChangePort}
          >
            {props.pending === 'discard' ? <Loader2 className="animate-spin" /> : null}
            {translate('communicationIntegrations.zApi.changePort', 'Change port')}
          </Button>
        ) : null}
      </div>
      {props.active ? (
        <p className="text-[11px] text-muted-foreground">
          {translate(
            'communicationIntegrations.zApi.activePortLocked',
            'The local target stays fixed while this integration is active. Remove the integration to change its port.'
          )}
        </p>
      ) : null}
    </div>
  )
}
