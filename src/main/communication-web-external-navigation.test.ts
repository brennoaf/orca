import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ openExternal: vi.fn(() => Promise.resolve()) }))

vi.mock('electron', () => ({ shell: { openExternal: mocks.openExternal } }))

import { configureCommunicationWebNavigation } from './communication-web-external-navigation'
import { isDiscordWebNavigationUrl } from './discord-web-fast-response/compact-host-view'
import { isSlackNavigationUrl } from './slack-fast-response/compact-host-view'
import { isWhatsAppUrl } from './whatsapp-fast-response/compact-host-identities'

const apps = [
  ['WhatsApp', isWhatsAppUrl],
  ['Slack', isSlackNavigationUrl],
  ['Discord', isDiscordWebNavigationUrl]
] as const

describe('communication web external navigation', () => {
  beforeEach(() => {
    mocks.openExternal.mockClear()
  })

  for (const [app, isInternalUrl] of apps) {
    it(`${app} keeps internal navigation and opens external HTTP links once`, async () => {
      const handlers = new Map<
        string,
        (event: { preventDefault: ReturnType<typeof vi.fn> }, url: string) => void
      >()
      const setWindowOpenHandler = vi.fn()
      const loadURL = vi.fn(() => Promise.resolve())
      const webContents = {
        setWindowOpenHandler,
        loadURL,
        on: vi.fn(
          (
            event: string,
            handler: (event: { preventDefault: ReturnType<typeof vi.fn> }, url: string) => void
          ) => {
            handlers.set(event, handler)
          }
        )
      }
      configureCommunicationWebNavigation(webContents as never, isInternalUrl)
      const internal =
        app === 'WhatsApp'
          ? 'https://web.whatsapp.com/'
          : app === 'Slack'
            ? 'https://app.slack.com/client'
            : 'https://discord.com/app'
      const internalEvent = { preventDefault: vi.fn() }
      handlers.get('will-navigate')?.(internalEvent, internal)
      expect(internalEvent.preventDefault).not.toHaveBeenCalled()
      expect(mocks.openExternal).not.toHaveBeenCalled()

      const externalEvent = { preventDefault: vi.fn() }
      handlers.get('will-redirect')?.(externalEvent, 'https://example.com/path')
      await Promise.resolve()
      expect(externalEvent.preventDefault).toHaveBeenCalledOnce()
      expect(mocks.openExternal).toHaveBeenCalledOnce()
      expect(mocks.openExternal).toHaveBeenCalledWith('https://example.com/path')

      const windowOpen = setWindowOpenHandler.mock.calls[0]?.[0]
      expect(windowOpen({ url: internal })).toEqual({ action: 'deny' })
      expect(loadURL).toHaveBeenCalledWith(internal)
      expect(windowOpen({ url: 'https://example.com/blank' })).toEqual({ action: 'deny' })
      await Promise.resolve()
      expect(mocks.openExternal).toHaveBeenCalledTimes(2)
    })
  }

  it('opens an evil suffix externally and denies malformed or dangerous navigation', () => {
    const handlers = new Map<
      string,
      (event: { preventDefault: ReturnType<typeof vi.fn> }, url: string) => void
    >()
    const setWindowOpenHandler = vi.fn()
    const loadURL = vi.fn(() => Promise.resolve())
    configureCommunicationWebNavigation(
      {
        setWindowOpenHandler,
        loadURL,
        on: vi.fn(
          (
            event: string,
            handler: (event: { preventDefault: ReturnType<typeof vi.fn> }, url: string) => void
          ) => {
            handlers.set(event, handler)
          }
        )
      } as never,
      isWhatsAppUrl
    )
    const evilSuffix = 'https://web.whatsapp.com.evil.test/'
    const evilEvent = { preventDefault: vi.fn() }
    handlers.get('will-navigate')?.(evilEvent, evilSuffix)
    expect(evilEvent.preventDefault).toHaveBeenCalledOnce()
    expect(setWindowOpenHandler.mock.calls[0]?.[0]({ url: evilSuffix })).toEqual({ action: 'deny' })
    expect(mocks.openExternal).toHaveBeenCalledTimes(2)

    mocks.openExternal.mockClear()
    for (const url of ['javascript:alert(1)', 'data:text/html,1', 'file:///tmp/test', 'invalid']) {
      const event = { preventDefault: vi.fn() }
      handlers.get('will-navigate')?.(event, url)
      expect(event.preventDefault).toHaveBeenCalledOnce()
      expect(setWindowOpenHandler.mock.calls[0]?.[0]({ url })).toEqual({ action: 'deny' })
    }
    expect(mocks.openExternal).not.toHaveBeenCalled()
  })

  it('installs each listener once', () => {
    const on = vi.fn()
    configureCommunicationWebNavigation(
      { setWindowOpenHandler: vi.fn(), loadURL: vi.fn(), on } as never,
      isWhatsAppUrl
    )
    expect(on.mock.calls.map(([event]) => event)).toEqual(['will-navigate', 'will-redirect'])
  })

  it('contains external-browser failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.openExternal.mockRejectedValueOnce(new Error('unavailable'))
    const setWindowOpenHandler = vi.fn()
    configureCommunicationWebNavigation(
      { setWindowOpenHandler, loadURL: vi.fn(), on: vi.fn() } as never,
      isWhatsAppUrl
    )
    expect(setWindowOpenHandler.mock.calls[0]?.[0]({ url: 'https://example.com/' })).toEqual({
      action: 'deny'
    })
    await Promise.resolve()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
