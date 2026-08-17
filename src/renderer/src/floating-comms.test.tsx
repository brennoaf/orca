// @vitest-environment happy-dom

import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunicationsDockSnapshot } from '../../shared/communications-dock'
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

function dockSnapshot(appId: 'discord' | 'slack' | 'whatsapp-web'): CommunicationsDockSnapshot {
  return {
    generation: 1,
    revision: 1,
    visible: true,
    sessions: { [appId]: { appId } },
    layout: {
      version: 1,
      bounds: { x: 0, y: 0, width: 420, height: 640 },
      tabs: [
        {
          id: appId,
          layout: { type: 'leaf', appId },
          activeLeafAppId: appId
        }
      ],
      activeTabId: appId,
      collapsed: false
    }
  }
}

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  getIntegrationStatuses: vi.fn(() => new Promise<never>(() => undefined)),
  measure: vi.fn(() => Promise.resolve()),
  resize: vi.fn(() => Promise.resolve()),
  action: vi.fn(() => Promise.resolve()),
  detach: vi.fn<() => Promise<CommunicationsDockSnapshot>>(),
  discordCommand: vi.fn(),
  stateChanged: null as ((identity: FloatingCommsSurfaceIdentity) => void) | null,
  surfaceChanged: null as ((event: FloatingCommsSurfaceChanged) => void) | null,
  visibilityChanged: null as ((visibility: FloatingCommsSurfaceVisibility) => void) | null,
  sessionChange: null as ((sessionState: FloatingCommsSessionState) => void) | null,
  resizeObserverCount: 0,
  offSettingsChanged: vi.fn(),
  dockGetSnapshot: vi.fn(),
  dockReady: vi.fn(),
  dockAck: vi.fn(() => Promise.resolve()),
  dockSetNavbarHeight: vi.fn()
}))

vi.mock('./components/floating-terminal/comms-rail/communication-managers', () => ({
  COMMUNICATION_MANAGER_REGISTRY: {
    discord: { Presentation: MockPresentation },
    slack: { Presentation: MockPresentation },
    'whatsapp-web': { Presentation: MockPresentation }
  },
  createCommunicationManagerSessionState: (appId: FloatingCommsSurfaceIdentity['appId']) =>
    appId === 'whatsapp-web' ? { appId, selectedConversationId: null, draft: '' } : { appId },
  CommunicationManagerRuntimeProvider: ({ children }: { children: React.ReactNode }) => children
}))

