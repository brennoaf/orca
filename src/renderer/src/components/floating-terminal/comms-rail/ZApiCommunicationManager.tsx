import { useEffect, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import type {
  ZApiCommunicationIntegrationStatus,
  ZApiConversationSnapshot
} from '../../../../../shared/communication-integrations'
import { Button } from '@/components/ui/button'
import { formatUiRelativeTime } from '@/i18n/relative-time-format'
import { translate } from '@/i18n/i18n'
import { useOpenCommunicationSettings } from './communication-manager-actions'
import {
  LOCAL_Z_API_COMMUNICATION_MANAGER_CLIENT,
  useCommunicationManagerRuntime,
  useCommunicationManagerStatuses,
  type ZApiCommunicationManagerClient
} from './communication-manager-runtime'
import type { CommunicationManagerPresentation } from './communication-managers'
import { ZApiConversationAvatar } from './ZApiConversationAvatar'
import { ZApiConversationContent } from './ZApiConversationContent'

const CONVERSATION_PAGE_SIZE = 20
const CONVERSATION_POLL_INTERVAL_MS = 5_000

type PresentationProps = {
  isPopoverOpen: boolean
  children: (presentation: CommunicationManagerPresentation) => ReactNode
}

export function isZApiFastResponseReady(
  status: ZApiCommunicationIntegrationStatus | null
): status is ZApiCommunicationIntegrationStatus {
  return Boolean(
    status?.readiness.configured &&
    status.readiness.verified &&
    status.readiness.sendReady &&
    status.readiness.receiveReady &&
    status.instanceConnected === true &&
    status.smartphoneConnected === true &&
    status.ingressPrepared &&
    status.webhooksConfigured
  )
}

function statusMessage(status: ZApiCommunicationIntegrationStatus | null): string {
  if (!status) {
    return translate('communicationRail.zApi.statusLoading', 'Checking Z-API availability…')
  }
  if (status.readiness.lastError) {
    return status.readiness.lastError.message
  }
  if (!status.readiness.configured) {
    return translate(
      'communicationRail.zApi.notConfigured',
      'Configure Z-API credentials and webhook delivery in Integrations.'
    )
  }
  if (!status.readiness.verified) {
    return translate(
      'communicationRail.zApi.notVerified',
      'Verify the saved Z-API credentials in Integrations.'
    )
  }
  if (status.instanceConnected !== true || status.smartphoneConnected !== true) {
    return translate(
      'communicationRail.zApi.notConnected',
      'The Z-API instance and smartphone must both be connected.'
    )
  }
  if (!status.ingressPrepared || !status.webhooksConfigured || !status.readiness.receiveReady) {
    return translate(
      'communicationRail.zApi.webhooksNotReady',
      'Complete the public webhook configuration in Integrations.'
    )
  }
  return translate('communicationRail.zApi.sendNotReady', 'Z-API is not ready to send messages.')
}

function SetupContent({
  status,
  loading,
  error,
  onConfigure,
  onRetry
}: {
  status: ZApiCommunicationIntegrationStatus | null
  loading: boolean
  error: string | null
  onConfigure: () => void
  onRetry: () => void
}): React.JSX.Element {
  if (loading && !status) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground"
        role="status"
      >
        <Loader2 className="size-4 animate-spin" />
        {translate('communicationRail.zApi.loading', 'Loading WhatsApp fast responses…')}
      </div>
    )
  }
  return (
    <div className="space-y-3 px-3 py-3">
      <p
        className={error ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}
        role={error ? 'alert' : 'status'}
      >
        {error ?? statusMessage(status)}
      </p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onConfigure}>
          {translate('communicationRail.zApi.configure', 'Configure Z-API')}
        </Button>
        {error ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
            {translate('communicationRail.zApi.retry', 'Retry')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function ConversationList({
  active,
  client,
  conversations,
  loading,
  error,
  onSelect,
  onRetry
}: {
  active: boolean
  client: ZApiCommunicationManagerClient
  conversations: readonly ZApiConversationSnapshot[]
  loading: boolean
  error: string | null
  onSelect: (conversation: ZApiConversationSnapshot) => void
  onRetry: () => void
}): React.JSX.Element {
  if (loading && conversations.length === 0) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground"
        role="status"
      >
        <Loader2 className="size-4 animate-spin" />
        {translate('communicationRail.zApi.loadingConversations', 'Loading recent conversations…')}
      </div>
    )
  }
  if (error && conversations.length === 0) {
    return (
      <div className="space-y-3 px-3 py-3">
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          {translate('communicationRail.zApi.retry', 'Retry')}
        </Button>
      </div>
    )
  }
  if (conversations.length === 0) {
    return (
      <p className="px-3 py-3 text-xs text-muted-foreground" role="status">
        {translate(
          'communicationRail.zApi.emptyConversations',
          'No recent conversations. New WhatsApp messages will appear here.'
        )}
      </p>
    )
  }
  return (
    <nav
      className="scrollbar-sleek max-h-64 overflow-y-auto p-1"
      aria-label={translate(
        'communicationRail.zApi.recentConversations',
        'Recent WhatsApp conversations'
      )}
    >
      {error ? (
        <p className="px-2 py-1.5 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {conversations.map((conversation) => (
        <button
          key={conversation.id}
          type="button"
          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={() => onSelect(conversation)}
        >
          <ZApiConversationAvatar active={active} conversation={conversation} client={client} />
          <span className="min-w-0 flex-1 truncate text-sm">
            {conversation.displayName ??
              translate('communicationRail.zApi.unnamedConversation', 'WhatsApp conversation')}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatUiRelativeTime(conversation.lastMessageAt - Date.now())}
          </span>
        </button>
      ))}
    </nav>
  )
}

