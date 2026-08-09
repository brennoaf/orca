import { useEffect, useId, useState } from 'react'
import type {
  DiscordCommunicationIntegrationStatus,
  SaveCommunicationIntegrationParams,
  SlackCommunicationIntegrationStatus
} from '../../../../shared/communication-integrations'
import { DEFAULT_SLACK_API_BASE_URL } from '../../../../shared/communication-integrations'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import {
  CommunicationIntegrationDialogFrame,
  CommunicationIntegrationEndpointFields,
  CommunicationIntegrationField,
  CommunicationIntegrationSecretField,
  getCommunicationEndpointAuthority,
  getCommunicationEndpointTrust,
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

export function SlackCommunicationIntegrationDialog({
  open,
  onOpenChange,
  status,
  pending,
  error,
  onSave,
  onClear
}: ProviderDialogProps<SlackCommunicationIntegrationStatus>): React.JSX.Element {
  const appTokenInputId = useId()
  const userTokenInputId = useId()
  const [appToken, setAppToken] = useState('')
  const [userToken, setUserToken] = useState('')
  const [clearAppToken, setClearAppToken] = useState(false)
  const [clearUserToken, setClearUserToken] = useState(false)
  const [baseUrl, setBaseUrl] = useState(DEFAULT_SLACK_API_BASE_URL)
  const [trusted, setTrusted] = useState(false)
  const authority = getCommunicationEndpointAuthority(baseUrl)
  const defaultAuthority = getCommunicationEndpointAuthority(DEFAULT_SLACK_API_BASE_URL)
  const endpointTrust = getCommunicationEndpointTrust(baseUrl, DEFAULT_SLACK_API_BASE_URL)

  useEffect(() => {
    if (open) {
      setAppToken('')
      setUserToken('')
      setClearAppToken(false)
      setClearUserToken(false)
      setBaseUrl(status?.endpoint.baseUrl ?? DEFAULT_SLACK_API_BASE_URL)
      setTrusted(false)
    }
  }, [open, status?.endpoint.baseUrl])

  useEffect(() => setTrusted(false), [authority])

  const customEndpoint = authority !== null && authority !== defaultAuthority
  const missingInitialSecrets =
    (!status?.appTokenStored && !appToken) || (!status?.userTokenStored && !userToken)

  return (
    <CommunicationIntegrationDialogFrame
      open={open}
      onOpenChange={onOpenChange}
      providerName="Slack"
      description={translate(
        'communicationIntegrations.slack.dialogDescription',
        'Store credentials for Slack Socket Mode. Fast-response transport is not active yet.'
      )}
      configured={status?.readiness.configured ?? false}
      pending={pending}
      saveDisabled={endpointTrust === null || (customEndpoint && !trusted) || missingInitialSecrets}
      error={error}
      onClear={onClear}
      onSave={() => {
        if (endpointTrust === null) {
          return Promise.reject(new Error('The API endpoint is invalid.'))
        }
        return onSave({
          provider: 'slack',
          baseUrl,
          endpointTrust,
          appToken: getCommunicationSecretMutation(appToken, clearAppToken),
          userToken: getCommunicationSecretMutation(userToken, clearUserToken)
        })
      }}
    >
      <CommunicationIntegrationSecretField
        id={appTokenInputId}
        label={translate('communicationIntegrations.slack.appToken', 'App Token')}
        description={translate(
          'communicationIntegrations.slack.appTokenDescription',
          'Use an app-level xapp token with Socket Mode enabled.'
        )}
        stored={status?.appTokenStored ?? false}
        value={appToken}
        cleared={clearAppToken}
        disabled={pending !== null}
        onValueChange={setAppToken}
        onClearedChange={setClearAppToken}
      />
      <CommunicationIntegrationSecretField
        id={userTokenInputId}
        label={translate('communicationIntegrations.slack.userToken', 'User OAuth Token')}
        description={translate(
          'communicationIntegrations.slack.userTokenDescription',
          'Use a user xoxp token. Bot tokens are not supported.'
        )}
        stored={status?.userTokenStored ?? false}
        value={userToken}
        cleared={clearUserToken}
        disabled={pending !== null}
        onValueChange={setUserToken}
        onClearedChange={setClearUserToken}
      />
      <CommunicationIntegrationEndpointFields
        baseUrl={baseUrl}
        defaultBaseUrl={DEFAULT_SLACK_API_BASE_URL}
        trusted={trusted}
        disabled={pending !== null}
        onBaseUrlChange={setBaseUrl}
        onTrustedChange={setTrusted}
      />
    </CommunicationIntegrationDialogFrame>
  )
}
