import { DISCORD_WEB_COMPACT_INTENT_EVENT } from '../shared/discord-web-fast-response-events'
import type {
  DiscordWebCompactAvailability,
  DiscordWebCompactIntent
} from '../shared/discord-web-fast-response'
import { parseDiscordWebCompactNavigation } from './discord-web-fast-response-subscriptions'

type NavigationDocument = Pick<Document, 'addEventListener' | 'removeEventListener'>

export function installDiscordWebCompactNavigation({
  document,
  onAvailability,
  send
}: {
  document: NavigationDocument
  onAvailability: (listener: (state: DiscordWebCompactAvailability) => void) => () => void
  send: (intent: DiscordWebCompactIntent) => void
}): () => void {
  let availability: DiscordWebCompactAvailability = { available: false, revision: 1 }
  const removeAvailability = onAvailability((next) => {
    availability = next
  })
  const listener = (event: Event): void => {
    const detail: unknown = 'detail' in event ? event.detail : undefined
    const intent = parseDiscordWebCompactNavigation(detail)
    if (availability.available && intent) {
      send({ revision: availability.revision, intent })
    }
  }
  document.addEventListener(DISCORD_WEB_COMPACT_INTENT_EVENT, listener)
  return () => {
    removeAvailability()
    document.removeEventListener(DISCORD_WEB_COMPACT_INTENT_EVENT, listener)
  }
}
