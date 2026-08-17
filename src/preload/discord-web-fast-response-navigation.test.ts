import { Window as HappyWindow } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { DISCORD_WEB_COMPACT_INTENT_EVENT } from '../shared/discord-web-fast-response-events'
import type { DiscordWebCompactAvailability } from '../shared/discord-web-fast-response'
import { installDiscordWebCompactNavigation } from './discord-web-fast-response-navigation'

describe('Discord Web compact navigation preload', () => {
  it('validates DOM intents before sending them to main', () => {
    const window = new HappyWindow()
    const send = vi.fn()
    const availabilityListeners: ((state: DiscordWebCompactAvailability) => void)[] = []
    const cleanup = installDiscordWebCompactNavigation({
      document: window.document as unknown as Document,
      onAvailability: (listener) => {
        availabilityListeners.push(listener)
        listener({ available: true, revision: 7 })
        return () => {
          availabilityListeners.splice(0)
        }
      },
      send
    })

    window.document.dispatchEvent(
      new window.CustomEvent(DISCORD_WEB_COMPACT_INTENT_EVENT, {
        detail: {
          kind: 'open-text-channel',
          serverId: '12345678901234567',
          serverName: 'EGB',
          channelId: '22345678901234567',
          channelName: 'roadmap'
        }
      })
    )
    window.document.dispatchEvent(
      new window.CustomEvent(DISCORD_WEB_COMPACT_INTENT_EVENT, {
        detail: { kind: 'select-manager-tab', tab: 'messages' }
      })
    )
    window.document.dispatchEvent(
      new window.CustomEvent(DISCORD_WEB_COMPACT_INTENT_EVENT, {
        detail: { kind: 'open-text-channel', channelId: 'invalid' }
      })
    )
    window.document.dispatchEvent(
      new window.CustomEvent(DISCORD_WEB_COMPACT_INTENT_EVENT, {
        detail: { kind: 'back', unexpected: true }
      })
    )

    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenNthCalledWith(1, {
      revision: 7,
      intent: {
        kind: 'open-text-channel',
        serverId: '12345678901234567',
        serverName: 'EGB',
        channelId: '22345678901234567',
        channelName: 'roadmap'
      }
    })
    expect(send).toHaveBeenNthCalledWith(2, {
      revision: 7,
      intent: { kind: 'select-manager-tab', tab: 'messages' }
    })
    availabilityListeners[0]?.({ available: false, revision: 8 })
    window.document.dispatchEvent(
      new window.CustomEvent(DISCORD_WEB_COMPACT_INTENT_EVENT, {
        detail: { kind: 'back' }
      })
    )
    expect(send).toHaveBeenCalledTimes(2)
    cleanup()
  })
})
