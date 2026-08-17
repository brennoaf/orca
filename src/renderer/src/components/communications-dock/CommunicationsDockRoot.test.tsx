// @vitest-environment happy-dom

import { act, useEffect, useRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunicationsDockSnapshot } from '../../../../shared/communications-dock'
import type { FloatingCommsSessionState } from '../../../../shared/floating-comms-surface'
import { CommunicationsDockRoot } from './CommunicationsDockRoot'

const managerLifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }))
const sessionCallbacks = new Map<string, (sessionState: FloatingCommsSessionState) => void>()
const whatsappHostVisibility = vi.hoisted(() => ({ value: false }))

function MockPresentation({
  initialSessionState,
  onSessionStateChange,
  whatsappHost,
  children
}: {
  initialSessionState?: FloatingCommsSessionState
  onSessionStateChange?: (sessionState: FloatingCommsSessionState) => void
  whatsappHost?: { visible: boolean }
  children: (presentation: {
    status: { kind: 'idle' }
    tooltip: string
    content: React.ReactNode
    sessionState: FloatingCommsSessionState
    headerActions?: React.ReactNode
    hideFooter?: boolean
  }) => React.ReactNode
}): React.JSX.Element {
  const sessionState = initialSessionState ?? { appId: 'discord' }
  const appIdRef = useRef(sessionState.appId)
  const callbackRef = useRef(onSessionStateChange)
  if (sessionState.appId === 'whatsapp-web') {
    whatsappHostVisibility.value = whatsappHost?.visible ?? false
  }
  callbackRef.current = onSessionStateChange
  useEffect(() => {
    const appId = appIdRef.current
    managerLifecycle.mounts += 1
    if (callbackRef.current) {
      sessionCallbacks.set(appId, callbackRef.current)
    }
    return () => {
      managerLifecycle.unmounts += 1
      sessionCallbacks.delete(appId)
    }
  }, [])
  return (
    <>
      {children({
        status: { kind: 'idle' },
        tooltip: sessionState.appId,
        content: <div data-manager={sessionState.appId} />,
        sessionState,
        headerActions:
          sessionState.appId === 'discord' ? (
            <button type="button">Voice status</button>
          ) : undefined,
        hideFooter: sessionState.appId === 'discord'
      })}
    </>
  )
}

vi.mock('@/components/floating-terminal/comms-rail/communication-managers', () => ({
  createCommunicationManagerSessionState: (appId: string) => ({ appId }),
  COMMUNICATION_MANAGER_REGISTRY: {
    'whatsapp-web': { Presentation: MockPresentation },
    slack: { Presentation: MockPresentation },
    discord: { Presentation: MockPresentation }
  },
  CommunicationManagerRuntimeProvider: ({ children }: { children: React.ReactNode }) => children
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children
}))

function createSnapshot(collapsed = false, revision = 1): CommunicationsDockSnapshot {
  return {
    generation: 4,
    revision,
    visible: true,
    sessions: {
      'whatsapp-web': { appId: 'whatsapp-web', selectedConversationId: 7, draft: 'saved' },
      slack: { appId: 'slack' },
      discord: { appId: 'discord' }
    },
    layout: {
      version: 1,
      bounds: { x: 10, y: 20, width: 500, height: 500 },
      collapsed,
      activeTabId: 'all',
      tabs: [
        {
          id: 'all',
          activeLeafAppId: 'whatsapp-web',
          layout: {
            type: 'split',
            direction: 'vertical',
            ratio: 0.65,
            first: {
              type: 'split',
              direction: 'horizontal',
              ratio: 0.5,
              first: { type: 'leaf', appId: 'whatsapp-web' },
              second: { type: 'leaf', appId: 'slack' }
            },
            second: { type: 'leaf', appId: 'discord' }
          }
        }
      ]
    }
  }
}

