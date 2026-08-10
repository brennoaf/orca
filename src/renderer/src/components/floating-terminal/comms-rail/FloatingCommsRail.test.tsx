// @vitest-environment happy-dom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CommunicationsDockPresence,
  CommunicationsDockSnapshot
} from '../../../../../shared/communications-dock'
import type {
  FloatingCommsSurfaceChanged,
  FloatingCommsSurfaceIdentity,
  FloatingCommsSurfacePresentation
} from '../../../../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../../../../shared/floating-workspace-apps'
import { FloatingCommsRail } from './FloatingCommsRail'

const storeBox = vi.hoisted(() => ({ floatingWorkspaceApps: {} }))
const workspaceBounds = { left: 100, top: 80, width: 800, height: 500 }

vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof storeBox) => unknown) => selector(storeBox),
    { getState: () => storeBox }
  )
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: vi.fn((target: unknown, method: string) => {
    void target
    return Promise.resolve(
      method === 'discordVoice.getOverlayState'
        ? { open: false }
        : {
            connection: 'connected',
            channelId: null,
            channelName: null,
            selfUserId: null,
            participants: [],
            credentialsConfigured: true,
            lastError: null
          }
    )
  })
}))

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children, open }: { children: React.ReactNode; open?: boolean }) => (
    <div data-testid="popover-root" data-open={open}>
      {children}
    </div>
  ),
  PopoverAnchor: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  )
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

function identity(
  appId: FloatingWorkspaceAppId,
  requestId: number,
  mode: FloatingCommsSurfaceIdentity['mode'],
  surfaceId = requestId
): FloatingCommsSurfaceIdentity {
  return { appId, requestId, surfaceId, mode }
}

function presentation(value: FloatingCommsSurfaceIdentity): FloatingCommsSurfacePresentation {
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
    sessionState:
      value.appId === 'whatsapp-web'
        ? { appId: 'whatsapp-web', selectedConversationId: null, draft: '' }
        : { appId: value.appId },
    visible: true
  }
}

function dockSnapshot(appId: FloatingWorkspaceAppId): CommunicationsDockSnapshot {
  return {
    generation: 1,
    revision: 1,
    visible: true,
    sessions: {
      [appId]:
        appId === 'whatsapp-web' ? { appId, selectedConversationId: null, draft: '' } : { appId }
    },
    layout: {
      version: 1,
      bounds: { x: 0, y: 0, width: 420, height: 420 },
      collapsed: false,
      activeTabId: 'tab',
      tabs: [{ id: 'tab', activeLeafAppId: appId, layout: { type: 'leaf', appId } }]
    }
  }
}

function Harness({
  panel,
  panelVisible = true
}: {
  panel: HTMLDivElement
  panelVisible?: boolean
}) {
  const [openAppId, setOpenAppId] = useState<FloatingWorkspaceAppId | null>(null)
  return (
    <>
      <div data-testid="webview-input" data-input-locked={openAppId !== null} />
      <FloatingCommsRail
        panelRef={{ current: panel }}
        panelVisible={panelVisible}
        workspaceBounds={workspaceBounds}
        openAppId={openAppId}
        onOpenAppIdChange={setOpenAppId}
        onOpenApp={vi.fn()}
      />
    </>
  )
}

