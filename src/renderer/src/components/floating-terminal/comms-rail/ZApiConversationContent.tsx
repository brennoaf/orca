import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, Send } from 'lucide-react'
import type {
  ZApiCommunicationIntegrationStatus,
  ZApiConversationSnapshot,
  ZApiMessageSnapshot
} from '../../../../../shared/communication-integrations'
import { Button } from '@/components/ui/button'
import { formatUiRelativeTime } from '@/i18n/relative-time-format'
import { translate } from '@/i18n/i18n'
import type { ZApiCommunicationManagerClient } from './communication-manager-runtime'
import { ZApiConversationAvatar } from './ZApiConversationAvatar'

const MESSAGE_PAGE_SIZE = 20
const MAX_MESSAGE_LIMIT = 100
const MESSAGE_POLL_INTERVAL_MS = 2_000

function deliveryLabel(status: ZApiMessageSnapshot['deliveryStatus']): string | null {
  if (status === 'received') {
    return null
  }
  const labels: Record<Exclude<ZApiMessageSnapshot['deliveryStatus'], 'received'>, string> = {
    pending: translate('communicationRail.zApi.deliveryPending', 'Pending'),
    sent: translate('communicationRail.zApi.deliverySent', 'Sent'),
    unknown: translate('communicationRail.zApi.deliveryUnknown', 'Delivery unknown'),
    failed: translate('communicationRail.zApi.deliveryFailed', 'Failed')
  }
  return labels[status]
}

function MessageBody({ message }: { message: ZApiMessageSnapshot }): React.JSX.Element {
  const delivery = deliveryLabel(message.deliveryStatus)
  return (
    <div
      className={
        message.direction === 'outbound'
          ? 'ml-8 rounded-md bg-secondary px-2.5 py-2 text-secondary-foreground'
          : 'mr-8 rounded-md border border-border bg-background px-2.5 py-2 text-foreground'
      }
    >
      {message.senderName && message.direction === 'inbound' ? (
        <div className="mb-1 truncate text-[11px] font-medium text-muted-foreground">
          {message.senderName}
        </div>
      ) : null}
      <p className="whitespace-pre-wrap break-words text-xs">
        {message.contentKind === 'text'
          ? message.text
          : translate('communicationRail.zApi.unsupportedMessage', 'Unsupported message{{type}}', {
              type: message.providerContentType ? ` · ${message.providerContentType}` : ''
            })}
      </p>
      <div className="mt-1 flex justify-end gap-1 text-[10px] text-muted-foreground">
        <span>{formatUiRelativeTime(message.occurredAt - Date.now())}</span>
        {delivery ? <span>· {delivery}</span> : null}
      </div>
    </div>
  )
}

export function ZApiConversationContent({
  active,
  conversation,
  client,
  onBack,
  onStatus
}: {
  active: boolean
  conversation: ZApiConversationSnapshot
  client: ZApiCommunicationManagerClient
  onBack: () => void
  onStatus: (status: ZApiCommunicationIntegrationStatus) => void
}): React.JSX.Element {
  const [messages, setMessages] = useState<readonly ZApiMessageSnapshot[]>([])
  const [messageLimit, setMessageLimit] = useState(MESSAGE_PAGE_SIZE)
  const [nextOffset, setNextOffset] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [refreshSequence, setRefreshSequence] = useState(0)
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const lastMessageIdRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active) {
      return
    }
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const refresh = async (): Promise<void> => {
      try {
        const page = await client.listMessages({
          conversationId: conversation.id,
          limit: messageLimit,
          offset: 0
        })
        if (!disposed) {
          setMessages(page.messages)
          setNextOffset(page.nextOffset)
          setError(null)
        }
      } catch {
        if (!disposed) {
          setError(
            translate(
              'communicationRail.zApi.messagesLoadFailed',
              'Could not load WhatsApp messages.'
            )
          )
        }
      } finally {
        if (!disposed) {
          setLoading(false)
          timer = setTimeout(() => void refresh(), MESSAGE_POLL_INTERVAL_MS)
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
  }, [active, client, conversation.id, messageLimit, refreshSequence])

  useLayoutEffect(() => {
    const lastMessageId = messages.at(-1)?.id ?? null
    if (lastMessageId !== lastMessageIdRef.current) {
      const list = messageListRef.current
      if (list) {
        list.scrollTop = list.scrollHeight
      }
      lastMessageIdRef.current = lastMessageId
    }
  }, [messages])

  const submit = async (): Promise<void> => {
    const text = draft.trim()
    if (!text || sending) {
      return
    }
    setSending(true)
    setSendError(null)
    try {
      const result = await client.sendReply({ conversationId: conversation.id, text })
      onStatus(result.status)
      if (result.ok) {
        setDraft((current) => (current.trim() === text ? '' : current))
      } else if (result.error.code === 'ambiguous_send') {
        setSendError(
          translate(
            'communicationRail.zApi.ambiguousSend',
            'This message may have been delivered. Check WhatsApp before sending it again.'
          )
        )
      } else {
        setSendError(result.error.message)
      }
    } catch {
      setSendError(
        translate('communicationRail.zApi.sendFailed', 'Could not send the WhatsApp message.')
      )
    } finally {
      setSending(false)
      setRefreshSequence((current) => current + 1)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1 border-b border-border/60 px-1 py-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={translate(
            'communicationRail.zApi.backToConversations',
            'Back to conversations'
          )}
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <ZApiConversationAvatar active={active} conversation={conversation} client={client} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {conversation.displayName ??
            translate('communicationRail.zApi.unnamedConversation', 'WhatsApp conversation')}
        </span>
      </div>
      <div
        ref={messageListRef}
        className="scrollbar-sleek max-h-52 space-y-2 overflow-y-auto px-2 py-2"
        aria-live="polite"
      >
        {loading && messages.length === 0 ? (
          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" />
            {translate('communicationRail.zApi.loadingMessages', 'Loading messages…')}
          </div>
        ) : null}
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {nextOffset !== null && messageLimit < MAX_MESSAGE_LIMIT ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="w-full"
            onClick={() =>
              setMessageLimit((current) => Math.min(current + MESSAGE_PAGE_SIZE, MAX_MESSAGE_LIMIT))
            }
          >
            {translate('communicationRail.zApi.loadOlder', 'Load older messages')}
          </Button>
        ) : null}
        {!loading && !error && messages.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground" role="status">
            {translate(
              'communicationRail.zApi.emptyMessages',
              'No messages stored for this conversation.'
            )}
          </p>
        ) : null}
        {messages.map((message) => (
          <MessageBody key={message.id} message={message} />
        ))}
      </div>
      <form
        className="space-y-2 border-t border-border/60 p-2"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label className="sr-only" htmlFor={`z-api-reply-${conversation.id}`}>
          {translate('communicationRail.zApi.replyLabel', 'Reply on WhatsApp')}
        </label>
        <textarea
          id={`z-api-reply-${conversation.id}`}
          rows={2}
          maxLength={4_096}
          value={draft}
          placeholder={translate('communicationRail.zApi.replyPlaceholder', 'Write a reply…')}
          className="w-full resize-none rounded-md border border-input bg-transparent px-2.5 py-2 text-xs shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30"
          disabled={sending}
          onChange={(event) => setDraft(event.target.value)}
        />
        {sendError ? (
          <p className="text-xs text-destructive" role="alert">
            {sendError}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={sending || draft.trim().length === 0}>
            <Send />
            {sending
              ? translate('communicationRail.zApi.sending', 'Sending…')
              : translate('communicationRail.zApi.send', 'Send')}
          </Button>
        </div>
      </form>
    </div>
  )
}
