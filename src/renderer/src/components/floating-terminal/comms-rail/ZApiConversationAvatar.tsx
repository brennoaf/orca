import { Megaphone, MessageCircle, Radio, UserRound, UsersRound } from 'lucide-react'
import type { ZApiConversationSnapshot } from '../../../../../shared/communication-integrations'
import type { ZApiCommunicationManagerClient } from './communication-manager-runtime'
import { useZApiConversationAvatar } from './use-z-api-conversation-avatar'

function conversationInitials(displayName: string | null): string | null {
  const words = displayName?.trim().split(/\s+/).filter(Boolean) ?? []
  if (words.length === 0) {
    return null
  }
  const first = words[0]?.[0] ?? ''
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

function ConversationAvatarFallback({
  conversation
}: {
  conversation: ZApiConversationSnapshot
}): React.JSX.Element {
  if (conversation.conversationKind === 'private' || conversation.conversationKind === 'group') {
    const initials = conversationInitials(conversation.displayName)
    if (initials) {
      return <span className="text-[10px] font-medium">{initials}</span>
    }
    const Icon = conversation.conversationKind === 'private' ? UserRound : UsersRound
    return <Icon className="size-3.5" />
  }
  const Icon =
    conversation.conversationKind === 'newsletter'
      ? Radio
      : conversation.conversationKind === 'broadcast'
        ? Megaphone
        : MessageCircle
  return <Icon className="size-3.5" />
}

export function ZApiConversationAvatar({
  active,
  conversation,
  client
}: {
  active: boolean
  conversation: ZApiConversationSnapshot
  client: ZApiCommunicationManagerClient
}): React.JSX.Element {
  const avatarEligible =
    conversation.conversationKind === 'private' || conversation.conversationKind === 'group'
  const { avatarUrl, setTarget } = useZApiConversationAvatar({
    active: active && avatarEligible,
    conversationId: conversation.id,
    client
  })
  return (
    <span
      ref={setTarget}
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="size-7 rounded-full object-cover" />
      ) : (
        <ConversationAvatarFallback conversation={conversation} />
      )}
    </span>
  )
}
