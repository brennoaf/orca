// @vitest-environment happy-dom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FloatingWorkspaceAppId } from '../../../../../shared/floating-workspace-apps'
import { FloatingCommsRail } from './FloatingCommsRail'

const storeBox = vi.hoisted(() => ({ floatingWorkspaceApps: {} }))

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

function Harness({ panel }: { panel: HTMLDivElement }): React.JSX.Element {
  const [openAppId, setOpenAppId] = useState<FloatingWorkspaceAppId | null>(null)
  return (
    <>
      <div data-testid="webview-input" data-input-locked={openAppId !== null} />
      <FloatingCommsRail
        panelRef={{ current: panel }}
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
  let notifyClosed: (() => void) | null = null
  let notifyFallback: ((appId: FloatingWorkspaceAppId) => void) | null = null
  let releaseClosed: ReturnType<typeof vi.fn>
  let releaseAction: ReturnType<typeof vi.fn>
  let releaseFallback: ReturnType<typeof vi.fn>

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
    notifyClosed = null
    notifyFallback = null
    storeBox.floatingWorkspaceApps = {}
  })

  beforeEach(() => {
    releaseClosed = vi.fn()
    releaseAction = vi.fn()
    releaseFallback = vi.fn()
    Object.assign(window, {
      api: {
        floatingComms: {
          open: vi.fn(() => Promise.resolve({ mode: 'dom' })),
          update: vi.fn(() => Promise.resolve({ mode: 'window' as const })),
          close: vi.fn(() => Promise.resolve()),
          onClosed: vi.fn((callback: () => void) => {
            notifyClosed = callback
            return releaseClosed
          }),
          onFallback: vi.fn((callback: (appId: FloatingWorkspaceAppId) => void) => {
            notifyFallback = callback
            return releaseFallback
          }),
          onAction: vi.fn(() => releaseAction)
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

    act(() => notifyClosed?.())
    expect(
      panel.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('false')
    act(() => root?.unmount())
    root = null
    expect(releaseClosed).toHaveBeenCalledOnce()
    expect(releaseAction).toHaveBeenCalledOnce()
    expect(releaseFallback).toHaveBeenCalledOnce()
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
    act(() => notifyFallback?.('discord'))

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

  it('ignores a fallback event for a stale app request', async () => {
    const floatingComms = window.api.floatingComms
    if (!floatingComms) {
      throw new Error('Floating communications API is unavailable')
    }
    vi.mocked(floatingComms.open).mockResolvedValue({ mode: 'window' })
    const panel = mountHarness()

    await act(async () => railButton(panel, 'Slack').click())
    act(() => notifyFallback?.('discord'))

    expect(panel.querySelectorAll('[data-testid="popover-content"]')).toHaveLength(0)
  })
})
