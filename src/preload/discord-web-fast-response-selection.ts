import type { DiscordWebVoiceAvailability } from '../shared/discord-web-fast-response'

const CHANNEL_ID_PATTERN = /^channels___(\d{17,20})$/
const VOICE_SELECTOR = 'a[role="button"][data-list-item-id^="channels___"]:not([href])'

type SelectionDocument = Pick<Document, 'addEventListener' | 'removeEventListener' | 'defaultView'>

export function installDiscordWebVoiceSelection({
  document,
  onAvailability,
  send
}: {
  document: SelectionDocument
  onAvailability: (listener: (state: DiscordWebVoiceAvailability) => void) => () => void
  send: (selection: { revision: number; channelId: string }) => void
}): () => void {
  let availability: DiscordWebVoiceAvailability = { available: false, revision: 1 }
  const removeAvailability = onAvailability((next) => {
    availability = next
  })
  const intercept = (event: Event): void => {
    const ElementType = document.defaultView?.Element
    if (
      !event.isTrusted ||
      !availability.available ||
      !ElementType ||
      !(event.target instanceof ElementType)
    ) {
      return
    }
    const target = event.target.closest(VOICE_SELECTOR)
    const channelId = target?.getAttribute('data-list-item-id')?.match(CHANNEL_ID_PATTERN)?.[1]
    if (!channelId) {
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    send({ revision: availability.revision, channelId })
  }
  const onClick = (event: Event): void => intercept(event)
  const onKeyDown = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent
    if (keyboardEvent.repeat || (keyboardEvent.key !== 'Enter' && keyboardEvent.key !== ' ')) {
      return
    }
    intercept(event)
  }
  document.addEventListener('click', onClick, true)
  document.addEventListener('keydown', onKeyDown, true)
  return () => {
    removeAvailability()
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('keydown', onKeyDown, true)
  }
}