function MockPresentation({
  isPopoverOpen,
  initialSessionState,
  onSessionStateChange,
  discordWebHost,
  children
}: {
  isPopoverOpen: boolean
  initialSessionState?: FloatingCommsSessionState
  onSessionStateChange?: (sessionState: FloatingCommsSessionState) => void
  discordWebHost?: { identity: FloatingCommsSurfaceIdentity; visible: boolean }
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
    content: (
      <div
        data-testid="manager-content"
        data-visible={isPopoverOpen}
        data-discord-host-mode={discordWebHost?.identity.mode}
      />
    ),
    sessionState: initialSessionState ?? { appId: 'discord' }
  })
}

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
          ),
          onStateChanged: vi.fn(() => vi.fn())
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
          resize: mocks.resize,
          action: mocks.action,
          detach: mocks.detach,
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
        },
        floatingCommsDock: {
          getSnapshot: mocks.dockGetSnapshot,
          ready: mocks.dockReady,
          ack: mocks.dockAck,
          setNavbarHeight: mocks.dockSetNavbarHeight,
          onSnapshotChanged: vi.fn(() => vi.fn()),
          getIntegrationStatuses: vi.fn(() => Promise.resolve([])),
          getDiscordState: vi.fn(),
          discordCommand: vi.fn(),
          activateTab: vi.fn(),
          activateLeaf: vi.fn(),
          moveApp: vi.fn(),
          moveTab: vi.fn(),
          createTab: vi.fn(),
          reorderTab: vi.fn(),
          updateRatio: vi.fn(),
          setCollapsed: vi.fn(),
          updateSession: vi.fn(),
          reattachDock: vi.fn(),
          action: vi.fn()
        }
      }
    })
    mocks.getState.mockResolvedValue(presentation(identity('discord', 'attached-native')))
    mocks.detach.mockResolvedValue(dockSnapshot('discord'))
    mocks.discordCommand.mockResolvedValue(
      presentation(identity('discord', 'attached-native')).discord
    )
    mocks.stateChanged = null
    mocks.surfaceChanged = null
    mocks.visibilityChanged = null
    mocks.sessionChange = null
    mocks.resizeObserverCount = 0
    mocks.dockGetSnapshot.mockRejectedValue(new Error('not a dock renderer'))
    mocks.dockReady.mockReset()
    mocks.dockAck.mockClear()
    mocks.dockSetNavbarHeight.mockReset()
  })

  it('boots the communications dock with its tooltip-backed navbar', async () => {
    const snapshot: CommunicationsDockSnapshot = {
      generation: 1,
      revision: 1,
      visible: false,
      sessions: { slack: { appId: 'slack' } },
      layout: {
        version: 1,
        bounds: { x: 0, y: 0, width: 420, height: 640 },
        tabs: [
          {
            id: 'slack',
            layout: { type: 'leaf', appId: 'slack' },
            activeLeafAppId: 'slack'
          }
        ],
        activeTabId: 'slack',
        collapsed: false
      }
    }
    mocks.dockGetSnapshot.mockResolvedValue(snapshot)
    mocks.dockReady.mockResolvedValue(snapshot)
    mocks.dockSetNavbarHeight.mockResolvedValue(snapshot)
    await act(async () => {
      await import('./floating-comms')
    })
    await vi.waitFor(() => expect(document.querySelector('[role="tablist"]')).toBeTruthy())
    expect(document.querySelector('[role="tab"][aria-label="Slack"]')).toBeTruthy()
  })

  it.each(['attached-native', 'attached-dom'] as const)(
    'binds Discord Web for authorized %s mode',
    async (mode) => {
      mocks.getState.mockResolvedValue(presentation(identity('discord', mode)))
      await act(async () => {
        await import('./floating-comms')
      })
      await vi.waitFor(() =>
        expect(
          document
            .querySelector('[data-testid="manager-content"]')
            ?.getAttribute('data-discord-host-mode')
        ).toBe(mode)
      )
    }
  )

  it('does not bind Discord Web for an unauthorized attached mode', async () => {
    const unauthorized = {
      ...identity('discord', 'attached-dom'),
      mode: 'attached-window'
    } as unknown as FloatingCommsSurfaceIdentity
    mocks.getState.mockResolvedValue(presentation(unauthorized))
    await act(async () => {
      await import('./floating-comms')
    })
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="manager-content"]')).toBeTruthy()
    )
    expect(
      document
        .querySelector('[data-testid="manager-content"]')
        ?.hasAttribute('data-discord-host-mode')
    ).toBe(false)
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
    mocks.detach.mockResolvedValue(dockSnapshot('whatsapp-web'))
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

  it('persists an attached WhatsApp resize only when its pointer drag ends', async () => {
    const attached = identity('whatsapp-web', 'attached-native')
    mocks.getState.mockResolvedValue(presentation(attached))
    HTMLElement.prototype.setPointerCapture = vi.fn()
    await act(async () => {
      await import('./floating-comms')
    })
    await vi.waitFor(() =>
      expect(document.querySelector('[aria-label="Resize fast response"]')).toBeTruthy()
    )
    const handle = document.querySelector('[aria-label="Resize fast response"]') as HTMLDivElement
    mocks.resize.mockClear()
    await act(async () => {
      handle.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientY: 0 })
      )
      handle.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientY: 400 })
      )
    })
    expect(mocks.resize).not.toHaveBeenCalled()
    await act(async () => {
      handle.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientY: 400 })
      )
    })
    expect(mocks.resize).toHaveBeenCalledExactlyOnceWith({ ...attached, height: 720 })
    await act(async () => {
      handle.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, clientY: 0 })
      )
      handle.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerId: 2, clientY: -400 })
      )
      handle.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 2 }))
    })
    expect(mocks.resize).toHaveBeenCalledTimes(1)
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
    await vi.waitFor(() => expect(mocks.measure).toHaveBeenCalledWith({ ...first, height: 520 }))
    const refreshesBeforeReopen = mocks.getState.mock.calls.length
    mocks.getState.mockResolvedValue(presentation(second, session))

    act(() => mocks.visibilityChanged?.({ ...first, visible: false }))
    await act(async () => mocks.stateChanged?.(second))

    await vi.waitFor(() => expect(mocks.getState).toHaveBeenCalledTimes(refreshesBeforeReopen + 1))
    await vi.waitFor(() =>
      expect(mocks.measure).toHaveBeenLastCalledWith({ ...second, height: 520 })
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
      expect(mocks.measure).toHaveBeenLastCalledWith({ ...second, height: 520 })
    )
  })
})
