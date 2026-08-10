import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'

export function ZApiWebhookTakeoverPreference({
  id,
  checked,
  disabled,
  onChange
}: {
  id: string
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
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
          id={id}
          checked={checked}
          disabled={disabled}
          onCheckedChange={(value) => onChange(value === true)}
        />
        <Label htmlFor={id} className="text-xs leading-5">
          {translate(
            'communicationIntegrations.zApi.takeoverConfirm',
            "I understand that Orca will take over this instance's webhooks."
          )}
        </Label>
      </div>
    </div>
  )
}
