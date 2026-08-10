import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type {
  ZApiCommunicationIntegrationStatus,
  ZApiConversationSnapshot
} from '../../../../../shared/communication-integrations'
import {
  FLOATING_COMMS_SESSION_DRAFT_MAX_LENGTH,
  type FloatingCommsSessionState,
  type FloatingCommsWhatsAppSessionState
} from '../../../../../shared/floating-comms-surface'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { formatUiRelativeTime } from '@/i18n/relative-time-format'
import { useOpenCommunicationSettings } from './communication-manager-actions'
import type { ZApiCommunicationManagerClient } from './communication-manager-runtime'
import { ZApiConversationAvatar } from './ZApiConversationAvatar'
import { ZApiConversationContent } from './ZApiConversationContent'

const CONVERSATION_PAGE_SIZE = 20
const CONVERSATION_POLL_INTERVAL_MS = 5_000

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

export function getZApiFastResponseStatusMessage(
  status: ZApiCommunicationIntegrationStatus | null
): string {
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

export function ZApiSetupContent({
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
        {error ?? getZApiFastResponseStatusMessage(status)}
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

export function ZApiCommunicationManagerContent({
  initialStatus,
  isPopoverOpen,
  client,
  initialSessionState,
  onSessionStateChange
}: {
  initialStatus: ZApiCommunicationIntegrationStatus | null
  isPopoverOpen: boolean
  client: ZApiCommunicationManagerClient
  initialSessionState: FloatingCommsWhatsAppSessionState
  onSessionStateChange?: (sessionState: FloatingCommsSessionState) => void
}): React.JSX.Element {
  const [status, setStatus] = useState(initialStatus)
  const [conversations, setConversations] = useState<readonly ZApiConversationSnapshot[]>([])
  const [selectedConversationId, setSelectedConversationId] = useState(
    initialSessionState.selectedConversationId
  )
  const [draft, setDraft] = useState(initialSessionState.draft)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshSequence, setRefreshSequence] = useState(0)
  const openSettings = useOpenCommunicationSettings()

  useEffect(() => {
    setSelectedConversationId(initialSessionState.selectedConversationId)
    setDraft(initialSessionState.draft)
  }, [initialSessionState])

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
          setError(null)
          return
        }
        const page = await client.listConversations({ limit: CONVERSATION_PAGE_SIZE, offset: 0 })
        if (!disposed) {
          setConversations(page.conversations)
          setError(
            page.archiveFilter.state === 'failed'
              ? translate(
                  'communicationRail.zApi.archiveStateLoadFailed',
                  'Archived chat status could not be refreshed. Showing current conversations.'
                )
              : null
          )
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

  useEffect(() => {
    onSessionStateChange?.({
      appId: 'whatsapp-web',
      selectedConversationId,
      draft: draft.slice(0, FLOATING_COMMS_SESSION_DRAFT_MAX_LENGTH)
    })
  }, [draft, onSessionStateChange, selectedConversationId])

  if (!isZApiFastResponseReady(status)) {
    return (
      <ZApiSetupContent
        status={status}
        loading={loading}
        error={error}
        onConfigure={() => openSettings('z-api')}
        onRetry={() => setRefreshSequence((current) => current + 1)}
      />
    )
  }
  const selected = conversations.find((conversation) => conversation.id === selectedConversationId)
  if (selected) {
    return (
      <ZApiConversationContent
        key={selected.id}
        active={isPopoverOpen}
        conversation={selected}
        client={client}
        draft={draft}
        onDraftChange={setDraft}
        onBack={() => setSelectedConversationId(null)}
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
      onSelect={(conversation) => setSelectedConversationId(conversation.id)}
      onRetry={() => setRefreshSequence((current) => current + 1)}
    />
  )
}
