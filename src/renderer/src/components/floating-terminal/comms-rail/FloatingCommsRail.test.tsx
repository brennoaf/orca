// @vitest-environment happy-dom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  FloatingCommsAction,
  FloatingCommsGeometryRequest,
  FloatingCommsSurfaceIdentity
} from '../../../../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../../../../shared/floating-workspace-apps'
import { FloatingCommsRail } from './FloatingCommsRail'

const storeBox = vi.hoisted(() => ({ floatingWorkspaceApps: {} }))
const defaultWorkspaceBounds = { left: 100, top: 80, width: 800, height: 500 }

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
  PopoverAnchor: ({ children }: { children: React.ReactNode }) => (
    <span data-testid="popover-anchor">{children}</span>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  )
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>
}))

function Harness({
  panel,
  workspaceBounds = defaultWorkspaceBounds
}: {
  panel: HTMLDivElement
  workspaceBounds?: { left: number; top: number; width: number; height: number }
}): React.JSX.Element {
  const [openAppId, setOpenAppId] = useState<FloatingWorkspaceAppId | null>(null)
  return (
    <>
      <div data-testid="webview-input" data-input-locked={openAppId !== null} />
      <FloatingCommsRail
        panelRef={{ current: panel }}
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
  let container: HTMLDivElement | null = null
  let notifyClosed: ((identity: FloatingCommsSurfaceIdentity) => void) | null = null
  let notifyFallback: ((identity: FloatingCommsSurfaceIdentity) => void) | null = null
  let notifyGeometry: ((request: FloatingCommsGeometryRequest) => void) | null = null
  let notifyAction: ((action: FloatingCommsAction) => void) | null = null
  let releaseClosed: ReturnType<typeof vi.fn>
  let releaseAction: ReturnType<typeof vi.fn>
  let releaseFallback: ReturnType<typeof vi.fn>
  let releaseGeometry: ReturnType<typeof vi.fn>

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
    notifyClosed = null
    notifyFallback = null
    notifyGeometry = null
    notifyAction = null
    storeBox.floatingWorkspaceApps = {}
  })

  beforeEach(() => {
    releaseClosed = vi.fn()
    releaseAction = vi.fn()
    releaseFallback = vi.fn()
    releaseGeometry = vi.fn()
    Object.assign(window, {
      api: {
        floatingComms: {
          open: vi.fn(() => Promise.resolve({ mode: 'dom' })),
          update: vi.fn(() => Promise.resolve({ mode: 'window' as const })),
          close: vi.fn(() => Promise.resolve()),
          onClosed: vi.fn((callback: (identity: FloatingCommsSurfaceIdentity) => void) => {
            notifyClosed = callback
            return releaseClosed
          }),
          onFallback: vi.fn((callback: (identity: FloatingCommsSurfaceIdentity) => void) => {
            notifyFallback = callback
            return releaseFallback
          }),
          onGeometryRequested: vi.fn(
            (callback: (request: FloatingCommsGeometryRequest) => void) => {
              notifyGeometry = callback
              return releaseGeometry
            }
          ),
          onAction: vi.fn((callback: (action: FloatingCommsAction) => void) => {
            notifyAction = callback
            return releaseAction
          })
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

  function mountHarness(): HTMLDivElement {
    const panel = document.createElement('div')
    container = panel
    document.body.appendChild(panel)
    const mountedRoot = createRoot(panel)
    root = mountedRoot
    act(() => mountedRoot.render(<Harness panel={panel} />))
    return panel
  }

  function railButton(panel: HTMLDivElement, label: string): HTMLButtonElement {
    const button = panel.querySelector(`button[aria-label^="${label}"]`)
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`${label} rail button was not rendered`)
    }
    return button
  }

  it('keeps one controlled popover and reanchors it to the selected button', async () => {
    const panel = mountHarness()
    expect(panel.querySelectorAll('[data-testid="popover-root"]')).toHaveLength(1)
    expect(panel.querySelectorAll('[data-testid="popover-anchor"]')).toHaveLength(0)

    const slack = railButton(panel, 'Slack')
    await act(async () => slack.click())
    expect(panel.querySelectorAll('[data-testid="popover-anchor"]')).toHaveLength(1)
    expect(
      Array.from(railButton(panel, 'Slack').children).some((child) =>
        child.classList.contains('w-[2px]')
      )
    ).toBe(true)
    expect(
      Array.from(railButton(panel, 'Discord').children).some((child) =>
        child.classList.contains('w-[2px]')
      )
    ).toBe(false)
    expect(
      panel.querySelector('[data-testid="popover-anchor"] button')?.getAttribute('aria-label')
    ).toMatch(/^Slack/)

    const discord = railButton(panel, 'Discord')
    await act(async () => discord.click())
    expect(panel.querySelectorAll('[data-testid="popover-anchor"]')).toHaveLength(1)
    expect(
      Array.from(railButton(panel, 'Slack').children).some((child) =>
        child.classList.contains('w-[2px]')
      )
    ).toBe(false)
    expect(
      Array.from(railButton(panel, 'Discord').children).some((child) =>
        child.classList.contains('w-[2px]')
      )
    ).toBe(true)
    expect(
      panel.querySelector('[data-testid="popover-anchor"] button')?.getAttribute('aria-label')
    ).toMatch(/^Discord/)

    const selectedDiscord = railButton(panel, 'Discord')
    await act(async () => selectedDiscord.click())
    expect(panel.querySelectorAll('[data-testid="popover-anchor"]')).toHaveLength(0)
  })

  it('closes the popover and releases the input lock when the selected app is disabled', async () => {
    const panel = mountHarness()
    const discord = railButton(panel, 'Discord')
    await act(async () => discord.click())
    expect(panel.querySelector('[data-testid="popover-root"]')?.getAttribute('data-open')).toBe(
      'true'
    )
    expect(
      panel.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('true')

    storeBox.floatingWorkspaceApps = {
      'whatsapp-web': { enabled: false },
      slack: { enabled: false },
      discord: { enabled: false }
    }
    act(() => root?.render(<Harness panel={panel} />))

    expect(panel.querySelector('button[aria-label^="Discord"]')).toBeNull()
    expect(panel.querySelector('[data-testid="popover-root"]')).toBeNull()
    expect(panel.querySelectorAll('[data-testid="popover-content"]')).toHaveLength(0)
    expect(
      panel.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('false')
  })

  it('renders nothing when every catalog app is disabled', () => {
    storeBox.floatingWorkspaceApps = {
      'whatsapp-web': { enabled: false },
      slack: { enabled: false },
      discord: { enabled: false }
    }
    const panel = mountHarness()
    expect(panel.querySelector('[data-testid="popover-root"]')).toBeNull()
  })

  it('keeps webview input locked for the native surface and cleans IPC listeners', async () => {
    const floatingComms = window.api.floatingComms
    if (!floatingComms) {
      throw new Error('Floating communications API is unavailable')
    }
    vi.mocked(floatingComms.open).mockResolvedValue({ mode: 'window' })
    const panel = document.createElement('div')
    container = panel
    document.body.appendChild(panel)
    root = createRoot(panel)

    act(() => root?.render(<Harness panel={panel} />))
    const discord = panel.querySelector('button[aria-label^="Discord"]')
    if (!(discord instanceof HTMLButtonElement)) {
      throw new Error('Discord rail button was not rendered')
    }
    await act(async () => discord.click())
    expect(
      panel.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('true')
    expect(panel.querySelectorAll('[data-testid="popover-content"]')).toHaveLength(0)

    act(() => notifyClosed?.({ appId: 'discord', requestId: 1 }))
    expect(
      panel.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('false')
    act(() => root?.unmount())
    root = null
    expect(releaseClosed).toHaveBeenCalledOnce()
    expect(releaseAction).toHaveBeenCalledOnce()
    expect(releaseFallback).toHaveBeenCalledOnce()
    expect(releaseGeometry).toHaveBeenCalled()
  })

  it('answers only the current native geometry request after layout', async () => {
    const floatingComms = window.api.floatingComms
    if (!floatingComms) {
      throw new Error('Floating communications API is unavailable')
    }
    vi.mocked(floatingComms.open).mockResolvedValue({ mode: 'window' })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    const panel = mountHarness()
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(new DOMRect(240, 120, 700, 480))
    await act(async () => railButton(panel, 'Discord').click())
    vi.mocked(floatingComms.update).mockClear()

    act(() => notifyGeometry?.({ appId: 'discord', requestId: 1, geometryRequestId: 7 }))

    expect(floatingComms.update).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'discord',
        requestId: 1,
        geometryRequestId: 7,
        workspace: { x: 240, y: 120, width: 700, height: 480 }
      })
    )
    vi.mocked(floatingComms.update).mockClear()

    act(() => notifyGeometry?.({ appId: 'discord', requestId: 2, geometryRequestId: 8 }))

    expect(floatingComms.update).not.toHaveBeenCalled()
  })

  it('uses the DOM surface when a stale preload lacks floating communications IPC', async () => {
    Object.assign(window.api, { floatingComms: undefined })
    const panel = document.createElement('div')
    container = panel
    document.body.appendChild(panel)
    root = createRoot(panel)

    act(() => root?.render(<Harness panel={panel} />))
    const slack = panel.querySelector('button[aria-label^="Slack"]')
    if (!(slack instanceof HTMLButtonElement)) {
      throw new Error('Slack rail button was not rendered')
    }
    await act(async () => slack.click())
    expect(panel.querySelectorAll('[data-testid="popover-content"]')).toHaveLength(1)
  })

  it('keeps input locked when native repositioning activates the DOM fallback', async () => {
    const floatingComms = window.api.floatingComms
    if (!floatingComms) {
      throw new Error('Floating communications API is unavailable')
    }
    vi.mocked(floatingComms.open).mockResolvedValue({ mode: 'window' })
    const panel = mountHarness()

    await act(async () => railButton(panel, 'Discord').click())
    expect(panel.querySelectorAll('[data-testid="popover-content"]')).toHaveLength(0)
    act(() => notifyFallback?.({ appId: 'discord', requestId: 1 }))

    expect(panel.querySelectorAll('[data-testid="popover-content"]')).toHaveLength(1)
    expect(
      panel.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('true')
  })

  it('materializes fallback after a native update reports lost placement', async () => {
    const floatingComms = window.api.floatingComms
    if (!floatingComms) {
      throw new Error('Floating communications API is unavailable')
    }
    vi.mocked(floatingComms.open).mockResolvedValue({ mode: 'window' })
    const panel = mountHarness()

    await act(async () => railButton(panel, 'Discord').click())
    expect(panel.querySelectorAll('[data-testid="popover-content"]')).toHaveLength(0)
    vi.mocked(floatingComms.update).mockResolvedValueOnce({ mode: 'dom' })
    await act(async () => window.dispatchEvent(new Event('resize')))

    expect(panel.querySelectorAll('[data-testid="popover-content"]')).toHaveLength(1)
    expect(
      panel.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('true')
  })

  it('updates native placement when the workspace moves internally', async () => {
    const floatingComms = window.api.floatingComms
    if (!floatingComms) {
      throw new Error('Floating communications API is unavailable')
    }
    vi.mocked(floatingComms.open).mockResolvedValue({ mode: 'window' })
    const panel = mountHarness()
    await act(async () => railButton(panel, 'Discord').click())
    vi.mocked(floatingComms.update).mockClear()
    const movedBounds = { left: 240, top: 120, width: 700, height: 480 }
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(new DOMRect(240, 120, 700, 480))

    act(() => root?.render(<Harness panel={panel} workspaceBounds={movedBounds} />))

    expect(floatingComms.update).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'discord',
        requestId: 1,
        workspace: { x: 240, y: 120, width: 700, height: 480 }
      })
    )
  })

  it('ignores a fallback event for a stale app request', async () => {
    const floatingComms = window.api.floatingComms
    if (!floatingComms) {
      throw new Error('Floating communications API is unavailable')
    }
    vi.mocked(floatingComms.open).mockResolvedValue({ mode: 'window' })
    const panel = mountHarness()

    await act(async () => railButton(panel, 'Slack').click())
    act(() => notifyFallback?.({ appId: 'discord', requestId: 1 }))

    expect(panel.querySelectorAll('[data-testid="popover-content"]')).toHaveLength(0)
  })

  it('ignores a closed event from the previous request after switching apps', async () => {
    const floatingComms = window.api.floatingComms
    if (!floatingComms) {
      throw new Error('Floating communications API is unavailable')
    }
    vi.mocked(floatingComms.open).mockResolvedValue({ mode: 'window' })
    const panel = mountHarness()

    await act(async () => railButton(panel, 'Slack').click())
    await act(async () => railButton(panel, 'Discord').click())
    act(() => notifyClosed?.({ appId: 'slack', requestId: 1 }))
    expect(
      panel.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('true')
    expect(
      Array.from(railButton(panel, 'Discord').children).some((child) =>
        child.classList.contains('w-[2px]')
      )
    ).toBe(true)
  })

  it('ignores an action from the previous request after switching apps', async () => {
    const floatingComms = window.api.floatingComms
    if (!floatingComms) {
      throw new Error('Floating communications API is unavailable')
    }
    vi.mocked(floatingComms.open).mockResolvedValue({ mode: 'window' })
    const panel = mountHarness()

    await act(async () => railButton(panel, 'Slack').click())
    await act(async () => railButton(panel, 'Discord').click())
    act(() => notifyAction?.({ type: 'open-app', appId: 'slack', requestId: 1 }))

    expect(
      panel.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('true')
    expect(
      Array.from(railButton(panel, 'Discord').children).some((child) =>
        child.classList.contains('w-[2px]')
      )
    ).toBe(true)
  })
})
