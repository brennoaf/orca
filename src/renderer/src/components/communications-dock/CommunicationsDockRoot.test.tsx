// @vitest-environment happy-dom

import { act, useEffect, useRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunicationsDockSnapshot } from '../../../../shared/communications-dock'
import type { FloatingCommsSessionState } from '../../../../shared/floating-comms-surface'
import { CommunicationsDockRoot } from './CommunicationsDockRoot'

const managerLifecycle = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }))
const sessionCallbacks = new Map<string, (sessionState: FloatingCommsSessionState) => void>()

function MockPresentation({
  initialSessionState,
  onSessionStateChange,
  children
}: {
  initialSessionState?: FloatingCommsSessionState
  onSessionStateChange?: (sessionState: FloatingCommsSessionState) => void
  children: (presentation: {
    status: { kind: 'idle' }
    tooltip: string
    content: React.ReactNode
    sessionState: FloatingCommsSessionState
  }) => React.ReactNode
}): React.JSX.Element {
  const sessionState = initialSessionState ?? { appId: 'discord' }
  const appIdRef = useRef(sessionState.appId)
  const callbackRef = useRef(onSessionStateChange)
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
        sessionState
      })}
    </>
  )
}

vi.mock('@/components/floating-terminal/comms-rail/communication-managers', () => ({
  LOCAL_Z_API_COMMUNICATION_MANAGER_CLIENT: {},
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
      return vi.fn()
    })
  }

  beforeEach(() => {
    current = createSnapshot()
    snapshotListener = null
    managerLifecycle.mounts = 0
    managerLifecycle.unmounts = 0
    sessionCallbacks.clear()
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
        floatingCommsDock: api
      }
    })
  })

  afterEach(cleanup)

  it('collapses without unmounting managers and persists later session changes', async () => {
    render(<CommunicationsDockRoot initialSnapshot={current} reportError={vi.fn()} />)
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
})
