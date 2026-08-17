import { useEffect, useId, useState } from 'react'
import type {
  DiscordCommunicationIntegrationStatus,
  SaveCommunicationIntegrationParams
} from '../../../../shared/communication-integrations'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import {
  CommunicationIntegrationDialogFrame,
  CommunicationIntegrationField,
  CommunicationIntegrationSecretField,
  getCommunicationSecretMutation,
  type CommunicationIntegrationPendingOperation
} from './CommunicationIntegrationDialogFields'

type ProviderDialogProps<TStatus extends { readiness: { configured: boolean } }> = {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: TStatus | null
  pending: CommunicationIntegrationPendingOperation
  error: string | null
  onSave: (params: SaveCommunicationIntegrationParams) => Promise<boolean>
  onClear: () => Promise<boolean>
}

export function DiscordCommunicationIntegrationDialog({
  open,
  onOpenChange,
  status,
  pending,
  error,
  onSave,
  onClear
}: ProviderDialogProps<DiscordCommunicationIntegrationStatus>): React.JSX.Element {
  const clientIdInputId = useId()
  const clientSecretInputId = useId()
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [clearClientSecret, setClearClientSecret] = useState(false)

  useEffect(() => {
    if (open) {
      setClientId(status?.clientId ?? '')
      setClientSecret('')
      setClearClientSecret(false)
    }
  }, [open, status?.clientId])

  const secretAvailable = status?.clientSecretStored || Boolean(clientSecret)

  return (
    <CommunicationIntegrationDialogFrame
      open={open}
      onOpenChange={onOpenChange}
      providerName="Discord"
      description={translate(
        'communicationIntegrations.discord.dialogDescription',
        'Use an application from the Discord Developer Portal. The RPC scope is requested when Orca connects.'
      )}
      configured={status?.readiness.configured ?? false}
      pending={pending}
      saveDisabled={!clientId.trim() || (!secretAvailable && !clearClientSecret)}
      error={error}
      onClear={onClear}
      onSave={() =>
        onSave({
          provider: 'discord',
          clientId: clientId.trim(),
          clientSecret: getCommunicationSecretMutation(clientSecret, clearClientSecret)
        })
      }
    >
      <CommunicationIntegrationField
        id={clientIdInputId}
        label={translate('communicationIntegrations.discord.applicationId', 'Application ID')}
        description={translate(
          'communicationIntegrations.discord.applicationIdDescription',
          'From General Information in the Discord Developer Portal.'
        )}
      >
        <Input
          id={clientIdInputId}
          value={clientId}
          disabled={pending !== null}
          onChange={(event) => setClientId(event.target.value)}
        />
      </CommunicationIntegrationField>
      <CommunicationIntegrationSecretField
        id={clientSecretInputId}
        label={translate('communicationIntegrations.discord.clientSecret', 'Client Secret')}
        description={translate(
          'communicationIntegrations.discord.clientSecretDescription',
          'From OAuth2 in the same Discord application.'
        )}
        stored={status?.clientSecretStored ?? false}
        value={clientSecret}
        cleared={clearClientSecret}
        disabled={pending !== null}
        onValueChange={setClientSecret}
        onClearedChange={setClearClientSecret}
      />
    </CommunicationIntegrationDialogFrame>
  )
}
