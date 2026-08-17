import { Window as HappyWindow } from 'happy-dom'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DiscordWebVoiceAvailability } from '../shared/discord-web-fast-response'
import { installDiscordWebVoiceSelection } from './discord-web-fast-response-selection'

function setup(available: boolean) {
  document.body.innerHTML = ''
  const send = vi.fn()
  let publish: ((state: DiscordWebVoiceAvailability) => void) | null = null
  const cleanup = installDiscordWebVoiceSelection({
    document,
    onAvailability: (listener) => {
      publish = listener
      listener({ available, revision: 7 })
      return () => {
        publish = null
      }
    },
    send
  })
  return {
    cleanup,
    document,
    send,
    publish: (state: DiscordWebVoiceAvailability) => publish?.(state)
  }
}

function link(document: Document, attributes: Record<string, string>): HTMLAnchorElement {
  const element = document.createElement('a')
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value)
  }
  document.body.append(element)
  return element
}

function trusted<T extends Event>(event: T): T {
  Object.defineProperty(event, 'isTrusted', { value: true })
  return event
}

describe('Discord Web voice selection preload', () => {
  beforeAll(() => {
    const testWindow = new HappyWindow()
    vi.stubGlobal('window', testWindow)
    vi.stubGlobal('document', testWindow.document)
    vi.stubGlobal('Element', testWindow.Element)
    vi.stubGlobal('MouseEvent', testWindow.MouseEvent)
    vi.stubGlobal('KeyboardEvent', testWindow.KeyboardEvent)
  })
  afterAll(() => vi.unstubAllGlobals())

  it.each([
    [
      'text channel',
      {
        role: 'link',
        href: '/channels/1/12345678901234567',
        'data-list-item-id': 'channels___12345678901234567'
      }
    ],
    ['malformed voice item', { role: 'button', 'data-list-item-id': 'channels___not-a-snowflake' }]
  ])('passes through a %s', (_label, attributes) => {
    const { cleanup, document, send } = setup(true)
    const event = trusted(new MouseEvent('click', { bubbles: true, cancelable: true }))

    expect(link(document, attributes).dispatchEvent(event)).toBe(true)
    expect(send).not.toHaveBeenCalled()
    cleanup()
  })

  it.each([
    ['click', 'click', ''],
    ['Enter', 'keydown', 'Enter'],
    ['Space', 'keydown', ' ']
  ])('intercepts an available voice item by %s', (_label, type, key) => {
    const { cleanup, document, send } = setup(true)
    const target = link(document, {
      role: 'button',
      'data-list-item-id': 'channels___12345678901234567'
    })
    const event = trusted(
      type === 'click'
        ? new MouseEvent(type, { bubbles: true, cancelable: true })
        : new KeyboardEvent(type, { key, bubbles: true, cancelable: true })
    )

    expect(target.dispatchEvent(event)).toBe(false)
    expect(send).toHaveBeenCalledWith({ revision: 7, channelId: '12345678901234567' })
    cleanup()
  })

  it('passes through when unavailable and stops intercepting after cleanup', () => {
    const { cleanup, document, send, publish } = setup(false)
    const target = link(document, {
      role: 'button',
      'data-list-item-id': 'channels___12345678901234567'
    })

    expect(
      target.dispatchEvent(trusted(new MouseEvent('click', { bubbles: true, cancelable: true })))
    ).toBe(true)
    publish({ available: true, revision: 8 })
    cleanup()
    cleanup()
    expect(
      target.dispatchEvent(trusted(new MouseEvent('click', { bubbles: true, cancelable: true })))
    ).toBe(true)
    expect(send).not.toHaveBeenCalled()
  })

  it('passes through synthetic events even while available', () => {
    const { cleanup, document, send } = setup(true)
    const target = link(document, {
      role: 'button',
      'data-list-item-id': 'channels___12345678901234567'
    })

    expect(target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).toBe(
      true
    )
    expect(send).not.toHaveBeenCalled()
    cleanup()
  })
})
