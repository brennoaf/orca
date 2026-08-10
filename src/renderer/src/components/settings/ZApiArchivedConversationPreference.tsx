import { useId } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'

export function ZApiArchivedConversationPreference({
  checked,
  disabled,
  onChange
}: {
  checked: boolean
  disabled: boolean
  onChange: (checked: boolean) => void
}): React.JSX.Element {
  const id = useId()
  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-muted/50 p-3">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs leading-5">
          {translate(
            'communicationIntegrations.zApi.hideArchivedConversations',
            'Hide archived conversations from fast responses'
          )}
        </Label>
        <p className="text-xs text-muted-foreground">
          {translate(
            'communicationIntegrations.zApi.hideArchivedConversationsDescription',
            'Archived chats remain available in WhatsApp Web and stored message history.'
          )}
        </p>
      </div>
    </div>
  )
}
