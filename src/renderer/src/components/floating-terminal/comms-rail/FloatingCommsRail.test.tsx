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
  PopoverContent: ({
    children,
    className,
    collisionBoundary,
    portalContainer,
    style
  }: {
    children: React.ReactNode
    className?: string
    collisionBoundary?: HTMLElement | null
    portalContainer?: HTMLElement | null
    style?: React.CSSProperties
  }) => (
    <div
      data-testid="popover-content"
      data-collision-body={collisionBoundary === document.body}
      data-portal-body={portalContainer === document.body}
      className={className}
      style={style}
    >
      {children}
    </div>
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
    initialPresence = { exists: false, visible: false, location: 'panel' }
    initialPresentations = []
    offPresence = vi.fn()
    offReattached = vi.fn()
    Object.assign(window, {
      api: {
        ui: { getZoomLevel: vi.fn(() => 0) },
        whatsappFastResponse: {
          attach: vi.fn(() =>
            Promise.resolve({
              attention: { hasUnread: false },
              attached: true,
              crashed: false,
              loaded: false,
              visible: true
            })
          ),
          updateBounds: vi.fn(),
          show: vi.fn(),
          hide: vi.fn(() =>
            Promise.resolve({ attached: true, crashed: false, loaded: true, visible: false })
          ),
          collapse: vi.fn(),
          onStateChanged: vi.fn(() => vi.fn()),
          onAttentionChanged: vi.fn(() => vi.fn())
        },
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
          resize: vi.fn(() => Promise.resolve()),
          detach: vi.fn((request: FloatingCommsSurfaceIdentity) =>
            Promise.resolve(dockSnapshot(request.appId))
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
          onReattached: vi.fn(() => offReattached),
          onAction: vi.fn(() => vi.fn())
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
    expect(container.querySelector('[data-testid="popover-content"]')).toMatchObject({
      dataset: expect.objectContaining({ collisionBody: 'true', portalBody: 'true' })
    })
    expect(container.querySelector('[data-testid="popover-content"]')?.className).toContain(
      'h-[min(420px,var(--radix-popover-content-available-height))]'
    )
    expect(container.querySelector('[data-testid="popover-content"]')?.className).not.toContain(
      'max-h-'
    )
    const detachButton = container.querySelector('button[aria-label="Detach overlay"]')
    if (!(detachButton instanceof HTMLButtonElement)) {
      throw new Error('Detach action was not rendered')
    }
    await act(async () => detachButton.click())
    expect(window.api.floatingCommsDock.detach).toHaveBeenCalledWith({
      appId: 'slack',
      identity: identity('slack', 1, 'attached-dom'),
      sessionState: { appId: 'slack' },
      sessions: {
        'whatsapp-web': { appId: 'whatsapp-web', selectedConversationId: null, draft: '' },
        slack: { appId: 'slack' },
        discord: { appId: 'discord' }
      }
    })
    expect(window.api.floatingComms.closeAttached).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="popover-root"]')?.getAttribute('data-open')).toBe(
      'false'
    )
    expect(
      container.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('false')
    const detachedRail = button(container, 'Slack')
    expect(detachedRail.getAttribute('data-surface-mode')).toBe('detached')
    await act(async () => detachedRail.click())
    expect(window.api.floatingCommsDock.openOrFocus).toHaveBeenCalledWith({ appId: 'slack' })
    expect(window.api.floatingComms.open).toHaveBeenCalledOnce()
  })

  it('does not let a stale detach response clear a newer attached owner', async () => {
    let resolveDetach: (snapshot: CommunicationsDockSnapshot) => void = () => undefined
    let resolveOpen: (result: { identity: FloatingCommsSurfaceIdentity }) => void = () => undefined
    vi.mocked(window.api.floatingCommsDock.detach).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDetach = resolve
      })
    )
    const container = mount()
    await act(async () => await Promise.resolve())
    await act(async () => button(container, 'Slack').click())
    const first = identity('slack', 1, 'attached-dom')
    const detachButton = container.querySelector('button[aria-label="Detach overlay"]')
    if (!(detachButton instanceof HTMLButtonElement)) {
      throw new Error('Detach action was not rendered')
    }
    act(() => detachButton.click())
    act(() =>
      surfaceChanged?.({
        appId: 'slack',
        previous: first,
        current: null,
        reason: 'detached',
        sessionState: { appId: 'slack' }
      })
    )
    vi.mocked(window.api.floatingComms.open).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOpen = resolve
      })
    )
    act(() => button(container, 'Slack').click())
    await act(async () => resolveDetach(dockSnapshot('slack')))

    expect(window.api.floatingComms.open).toHaveBeenCalledTimes(2)
    expect(button(container, 'Slack').getAttribute('data-surface-mode')).toBe('closed')
    expect(window.api.floatingCommsDock.openOrFocus).not.toHaveBeenCalled()
    await act(async () => resolveOpen({ identity: identity('slack', 3, 'attached-dom') }))
    expect(button(container, 'Slack').getAttribute('data-surface-mode')).toBe('attached')
    expect(container.querySelector('[data-testid="popover-root"]')?.getAttribute('data-open')).toBe(
      'true'
    )
    expect(
      container.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('true')
    await act(async () => button(container, 'Slack').click())
    expect(window.api.floatingComms.closeAttached).toHaveBeenCalledWith(
      identity('slack', 3, 'attached-dom')
    )
  })

  it('hydrates a visible dock and activates a different app without opening attached', async () => {
    initialPresence = { exists: true, visible: true, location: 'dock', activeAppId: 'slack' }
    const container = mount()
    await act(async () => await Promise.resolve())
    const discord = button(container, 'Discord')
    expect(discord.getAttribute('data-surface-mode')).toBe('detached')
    expect(discord.getAttribute('aria-label')).toContain('Focus Discord in communication dock')
    await act(async () => discord.click())
    expect(window.api.floatingCommsDock.openOrFocus).toHaveBeenCalledWith({ appId: 'discord' })
    expect(window.api.floatingComms.open).not.toHaveBeenCalled()
    expect(
      container.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('false')
  })

  it('hydrates a hidden dock as focusable without opening attached', async () => {
    initialPresence = { exists: true, visible: false, location: 'dock', activeAppId: 'slack' }
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

  it('disables popover transforms only for native attached DOM managers', async () => {
    const container = mount()
    await act(async () => await Promise.resolve())

    await act(async () => button(container, 'Slack').click())
    expect(container.querySelector('[data-testid="popover-content"]')?.className).toContain(
      'data-[state=open]:animate-none data-[state=closed]:animate-none'
    )
    await act(async () => button(container, 'Slack').click())

    await act(async () => button(container, 'WhatsApp Web').click())
    expect(container.querySelector('[data-testid="popover-content"]')?.className).toContain(
      'data-[state=open]:animate-none data-[state=closed]:animate-none'
    )
    await act(async () => button(container, 'WhatsApp Web').click())

    await act(async () => button(container, 'Discord').click())
    expect(container.querySelector('[data-testid="popover-content"]')?.className).not.toContain(
      'animate-none'
    )
  })

  it('attaches compact WhatsApp Web when the attached surface falls back to DOM', async () => {
    const bounds = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(12, 18, 300, 240))
    const container = mount()
    await act(async () => await Promise.resolve())
    await act(async () => button(container, 'WhatsApp Web').click())

    expect(window.api.whatsappFastResponse.attach).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'attached',
        appId: 'whatsapp-web',
        requestId: 1,
        surfaceId: 1,
        mode: 'attached-dom'
      })
    )
    bounds.mockRestore()
  })

  it('resizes only the attached WhatsApp DOM surface within the viewport and shared bounds', async () => {
    HTMLElement.prototype.setPointerCapture = vi.fn()
    const bounds = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 320, 480))
    const container = mount()
    await act(async () => await Promise.resolve())
    await act(async () => button(container, 'WhatsApp Web').click())
    const handle = container.querySelector('[aria-label="Resize fast response"]')
    if (!(handle instanceof HTMLDivElement)) {
      throw new Error('Fast response resize handle was not rendered')
    }
    await act(async () => {
      handle.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientY: 0 })
      )
      handle.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientY: 400 })
      )
    })
    expect(window.api.floatingComms.resize).not.toHaveBeenCalled()
    await act(async () => {
      handle.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientY: 400 })
      )
    })
    expect(window.api.floatingComms.resize).toHaveBeenCalledWith({
      ...identity('whatsapp-web', 1, 'attached-dom'),
      height: 480
    })
    bounds.mockRestore()
  })

  it('does not render a resize handle or call resize for disallowed attached surfaces', async () => {
    const container = mount()
    await act(async () => await Promise.resolve())
    await act(async () => button(container, 'Discord').click())
    expect(container.querySelector('[aria-label="Resize fast response"]')).toBeNull()
    expect(window.api.floatingComms.resize).not.toHaveBeenCalled()
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
    act(() =>
      presenceChanged?.({ exists: true, visible: false, location: 'dock', activeAppId: 'discord' })
    )
    await act(async () => resolvePresence({ exists: false, visible: false, location: 'panel' }))
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
    act(() =>
      presenceChanged?.({ exists: true, visible: true, location: 'dock', activeAppId: 'slack' })
    )
    await act(async () =>
      resolvePresence({ exists: true, visible: true, location: 'dock', activeAppId: 'slack' })
    )
    expect(offPresence).toHaveBeenCalledOnce()
    expect(offReattached).toHaveBeenCalledOnce()
    expect(container.childElementCount).toBe(0)
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