describe('CommunicationsDockRoot', () => {
  let current: CommunicationsDockSnapshot
  let snapshotListener: ((snapshot: CommunicationsDockSnapshot) => void) | null
  const offSnapshotChanged = vi.fn()
  const offWhatsAppStateChanged = vi.fn()
  const slackFastResponse = {
    hide: vi.fn(() =>
      Promise.resolve({ attached: true, crashed: false, loaded: true, visible: false })
    )
  }
  const api = {
    ready: vi.fn(),
    ack: vi.fn(() => Promise.resolve()),
    getSnapshot: vi.fn(),
    setNavbarHeight: vi.fn(),
    setCollapsed: vi.fn(),
    updateSession: vi.fn(),
    getIntegrationStatuses: vi.fn(() => Promise.resolve([])),
    getDiscordState: vi.fn(() => new Promise<never>(() => undefined)),
    discordCommand: vi.fn(),
    action: vi.fn(() => Promise.resolve()),
    reattachDock: vi.fn(() => Promise.resolve()),
    activateTab: vi.fn(),
    activateLeaf: vi.fn(),
    moveApp: vi.fn(),
    reorderTab: vi.fn(),
    updateRatio: vi.fn(),
    onSnapshotChanged: vi.fn((listener: (snapshot: CommunicationsDockSnapshot) => void) => {
      snapshotListener = listener
      return offSnapshotChanged
    })
  }

  beforeEach(() => {
    current = createSnapshot()
    snapshotListener = null
    managerLifecycle.mounts = 0
    managerLifecycle.unmounts = 0
    sessionCallbacks.clear()
    whatsappHostVisibility.value = false
    vi.clearAllMocks()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      }
    )
    api.ready.mockImplementation(() => Promise.resolve(current))
    api.getSnapshot.mockImplementation(() => Promise.resolve(current))
    api.setNavbarHeight.mockImplementation(() => Promise.resolve(current))
    api.activateTab.mockImplementation(() => Promise.resolve(current))
    api.activateLeaf.mockImplementation(() => Promise.resolve(current))
    api.updateRatio.mockImplementation(() => Promise.resolve(current))
    api.reattachDock.mockImplementation(() => Promise.resolve())
    api.setCollapsed.mockImplementation((request: { collapsed: boolean }) => {
      current = createSnapshot(request.collapsed, current.revision + 1)
      snapshotListener?.(current)
      return Promise.resolve(current)
    })
    api.updateSession.mockImplementation((request: { sessionState: FloatingCommsSessionState }) => {
      current = {
        ...current,
        revision: current.revision + 1,
        sessions: { ...current.sessions, [request.sessionState.appId]: request.sessionState }
      }
      return Promise.resolve(current)
    })
    Object.assign(window, {
      api: {
        whatsappFastResponse: {
          hide: vi.fn(() =>
            Promise.resolve({ attached: true, crashed: false, loaded: true, visible: false })
          ),
          onStateChanged: vi.fn(() => offWhatsAppStateChanged)
        },
        slackFastResponse,
        floatingCommsDock: api
      }
    })
  })

  afterEach(cleanup)

  it('keeps the vacant dock header draggable while tabs and controls remain interactive', async () => {
    render(
      <CommunicationsDockRoot initialSnapshot={current} reportError={vi.fn()} onExit={vi.fn()} />
    )
    await vi.waitFor(() => expect(api.ack).toHaveBeenCalledWith({ generation: 4, revision: 1 }))

    const header = document.querySelector('header')
    const spacer = document.querySelector('[data-communications-dock-drag-spacer]')
    const tablist = screen.getByRole('tablist')
    const tab = screen.getByRole('tab', { name: 'WhatsApp Web, Slack, Discord' })
    if (!(header instanceof HTMLElement) || !(spacer instanceof HTMLElement)) {
      throw new Error('Dock header drag regions were not rendered')
    }
    const tabNoDrag = tablist.closest('[data-no-drag]')
    if (!(tabNoDrag instanceof HTMLElement)) {
      throw new Error('Dock tabs no-drag region was not rendered')
    }

    expect(header.hasAttribute('data-drag-region')).toBe(true)
    expect(spacer.hasAttribute('data-drag-region')).toBe(true)
    expect(spacer.closest('[data-no-drag]')).toBeNull()
    expect(tabNoDrag.hasAttribute('data-no-drag')).toBe(true)
    expect(
      screen.getByRole('button', { name: 'Collapse dock' }).closest('[data-no-drag]')
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Back to panel' }).closest('[data-no-drag]')
    ).toBeTruthy()

    fireEvent.click(tab)
    await vi.waitFor(() =>
      expect(api.activateTab).toHaveBeenCalledWith({ generation: 4, revision: 1, tabId: 'all' })
    )
  })

  it('collapses without unmounting managers and persists later session changes', async () => {
    render(
      <CommunicationsDockRoot initialSnapshot={current} reportError={vi.fn()} onExit={vi.fn()} />
    )
    await vi.waitFor(() => expect(api.ack).toHaveBeenCalledWith({ generation: 4, revision: 1 }))
    expect(managerLifecycle.mounts).toBe(3)
    const managers = Array.from(document.querySelectorAll('[data-manager]'))

    fireEvent.click(screen.getByRole('button', { name: 'Collapse dock' }))
    await vi.waitFor(() => expect(api.setCollapsed).toHaveBeenCalled())
    expect(document.querySelector('main')?.className).toBe('hidden')
    expect(managerLifecycle.mounts).toBe(3)
    expect(managerLifecycle.unmounts).toBe(0)
    expect(managers.every((manager) => manager.isConnected)).toBe(true)

    await act(async () => {
      sessionCallbacks.get('whatsapp-web')?.({
        appId: 'whatsapp-web',
        selectedConversationId: 9,
        draft: 'after collapse'
      })
    })
    await vi.waitFor(() =>
      expect(api.updateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          generation: 4,
          revision: 2,
          sessionState: {
            appId: 'whatsapp-web',
            selectedConversationId: 9,
            draft: 'after collapse'
          }
        })
      )
    )
  })

  it('keeps WhatsApp visible when another leaf is active in the same tab', async () => {
    current = createSnapshot()
    current = {
      ...current,
      layout: {
        ...current.layout,
        tabs: current.layout.tabs.map((tab) => ({ ...tab, activeLeafAppId: 'slack' }))
      }
    }
    render(
      <CommunicationsDockRoot initialSnapshot={current} reportError={vi.fn()} onExit={vi.fn()} />
    )
    await vi.waitFor(() => expect(api.ack).toHaveBeenCalledWith({ generation: 4, revision: 1 }))
    expect(whatsappHostVisibility.value).toBe(true)
  })

  it('renders only the active Discord voice action in the dock header and omits its footer', async () => {
    current = {
      ...current,
      layout: {
        ...current.layout,
        tabs: current.layout.tabs.map((tab) => ({ ...tab, activeLeafAppId: 'discord' }))
      }
    }

    render(
      <CommunicationsDockRoot initialSnapshot={current} reportError={vi.fn()} onExit={vi.fn()} />
    )
    await vi.waitFor(() => expect(api.ack).toHaveBeenCalledWith({ generation: 4, revision: 1 }))

    expect(screen.getByRole('button', { name: 'Voice status' }).closest('header')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open Discord' }).closest('header')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Open Discord' })).toHaveLength(1)
    const actions = screen.getByRole('region', { name: 'Discord controls' })
    expect(actions.className).toContain('overflow-x-auto')
    expect(actions.className).not.toContain('overflow-hidden')
    expect(actions.tabIndex).toBe(0)
    expect(actions.contains(screen.getByRole('button', { name: 'Voice status' }))).toBe(true)
    expect(actions.contains(screen.getByRole('button', { name: 'Open Discord' }))).toBe(true)
    expect(actions.contains(screen.getByRole('button', { name: 'Collapse dock' }))).toBe(false)
    expect(actions.contains(screen.getByRole('button', { name: 'Back to panel' }))).toBe(false)
    expect(actions.firstElementChild?.className).toContain('w-max')
    expect(actions.firstElementChild?.className).toContain('shrink-0')
  })

  it('hides the active Slack host before tab, leaf, split, collapse, and reattach mutations', async () => {
    current = {
      ...current,
      layout: {
        ...current.layout,
        tabs: current.layout.tabs.map((tab) => ({ ...tab, activeLeafAppId: 'slack' }))
      }
    }
    render(
      <CommunicationsDockRoot initialSnapshot={current} reportError={vi.fn()} onExit={vi.fn()} />
    )
    await vi.waitFor(() => expect(api.ack).toHaveBeenCalledWith({ generation: 4, revision: 1 }))

    fireEvent.click(screen.getByRole('tab', { name: 'WhatsApp Web, Slack, Discord' }))
    await vi.waitFor(() => expect(api.activateTab).toHaveBeenCalled())
    expect(slackFastResponse.hide).toHaveBeenCalledBefore(api.activateTab)

    fireEvent.pointerDown(document.querySelector('[data-communications-dock-leaf="slack"]')!)
    await vi.waitFor(() => expect(api.activateLeaf).toHaveBeenCalled())
    expect(slackFastResponse.hide).toHaveBeenCalledBefore(api.activateLeaf)

    const horizontalDivider = screen
      .getAllByRole('separator')
      .find((divider) => divider.getAttribute('aria-orientation') === 'vertical')
    if (!horizontalDivider) {
      throw new Error('Horizontal dock divider was not rendered')
    }
    fireEvent.keyDown(horizontalDivider, { key: 'ArrowRight' })
    await vi.waitFor(() => expect(api.updateRatio).toHaveBeenCalled())
    expect(slackFastResponse.hide).toHaveBeenCalledBefore(api.updateRatio)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse dock' }))
    await vi.waitFor(() => expect(api.setCollapsed).toHaveBeenCalled())
    expect(slackFastResponse.hide).toHaveBeenCalledBefore(api.setCollapsed)

    fireEvent.click(screen.getByRole('button', { name: 'Back to panel' }))
    await vi.waitFor(() => expect(api.reattachDock).toHaveBeenCalled())
    expect(slackFastResponse.hide).toHaveBeenCalledBefore(api.reattachDock)
    expect(window.api.whatsappFastResponse.hide).not.toHaveBeenCalled()
  })

  it('hides WhatsApp only when it owns the active leaf and skips hide without a host', async () => {
    const view = render(
      <CommunicationsDockRoot initialSnapshot={current} reportError={vi.fn()} onExit={vi.fn()} />
    )
    await vi.waitFor(() => expect(api.ack).toHaveBeenCalledWith({ generation: 4, revision: 1 }))

    fireEvent.click(screen.getByRole('tab', { name: 'WhatsApp Web, Slack, Discord' }))
    await vi.waitFor(() => expect(api.activateTab).toHaveBeenCalled())
    expect(window.api.whatsappFastResponse.hide).toHaveBeenCalledOnce()
    expect(slackFastResponse.hide).not.toHaveBeenCalled()

    view.unmount()
    current = createSnapshot(true)
    render(
      <CommunicationsDockRoot initialSnapshot={current} reportError={vi.fn()} onExit={vi.fn()} />
    )
    await vi.waitFor(() => expect(api.ack).toHaveBeenCalledWith({ generation: 4, revision: 1 }))
    fireEvent.click(screen.getByRole('tab', { name: 'WhatsApp Web, Slack, Discord' }))
    await vi.waitFor(() => expect(api.activateTab).toHaveBeenCalledTimes(2))
    expect(window.api.whatsappFastResponse.hide).toHaveBeenCalledOnce()
    expect(slackFastResponse.hide).not.toHaveBeenCalled()
  })

  it('reattaches with the current dock identity after multiple layout revisions', async () => {
    const view = render(
      <CommunicationsDockRoot
        initialSnapshot={current}
        reportError={vi.fn()}
        onExit={() => view.unmount()}
      />
    )
    await vi.waitFor(() => expect(api.ack).toHaveBeenCalledWith({ generation: 4, revision: 1 }))
    current = createSnapshot(false, 8)
    act(() => snapshotListener?.(createSnapshot(false, 2)))
    act(() => snapshotListener?.(createSnapshot(false, 5)))
    act(() => snapshotListener?.(current))
    api.reattachDock.mockRejectedValueOnce(new Error('communications_dock_stale'))
    api.reattachDock.mockResolvedValueOnce(undefined)

    fireEvent.click(screen.getByRole('button', { name: 'Back to panel' }))

    expect(managerLifecycle.unmounts).toBe(3)
    expect(offSnapshotChanged).toHaveBeenCalledOnce()
    expect(offWhatsAppStateChanged).toHaveBeenCalledOnce()
    await vi.waitFor(() => expect(api.reattachDock).toHaveBeenCalledTimes(2))
    expect(api.reattachDock).toHaveBeenNthCalledWith(1, { generation: 4, revision: 8 })
    expect(api.reattachDock).toHaveBeenNthCalledWith(2, { generation: 4, revision: 8 })
  })
})
