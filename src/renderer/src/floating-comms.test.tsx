// @vitest-environment happy-dom

import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiscordVoiceSnapshot } from '../../shared/discord-voice'
import type { FloatingCommsSurfaceState } from '../../shared/floating-comms-surface'

function discordSnapshot(): DiscordVoiceSnapshot {
  return {
    connection: 'connected',
    channelId: null,
    channelName: null,
    selfUserId: null,
    participants: [],
    credentialsConfigured: true,
    lastError: null
  }
}

function surfaceState(requestId: number, visible: boolean): FloatingCommsSurfaceState {
  return {
    appId: 'discord',
    requestId,
    discord: discordSnapshot(),
    overlayOpen: false,
    visible
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise: ((value: T) => void) | null = null
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  if (!resolvePromise) {
    throw new Error('Deferred promise resolver was not initialized')
  }
  return { promise, resolve: resolvePromise }
}

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  getIntegrationStatuses: vi.fn(() => new Promise<never>(() => undefined)),
  measure: vi.fn(() => Promise.resolve()),
  action: vi.fn(() => Promise.resolve()),
  discordCommand: vi.fn(),
  offStateChanged: vi.fn(),
  offVisibilityChanged: vi.fn(),
  resizeCallback: null as (() => void) | null,
  stateChanged: null as ((identity: { appId: 'discord'; requestId: number }) => void) | null,
  visibilityChanged: null as
    | ((visibility: { appId: 'discord'; requestId: number; visible: boolean }) => void)
    | null,
  runtime: null as {
    commandDiscord: (method: string, params?: unknown) => Promise<unknown>
    loadIntegrationStatuses: () => Promise<unknown>
    setOverlayOpen: (open: boolean) => void
  } | null,
  offSettingsChanged: vi.fn()
}))

vi.mock('./components/floating-terminal/comms-rail/communication-managers', () => ({
  LOCAL_Z_API_COMMUNICATION_MANAGER_CLIENT: {},
  COMMUNICATION_MANAGER_REGISTRY: {
    discord: {
      Presentation: ({
        isPopoverOpen,
        children
      }: {
        isPopoverOpen: boolean
        children: (presentation: {
          status: { kind: 'idle' }
          tooltip: string
          content: React.ReactNode
        }) => React.ReactNode
      }) =>
        children({
          status: { kind: 'idle' },
          tooltip: 'Discord',
          content: (
            <div data-testid="manager-content" data-visible={isPopoverOpen}>
              Manager content
            </div>
          )
        })
    }
  },
  CommunicationManagerRuntimeProvider: ({
    children,
    runtime
  }: {
    children: React.ReactNode
    runtime: NonNullable<typeof mocks.runtime>
  }) => {
    mocks.runtime = runtime
    void runtime.loadIntegrationStatuses()
    return children
  }
}))

vi.mock('./components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children
}))

vi.mock('./i18n/I18nProvider', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => children
}))

vi.mock('./i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: { app?: string }) =>
    fallback.replace('{{app}}', values?.app ?? '')
}))

