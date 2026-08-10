// @vitest-environment happy-dom

import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  FloatingCommsSessionState,
  FloatingCommsSurfaceChanged,
  FloatingCommsSurfaceIdentity,
  FloatingCommsSurfacePresentation,
  FloatingCommsSurfaceVisibility
} from '../../shared/floating-comms-surface'

function identity(
  appId: FloatingCommsSurfaceIdentity['appId'],
  mode: FloatingCommsSurfaceIdentity['mode'],
  requestId = 1,
  surfaceId = 10
): FloatingCommsSurfaceIdentity {
  return { appId, mode, requestId, surfaceId }
}

function presentation(
  value: FloatingCommsSurfaceIdentity,
  sessionState: FloatingCommsSessionState = { appId: 'discord' }
): FloatingCommsSurfacePresentation {
  return {
    ...value,
    discord: {
      connection: 'connected',
      channelId: null,
      channelName: null,
      selfUserId: null,
      participants: [],
      credentialsConfigured: true,
      lastError: null
    },
    overlayOpen: false,
    sessionState,
    visible: true
  }
}

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  getIntegrationStatuses: vi.fn(() => new Promise<never>(() => undefined)),
  measure: vi.fn(() => Promise.resolve()),
  action: vi.fn(() => Promise.resolve()),
  detach: vi.fn<() => Promise<FloatingCommsSurfacePresentation>>(),
  minimizeDetached: vi.fn(() => Promise.resolve()),
  discordCommand: vi.fn(),
  stateChanged: null as ((identity: FloatingCommsSurfaceIdentity) => void) | null,
  surfaceChanged: null as ((event: FloatingCommsSurfaceChanged) => void) | null,
  visibilityChanged: null as ((visibility: FloatingCommsSurfaceVisibility) => void) | null,
  sessionChange: null as ((sessionState: FloatingCommsSessionState) => void) | null,
  resizeObserverCount: 0,
  offSettingsChanged: vi.fn()
}))

vi.mock('./components/floating-terminal/comms-rail/communication-managers', () => ({
  COMMUNICATION_MANAGER_REGISTRY: {
    discord: { Presentation: MockPresentation },
    'whatsapp-web': { Presentation: MockPresentation }
  },
  CommunicationManagerRuntimeProvider: ({ children }: { children: React.ReactNode }) => children
}))

function MockPresentation({
  isPopoverOpen,
  initialSessionState,
  onSessionStateChange,
  children
}: {
  isPopoverOpen: boolean
  initialSessionState?: FloatingCommsSessionState
  onSessionStateChange?: (sessionState: FloatingCommsSessionState) => void
  children: (value: {
    status: { kind: 'idle' }
    tooltip: string
    content: React.ReactNode
    sessionState: FloatingCommsSessionState
  }) => React.ReactNode
}) {
  mocks.sessionChange = onSessionStateChange ?? null
  return children({
    status: { kind: 'idle' },
    tooltip: 'Manager',
    content: <div data-testid="manager-content" data-visible={isPopoverOpen} />,
    sessionState: initialSessionState ?? { appId: 'discord' }
  })
}

