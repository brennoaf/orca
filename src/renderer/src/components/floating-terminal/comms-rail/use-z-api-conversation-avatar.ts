import { useLayoutEffect, useState } from 'react'
import type { ZApiConversationAvatarSnapshot } from '../../../../../shared/communication-integrations'
import type { ZApiCommunicationManagerClient } from './communication-manager-runtime'
import { queueZApiConversationAvatarRequest } from './z-api-conversation-avatar-queue'

type AvatarUrl = {
  conversationId: number
  value: string
}

function createAvatarObjectUrl(
  snapshot: Extract<ZApiConversationAvatarSnapshot, { state: 'available' }>
): string {
  const binary = atob(snapshot.contentBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return URL.createObjectURL(new Blob([bytes], { type: snapshot.mimeType }))
}

export function useZApiConversationAvatar({
  active,
  conversationId,
  client
}: {
  active: boolean
  conversationId: number
  client: ZApiCommunicationManagerClient
}): {
  avatarUrl: string | null
  setTarget: (node: HTMLElement | null) => void
} {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<AvatarUrl | null>(null)

  useLayoutEffect(() => {
    let disposed = false
    let requested = false
    let ownedObjectUrl: string | null = null
    let observer: IntersectionObserver | null = null
    setAvatarUrl(null)

    const requestAvatar = (): void => {
      if (disposed || requested) {
        return
      }
      requested = true
      void queueZApiConversationAvatarRequest(() =>
        disposed ? Promise.resolve(null) : client.getConversationAvatar({ conversationId })
      )
        .then((snapshot) => {
          if (!snapshot || snapshot.state === 'unavailable') {
            return
          }
          const objectUrl = createAvatarObjectUrl(snapshot)
          if (disposed) {
            URL.revokeObjectURL(objectUrl)
            return
          }
          ownedObjectUrl = objectUrl
          setAvatarUrl({ conversationId, value: objectUrl })
        })
        .catch(() => undefined)
    }

    if (active && target) {
      if (typeof IntersectionObserver === 'undefined') {
        requestAvatar()
      } else {
        observer = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect()
            requestAvatar()
          }
        })
        observer.observe(target)
      }
    }

    return () => {
      disposed = true
      observer?.disconnect()
      if (ownedObjectUrl) {
        URL.revokeObjectURL(ownedObjectUrl)
      }
    }
  }, [active, client, conversationId, target])

  return {
    avatarUrl: active && avatarUrl?.conversationId === conversationId ? avatarUrl.value : null,
    setTarget
  }
}