describe('floating communications renderer root', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    document.body.innerHTML = '<div id="root"></div>'
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 320, 420)
    )
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(431)
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          mocks.resizeCallback = callback
        }
        observe(): void {}
        disconnect(): void {}
      }
    )
    Object.assign(window, {
      matchMedia: vi.fn(() => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      })),
      api: {
        settings: {
          getSync: vi.fn(() => null),
          get: vi.fn(() => Promise.resolve({ theme: 'system' })),
          onChanged: vi.fn(() => mocks.offSettingsChanged)
        },
        floatingComms: {
          getState: mocks.getState,
          getIntegrationStatuses: mocks.getIntegrationStatuses,
          measure: mocks.measure,
          action: mocks.action,
          discordCommand: mocks.discordCommand,
          onStateChanged: vi.fn((callback: typeof mocks.stateChanged) => {
            mocks.stateChanged = callback
            return mocks.offStateChanged
          }),
          onVisibilityChanged: vi.fn((callback: typeof mocks.visibilityChanged) => {
            mocks.visibilityChanged = callback
            return mocks.offVisibilityChanged
          })
        }
      }
    })
    mocks.getState.mockResolvedValue(surfaceState(1, false))
    mocks.discordCommand.mockResolvedValue(discordSnapshot())
    mocks.stateChanged = null
    mocks.visibilityChanged = null
    mocks.resizeCallback = null
    mocks.runtime = null
  })

  it('renders the registered manager inside the translated shared surface shell', async () => {
    await act(async () => {
      await import('./floating-comms')
    })
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="manager-content"]')).toBeTruthy()
    )
    const openButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Open Discord')
    )
    if (!openButton) {
      throw new Error('Shared open-app action was not rendered')
    }
    await act(async () => openButton.click())
    expect(mocks.action).toHaveBeenCalledWith({
      type: 'open-app',
      appId: 'discord',
      requestId: 1
    })
    expect(mocks.getState).toHaveBeenCalled()
    expect(mocks.getIntegrationStatuses).toHaveBeenCalled()
    expect(mocks.measure).toHaveBeenCalledWith({ requestId: 1, height: 420 })
    await act(async () => {
      await mocks.runtime?.commandDiscord('discordVoice.setSelfMute', { muted: true })
    })
    expect(mocks.discordCommand).toHaveBeenCalledWith({
      appId: 'discord',
      requestId: 1,
      method: 'set-self-mute',
      muted: true
    })
    const content = document.querySelector('[data-testid="manager-content"]')
    expect(content?.getAttribute('data-visible')).toBe('false')
    await act(async () =>
      mocks.visibilityChanged?.({ appId: 'discord', requestId: 1, visible: true })
    )
    expect(content?.getAttribute('data-visible')).toBe('true')
    await act(async () =>
      mocks.visibilityChanged?.({ appId: 'discord', requestId: 1, visible: false })
    )
    expect(content?.getAttribute('data-visible')).toBe('false')
    await act(async () =>
      mocks.visibilityChanged?.({ appId: 'discord', requestId: 0, visible: true })
    )
    expect(content?.getAttribute('data-visible')).toBe('false')

    mocks.measure.mockClear()
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue(
      new DOMRect(0, 0, 320, 500)
    )
    await act(async () => mocks.resizeCallback?.())
    expect(mocks.measure).toHaveBeenCalledWith({ requestId: 1, height: 420 })
  })

  it('keeps the latest state when initial and replacement refreshes resolve out of order', async () => {
    const initial = deferred<FloatingCommsSurfaceState>()
    const replacement = deferred<FloatingCommsSurfaceState>()
    let response = initial.promise
    mocks.getState.mockImplementation(() => response)

    await act(async () => {
      await import('./floating-comms')
    })
    await vi.waitFor(() => expect(mocks.stateChanged).not.toBeNull())
    response = replacement.promise
    await act(async () => mocks.stateChanged?.({ appId: 'discord', requestId: 2 }))
    replacement.resolve(surfaceState(2, true))
    await act(async () => await replacement.promise)
    await vi.waitFor(() =>
      expect(mocks.measure).toHaveBeenCalledWith({ requestId: 2, height: 420 })
    )

    initial.resolve(surfaceState(1, true))
    await act(async () => await initial.promise)
    const openButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Open Discord')
    )
    if (!openButton) {
      throw new Error('Shared open-app action was not rendered')
    }
    mocks.action.mockClear()
    await act(async () => openButton.click())
    expect(mocks.action).toHaveBeenCalledWith({
      type: 'open-app',
      appId: 'discord',
      requestId: 2
    })
  })

  it('invalidates the initial refresh when its request closes before resolution', async () => {
    const initial = deferred<FloatingCommsSurfaceState>()
    mocks.getState.mockReturnValue(initial.promise)

    await act(async () => {
      await import('./floating-comms')
    })
    await vi.waitFor(() => expect(mocks.visibilityChanged).not.toBeNull())
    await act(async () =>
      mocks.visibilityChanged?.({ appId: 'discord', requestId: 1, visible: false })
    )
    initial.resolve(surfaceState(1, true))
    await act(async () => await initial.promise)
    expect(document.querySelector('[data-testid="manager-content"]')).toBeNull()
  })
})