vi.mock('./components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children
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
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor() {
          mocks.resizeObserverCount += 1
        }
        observe(): void {}
        disconnect(): void {}
      }
    )
    Object.assign(window, {
      matchMedia: vi.fn(() => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() })),
      api: {
        whatsappFastResponse: {
          hide: vi.fn(() =>
            Promise.resolve({ attached: true, crashed: false, loaded: true, visible: false })
          )
        },
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
          detach: mocks.detach,
          minimizeDetached: mocks.minimizeDetached,
          discordCommand: mocks.discordCommand,
          onStateChanged: vi.fn((callback: typeof mocks.stateChanged) => {
            mocks.stateChanged = callback
            return vi.fn()
          }),
          onSurfaceChanged: vi.fn((callback: typeof mocks.surfaceChanged) => {
            mocks.surfaceChanged = callback
            return vi.fn()
          }),
          onVisibilityChanged: vi.fn((callback: typeof mocks.visibilityChanged) => {
            mocks.visibilityChanged = callback
            return vi.fn()
          })
        }
      }
    })
    mocks.getState.mockResolvedValue(presentation(identity('discord', 'detached')))
    mocks.detach.mockResolvedValue(presentation(identity('discord', 'detached')))
    mocks.discordCommand.mockResolvedValue(presentation(identity('discord', 'detached')).discord)
    mocks.stateChanged = null
    mocks.surfaceChanged = null
    mocks.visibilityChanged = null
    mocks.sessionChange = null
    mocks.resizeObserverCount = 0
  })

  it('renders a draggable detached header and minimizes back to the panel', async () => {
    await act(async () => {
      await import('./floating-comms')
    })
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="manager-content"]')).toBeTruthy()
    )
    const back = document.querySelector('button[aria-label="Back to panel"]')
    if (!(back instanceof HTMLButtonElement)) {
      throw new Error('Back to panel action was not rendered')
    }
    expect(back.closest('[data-drag-region="true"]')).toBeTruthy()
    expect(back.getAttribute('data-no-drag')).toBe('true')
    expect(mocks.resizeObserverCount).toBe(0)
    expect(mocks.measure).not.toHaveBeenCalled()
    await act(async () => back.click())
    expect(mocks.minimizeDetached).toHaveBeenCalledWith({
      ...identity('discord', 'detached'),
      sessionState: { appId: 'discord' }
    })
  })

  it('detaches an attached manager with the latest in-memory WhatsApp session', async () => {
    const attached = identity('whatsapp-web', 'attached-native')
    mocks.getState.mockResolvedValue(
      presentation(attached, {
        appId: 'whatsapp-web',
        selectedConversationId: 4,
        draft: 'first'
      })
    )
    mocks.detach.mockResolvedValue(
      presentation(
        { ...attached, mode: 'detached' },
        { appId: 'whatsapp-web', selectedConversationId: 4, draft: 'latest' }
      )
    )
    await act(async () => {
      await import('./floating-comms')
    })
    await vi.waitFor(() => expect(mocks.sessionChange).not.toBeNull())
    act(() =>
      mocks.sessionChange?.({
        appId: 'whatsapp-web',
        selectedConversationId: 4,
        draft: 'latest'
      })
    )
    const detach = document.querySelector('button[aria-label="Detach overlay"]')
    if (!(detach instanceof HTMLButtonElement)) {
      throw new Error('Detach action was not rendered')
    }
    await act(async () => detach.click())
    expect(mocks.detach).toHaveBeenCalledWith({
      ...attached,
      sessionState: {
        appId: 'whatsapp-web',
        selectedConversationId: 4,
        draft: 'latest'
      }
    })
  })

  it('refreshes and measures a reopened attached WhatsApp surface after it is hidden', async () => {
    const first = identity('whatsapp-web', 'attached-native', 1, 10)
    const second = identity('whatsapp-web', 'attached-native', 2, 20)
    const session = { appId: 'whatsapp-web' as const, selectedConversationId: 4, draft: 'latest' }
    mocks.getState.mockResolvedValue(presentation(first, session))
    await act(async () => {
      await import('./floating-comms')
    })
    await vi.waitFor(() => expect(mocks.visibilityChanged).not.toBeNull())
    await vi.waitFor(() => expect(mocks.measure).toHaveBeenCalledWith({ ...first, height: 420 }))
    const refreshesBeforeReopen = mocks.getState.mock.calls.length
    mocks.getState.mockResolvedValue(presentation(second, session))

    act(() => mocks.visibilityChanged?.({ ...first, visible: false }))
    await act(async () => mocks.stateChanged?.(second))

    await vi.waitFor(() => expect(mocks.getState).toHaveBeenCalledTimes(refreshesBeforeReopen + 1))
    await vi.waitFor(() =>
      expect(mocks.measure).toHaveBeenLastCalledWith({ ...second, height: 420 })
    )
  })

  it('refreshes a reopened attached surface when its state arrives before the prior hide', async () => {
    const first = identity('whatsapp-web', 'attached-native', 1, 10)
    const second = identity('whatsapp-web', 'attached-native', 2, 20)
    const session = { appId: 'whatsapp-web' as const, selectedConversationId: 4, draft: 'latest' }
    mocks.getState.mockResolvedValue(presentation(first, session))
    await act(async () => {
      await import('./floating-comms')
    })
    await vi.waitFor(() => expect(mocks.stateChanged).not.toBeNull())
    const refreshesBeforeReopen = mocks.getState.mock.calls.length
    mocks.getState.mockResolvedValue(presentation(second, session))

    await act(async () => mocks.stateChanged?.(second))
    act(() => mocks.visibilityChanged?.({ ...first, visible: false }))

    await vi.waitFor(() => expect(mocks.getState).toHaveBeenCalledTimes(refreshesBeforeReopen + 1))
    await vi.waitFor(() =>
      expect(mocks.measure).toHaveBeenLastCalledWith({ ...second, height: 420 })
    )
  })

  it('keeps detached identity hidden on minimize and resumes after attached readoption', async () => {
    const detached = identity('discord', 'detached')
    await act(async () => {
      await import('./floating-comms')
    })
    await vi.waitFor(() => expect(mocks.visibilityChanged).not.toBeNull())
    const content = document.querySelector('[data-testid="manager-content"]')
    expect(content?.getAttribute('data-visible')).toBe('true')
    act(() => mocks.visibilityChanged?.({ ...detached, visible: false }))
    expect(content?.getAttribute('data-visible')).toBe('false')
    act(() => mocks.visibilityChanged?.({ ...detached, visible: true }))
    expect(content?.getAttribute('data-visible')).toBe('true')
    const back = document.querySelector('button[aria-label="Back to panel"]')
    if (!(back instanceof HTMLButtonElement)) {
      throw new Error('Back to panel action was not rendered')
    }
    await act(async () => back.click())
    const requestsBeforeMinimize = mocks.getState.mock.calls.length
    act(() => mocks.visibilityChanged?.({ ...detached, visible: false }))
    expect(content?.getAttribute('data-visible')).toBe('false')
    expect(mocks.getState).toHaveBeenCalledTimes(requestsBeforeMinimize)

    const returned = identity('discord', 'attached-native', 1, 20)
    mocks.getState.mockResolvedValue({ ...presentation(returned), visible: false })
    await act(async () =>
      mocks.surfaceChanged?.({
        appId: 'discord',
        previous: detached,
        current: returned,
        reason: 'minimized',
        sessionState: { appId: 'discord' }
      })
    )
    await vi.waitFor(() => expect(mocks.getState).toHaveBeenCalledTimes(requestsBeforeMinimize + 1))
    expect(content?.getAttribute('data-visible')).toBe('false')
    act(() => mocks.visibilityChanged?.({ ...returned, visible: true }))
    expect(content?.getAttribute('data-visible')).toBe('true')

    const openApp = Array.from(document.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes('Open Discord')
    )
    if (!openApp) {
      throw new Error('Open Discord action was not rendered')
    }
    await act(async () => openApp.click())
    expect(mocks.action).toHaveBeenLastCalledWith({ type: 'open-app', ...returned })
  })

  it('accepts exact authoritative surface transitions and keeps actions on the current identity', async () => {
    const attached = identity('discord', 'attached-native', 1, 10)
    const detached = identity('discord', 'detached', 1, 20)
    const returned = identity('discord', 'attached-native', 1, 30)
    mocks.getState.mockResolvedValue(presentation(attached))
    await act(async () => {
      await import('./floating-comms')
    })
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="manager-content"]')).toBeTruthy()
    )
    const openApp = (): HTMLButtonElement => {
      const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
        candidate.textContent?.includes('Open Discord')
      )
      if (!button) {
        throw new Error('Open Discord action was not rendered')
      }
      return button
    }
    await act(async () => openApp().click())
    expect(mocks.action).toHaveBeenLastCalledWith({ type: 'open-app', ...attached })

    mocks.getState.mockResolvedValue(presentation(detached))
    const requestsBeforeStateEvent = mocks.getState.mock.calls.length
    act(() => mocks.stateChanged?.(detached))
    expect(mocks.getState).toHaveBeenCalledTimes(requestsBeforeStateEvent)
    await act(async () =>
      mocks.surfaceChanged?.({
        appId: 'discord',
        previous: attached,
        current: detached,
        reason: 'detached',
        sessionState: { appId: 'discord' }
      })
    )
    await vi.waitFor(() =>
      expect(mocks.getState).toHaveBeenCalledTimes(requestsBeforeStateEvent + 1)
    )
    await act(async () => openApp().click())
    expect(mocks.action).toHaveBeenLastCalledWith({ type: 'open-app', ...detached })

    mocks.getState.mockResolvedValue(presentation(returned))
    await act(async () =>
      mocks.surfaceChanged?.({
        appId: 'discord',
        previous: detached,
        current: returned,
        reason: 'minimized',
        sessionState: { appId: 'discord' }
      })
    )
    await vi.waitFor(() =>
      expect(mocks.getState).toHaveBeenCalledTimes(requestsBeforeStateEvent + 2)
    )
    await act(async () => openApp().click())
    expect(mocks.action).toHaveBeenLastCalledWith({ type: 'open-app', ...returned })

    const requestsBeforeStaleEvents = mocks.getState.mock.calls.length
    act(() =>
      mocks.surfaceChanged?.({
        appId: 'whatsapp-web',
        previous: null,
        current: identity('whatsapp-web', 'detached', 2, 40),
        reason: 'detached',
        sessionState: { appId: 'whatsapp-web', selectedConversationId: null, draft: '' }
      })
    )
    act(() =>
      mocks.surfaceChanged?.({
        appId: 'discord',
        previous: attached,
        current: detached,
        reason: 'detached',
        sessionState: { appId: 'discord' }
      })
    )
    expect(mocks.getState).toHaveBeenCalledTimes(requestsBeforeStaleEvents)
  })
})