function ZApiContent({
  initialStatus,
  isPopoverOpen,
  client
}: {
  initialStatus: ZApiCommunicationIntegrationStatus | null
  isPopoverOpen: boolean
  client: ZApiCommunicationManagerClient
}): React.JSX.Element {
  const [status, setStatus] = useState(initialStatus)
  const [conversations, setConversations] = useState<readonly ZApiConversationSnapshot[]>([])
  const [selected, setSelected] = useState<ZApiConversationSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshSequence, setRefreshSequence] = useState(0)
  const openSettings = useOpenCommunicationSettings()

  useEffect(() => {
    if (!isPopoverOpen) {
      return
    }
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const refresh = async (): Promise<void> => {
      try {
        const nextStatus = await client.getStatus()
        if (disposed) {
          return
        }
        setStatus(nextStatus)
        if (!isZApiFastResponseReady(nextStatus)) {
          setConversations([])
          setSelected(null)
          setError(null)
          return
        }
        const page = await client.listConversations({ limit: CONVERSATION_PAGE_SIZE, offset: 0 })
        if (!disposed) {
          setConversations(page.conversations)
          setSelected((current) => {
            if (!current) {
              return null
            }
            return page.conversations.find((conversation) => conversation.id === current.id) ?? null
          })
          setError(null)
        }
      } catch {
        if (!disposed) {
          setError(
            translate(
              'communicationRail.zApi.conversationsLoadFailed',
              'Could not load WhatsApp fast responses.'
            )
          )
        }
      } finally {
        if (!disposed) {
          setLoading(false)
          timer = setTimeout(() => void refresh(), CONVERSATION_POLL_INTERVAL_MS)
        }
      }
    }
    void refresh()
    return () => {
      disposed = true
      if (timer) {
        clearTimeout(timer)
      }
    }
  }, [client, isPopoverOpen, refreshSequence])

  if (!isZApiFastResponseReady(status)) {
    return (
      <SetupContent
        status={status}
        loading={loading}
        error={error}
        onConfigure={() => openSettings('z-api')}
        onRetry={() => setRefreshSequence((current) => current + 1)}
      />
    )
  }
  if (selected) {
    return (
      <ZApiConversationContent
        key={selected.id}
        active={isPopoverOpen}
        conversation={selected}
        client={client}
        onBack={() => setSelected(null)}
        onStatus={setStatus}
      />
    )
  }
  return (
    <ConversationList
      active={isPopoverOpen}
      client={client}
      conversations={conversations}
      loading={loading}
      error={error}
      onSelect={setSelected}
      onRetry={() => setRefreshSequence((current) => current + 1)}
    />
  )
}

export function ZApiCommunicationManagerPresentation({
  isPopoverOpen,
  children
}: PresentationProps): React.JSX.Element {
  const runtime = useCommunicationManagerRuntime()
  const { getStatus, loading, error, refresh } = useCommunicationManagerStatuses(
    runtime,
    isPopoverOpen
  )
  const integrationStatus = getStatus('z-api')
  const status = integrationStatus?.provider === 'z-api' ? integrationStatus : null
  const ready = isZApiFastResponseReady(status)
  const reason = statusMessage(status)
  const openSettings = useOpenCommunicationSettings()
  const client = runtime?.zApi ?? LOCAL_Z_API_COMMUNICATION_MANAGER_CLIENT
  if (loading && !status) {
    return (
      <>
        {children({
          status: { kind: 'loading' },
          tooltip: translate('communicationRail.zApi.tooltipLoading', 'WhatsApp — loading'),
          content: (
            <SetupContent
              status={null}
              loading
              error={null}
              onConfigure={() => openSettings('z-api')}
              onRetry={refresh}
            />
          )
        })}
      </>
    )
  }
  if (error) {
    return (
      <>
        {children({
          status: { kind: 'unavailable', reason: error },
          tooltip: translate('communicationRail.zApi.tooltipUnavailable', 'WhatsApp — unavailable'),
          content: (
            <SetupContent
              status={null}
              loading={false}
              error={error}
              onConfigure={() => openSettings('z-api')}
              onRetry={refresh}
            />
          )
        })}
      </>
    )
  }
  return (
    <>
      {children({
        status: ready ? { kind: 'idle' } : { kind: 'unavailable', reason },
        tooltip: ready
          ? translate('communicationRail.zApi.tooltipReady', 'WhatsApp — fast responses ready')
          : translate('communicationRail.zApi.tooltipUnavailable', 'WhatsApp — setup required'),
        content: (
          <ZApiContent initialStatus={status} isPopoverOpen={isPopoverOpen} client={client} />
        )
      })}
    </>
  )
}