describe('FloatingCommsRail', () => {
  let root: Root | null = null
  let panel: HTMLDivElement | null = null
  let presenceChanged: ((presence: CommunicationsDockPresence) => void) | null = null
  let surfaceChanged: ((event: FloatingCommsSurfaceChanged) => void) | null = null
  let initialPresence: CommunicationsDockPresence
  let initialPresentations: FloatingCommsSurfacePresentation[]
  let offPresence: ReturnType<typeof vi.fn>
  let offReattached: ReturnType<typeof vi.fn>

  beforeEach(() => {
    initialPresence = { exists: false, visible: false }
    initialPresentations = []
    offPresence = vi.fn()
    offReattached = vi.fn()
    Object.assign(window, {
      api: {
        floatingComms: {
          open: vi.fn((request: { appId: FloatingWorkspaceAppId; requestId: number }) =>
            Promise.resolve({
              identity: identity(request.appId, request.requestId, 'attached-dom')
            })
          ),
          update: vi.fn((request: FloatingCommsSurfaceIdentity) =>
            Promise.resolve({ identity: request })
          ),
          closeAttached: vi.fn(() => Promise.resolve()),
          detach: vi.fn((request: FloatingCommsSurfaceIdentity) =>
            Promise.resolve(presentation({ ...request, mode: 'detached' }))
          ),
          minimizeDetached: vi.fn(() => Promise.resolve()),
          focusDetached: vi.fn((request: { appId: FloatingWorkspaceAppId }) =>
            Promise.resolve(presentation(identity(request.appId, 1, 'detached')))
          ),
          disable: vi.fn(() => Promise.resolve()),
          listPresentations: vi.fn(() => Promise.resolve(initialPresentations)),
          onSurfaceChanged: vi.fn((callback: typeof surfaceChanged) => {
            surfaceChanged = callback
            return vi.fn()
          }),
          onGeometryRequested: vi.fn(() => vi.fn()),
          onAction: vi.fn(() => vi.fn())
        },
        floatingCommsDock: {
          detach: vi.fn((request: { appId: FloatingWorkspaceAppId }) =>
            Promise.resolve(dockSnapshot(request.appId))
          ),
          openOrFocus: vi.fn((request: { appId: FloatingWorkspaceAppId }) =>
            Promise.resolve(dockSnapshot(request.appId))
          ),
          getPresence: vi.fn(() => Promise.resolve(initialPresence)),
          onPresenceChanged: vi.fn((callback: typeof presenceChanged) => {
            presenceChanged = callback
            return offPresence
          }),
          onReattached: vi.fn(() => offReattached)
        },
        zApiAttention: {
          getSnapshot: vi.fn(() =>
            Promise.resolve({ provider: 'z-api', totalUnread: 0, conversations: [] })
          ),
          markSeen: vi.fn(() =>
            Promise.resolve({ provider: 'z-api', totalUnread: 0, conversations: [] })
          ),
          onChanged: vi.fn(() => vi.fn())
        }
      }
    })
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      }
    )
  })

  afterEach(() => {
    act(() => root?.unmount())
    panel?.remove()
    root = null
    panel = null
    presenceChanged = null
    surfaceChanged = null
    storeBox.floatingWorkspaceApps = {}
  })

  function mount(panelVisible = true): HTMLDivElement {
    const element = document.createElement('div')
    panel = element
    document.body.appendChild(element)
    root = createRoot(element)
    act(() => root?.render(<Harness panel={element} panelVisible={panelVisible} />))
    return element
  }

  function button(container: HTMLDivElement, label: string): HTMLButtonElement {
    const element = container.querySelector(`button[aria-label^="${label}"]`)
    if (!(element instanceof HTMLButtonElement)) {
      throw new Error(`${label} rail button was not rendered`)
    }
    return element
  }

  it('renders the shared detach action for an attached DOM manager', async () => {
    const container = mount()
    await act(async () => await Promise.resolve())
    await act(async () => button(container, 'Slack').click())
    expect(container.querySelector('[data-testid="popover-root"]')?.getAttribute('data-open')).toBe(
      'true'
    )
    const detachButton = container.querySelector('button[aria-label="Detach overlay"]')
    if (!(detachButton instanceof HTMLButtonElement)) {
      throw new Error('Detach action was not rendered')
    }
    await act(async () => detachButton.click())
    expect(window.api.floatingCommsDock.detach).toHaveBeenCalledWith({
      appId: 'slack',
      sessionState: { appId: 'slack' }
    })
  })

  it('hydrates a visible dock and activates a different app without opening attached', async () => {
    initialPresence = { exists: true, visible: true, activeAppId: 'slack' }
    const container = mount()
    await act(async () => await Promise.resolve())
    const discord = button(container, 'Discord')
    expect(discord.getAttribute('data-surface-mode')).toBe('detached')
    await act(async () => discord.click())
    expect(window.api.floatingCommsDock.openOrFocus).toHaveBeenCalledWith({ appId: 'discord' })
    expect(window.api.floatingComms.open).not.toHaveBeenCalled()
    expect(
      container.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('false')
  })

  it('hydrates a hidden dock as focusable without opening attached', async () => {
    initialPresence = { exists: true, visible: false, activeAppId: 'slack' }
    const container = mount()
    await act(async () => await Promise.resolve())
    const slack = button(container, 'Slack')
    expect(slack.getAttribute('data-surface-mode')).toBe('detached')
    await act(async () => slack.click())
    expect(window.api.floatingCommsDock.openOrFocus).toHaveBeenCalledWith({ appId: 'slack' })
    expect(window.api.floatingComms.open).not.toHaveBeenCalled()
  })

  it('opens attached when no dock window exists', async () => {
    const container = mount()
    await act(async () => await Promise.resolve())
    await act(async () => button(container, 'Slack').click())
    expect(window.api.floatingComms.open).toHaveBeenCalled()
    expect(window.api.floatingCommsDock.openOrFocus).not.toHaveBeenCalled()
  })

  it('does not open attached while initial presence is unresolved', async () => {
    vi.mocked(window.api.floatingCommsDock.getPresence).mockReturnValueOnce(new Promise(() => {}))
    const container = mount()
    await act(async () => button(container, 'Slack').click())
    expect(window.api.floatingComms.open).not.toHaveBeenCalled()
    expect(window.api.floatingCommsDock.openOrFocus).not.toHaveBeenCalled()
  })

  it('does not let initial presence overwrite a newer presence event', async () => {
    let resolvePresence: (presence: CommunicationsDockPresence) => void = () => undefined
    vi.mocked(window.api.floatingCommsDock.getPresence).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePresence = resolve
      })
    )
    const container = mount()
    act(() => presenceChanged?.({ exists: true, visible: false, activeAppId: 'discord' }))
    await act(async () => resolvePresence({ exists: false, visible: false }))
    await act(async () => button(container, 'Discord').click())
    expect(window.api.floatingCommsDock.openOrFocus).toHaveBeenCalledWith({ appId: 'discord' })
    expect(window.api.floatingComms.open).not.toHaveBeenCalled()
  })

  it('ignores presence work after unmount and unsubscribes listeners', async () => {
    let resolvePresence: (presence: CommunicationsDockPresence) => void = () => undefined
    vi.mocked(window.api.floatingCommsDock.getPresence).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePresence = resolve
      })
    )
    const container = mount()
    act(() => root?.unmount())
    root = null
    act(() => presenceChanged?.({ exists: true, visible: true, activeAppId: 'slack' }))
    await act(async () => resolvePresence({ exists: true, visible: true, activeAppId: 'slack' }))
    expect(offPresence).toHaveBeenCalledOnce()
    expect(offReattached).toHaveBeenCalledOnce()
    expect(container.childElementCount).toBe(0)
  })

  it('focuses an existing detached manager without opening or locking input', async () => {
    initialPresentations = [presentation(identity('discord', 7, 'detached', 70))]
    const container = mount()
    await act(async () => await Promise.resolve())
    const discord = button(container, 'Discord')
    expect(discord.getAttribute('data-surface-mode')).toBe('detached')
    expect(discord.getAttribute('aria-label')).toContain('Focus Discord detached overlay')
    expect(container.textContent).toContain('Focus Discord detached overlay')
    await act(async () => discord.click())
    expect(window.api.floatingComms.focusDetached).toHaveBeenCalledWith({ appId: 'discord' })
    expect(window.api.floatingComms.open).not.toHaveBeenCalled()
    expect(
      container.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('false')
  })

  it('shows multiple detached presentation indicators', async () => {
    initialPresentations = [
      presentation(identity('slack', 2, 'detached', 20)),
      presentation(identity('discord', 3, 'detached', 30))
    ]
    const container = mount()
    await act(async () => await Promise.resolve())
    expect(container.querySelectorAll('[data-surface-mode="detached"]')).toHaveLength(2)
  })

  it('unlocks input when an attached native manager becomes detached', async () => {
    const floatingComms = window.api.floatingComms
    vi.mocked(floatingComms.open).mockResolvedValue({
      identity: identity('discord', 1, 'attached-native', 10)
    })
    const container = mount()
    await act(async () => await Promise.resolve())
    await act(async () => button(container, 'Discord').click())
    expect(
      container.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('true')
    act(() =>
      surfaceChanged?.({
        appId: 'discord',
        previous: identity('discord', 1, 'attached-native', 10),
        current: identity('discord', 1, 'detached', 10),
        reason: 'detached',
        sessionState: { appId: 'discord' }
      })
    )
    expect(
      container.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('false')
  })

  it('ignores a stale close transition for a newer detached surface', async () => {
    initialPresentations = [presentation(identity('slack', 5, 'detached', 50))]
    const container = mount()
    await act(async () => await Promise.resolve())
    act(() =>
      surfaceChanged?.({
        appId: 'slack',
        previous: identity('slack', 4, 'detached', 40),
        current: null,
        reason: 'closed',
        sessionState: null
      })
    )
    expect(button(container, 'Slack').getAttribute('data-surface-mode')).toBe('detached')
  })

  it('closes an attached manager when the panel becomes hidden', async () => {
    const container = mount()
    await act(async () => await Promise.resolve())
    await act(async () => button(container, 'Slack').click())
    act(() => root?.render(<Harness panel={container} panelVisible={false} />))
    expect(window.api.floatingComms.closeAttached).toHaveBeenCalledWith(
      identity('slack', 1, 'attached-dom')
    )
  })
})
