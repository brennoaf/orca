// @vitest-environment happy-dom

import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
    storeBox.floatingWorkspaceApps = {}
  })

  it('keeps one controlled popover and reanchors it to the selected button', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => root!.render(<Harness panel={container!} />))
    expect(container.querySelectorAll('[data-testid="popover-root"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-testid="popover-anchor"]')).toHaveLength(0)

    const slack = container.querySelector('button[aria-label^="Slack"]') as HTMLButtonElement
    act(() => slack.click())
    expect(container.querySelectorAll('[data-testid="popover-anchor"]')).toHaveLength(1)
    expect(
      Array.from(
        (container.querySelector('button[aria-label^="Slack"]') as HTMLButtonElement).children
      ).some((child) => child.classList.contains('w-[2px]'))
    ).toBe(true)
    expect(
      Array.from(
        (container.querySelector('button[aria-label^="Discord"]') as HTMLButtonElement).children
      ).some((child) => child.classList.contains('w-[2px]'))
    ).toBe(false)
    expect(
      container.querySelector('[data-testid="popover-anchor"] button')?.getAttribute('aria-label')
    ).toMatch(/^Slack/)

    const discord = container.querySelector('button[aria-label^="Discord"]') as HTMLButtonElement
    act(() => discord.click())
    expect(container.querySelectorAll('[data-testid="popover-anchor"]')).toHaveLength(1)
    expect(
      Array.from(
        (container.querySelector('button[aria-label^="Slack"]') as HTMLButtonElement).children
      ).some((child) => child.classList.contains('w-[2px]'))
    ).toBe(false)
    expect(
      Array.from(
        (container.querySelector('button[aria-label^="Discord"]') as HTMLButtonElement).children
      ).some((child) => child.classList.contains('w-[2px]'))
    ).toBe(true)
    expect(
      container.querySelector('[data-testid="popover-anchor"] button')?.getAttribute('aria-label')
    ).toMatch(/^Discord/)

    const selectedDiscord = container.querySelector(
      'button[aria-label^="Discord"]'
    ) as HTMLButtonElement
    act(() => selectedDiscord.click())
    expect(container.querySelectorAll('[data-testid="popover-anchor"]')).toHaveLength(0)
  })

  it('closes the popover and releases the input lock when the selected app is disabled', () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => root!.render(<Harness panel={container!} />))
    const discord = container.querySelector('button[aria-label^="Discord"]') as HTMLButtonElement
    act(() => discord.click())
    expect(container.querySelector('[data-testid="popover-root"]')?.getAttribute('data-open')).toBe(
      'true'
    )
    expect(
      container.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('true')

    storeBox.floatingWorkspaceApps = {
      'whatsapp-web': { enabled: false },
      slack: { enabled: false },
      discord: { enabled: false }
    }
    act(() => root!.render(<Harness panel={container!} />))

    expect(container.querySelector('button[aria-label^="Discord"]')).toBeNull()
    expect(container.querySelector('[data-testid="popover-root"]')).toBeNull()
    expect(container.querySelectorAll('[data-testid="popover-content"]')).toHaveLength(0)
    expect(
      container.querySelector('[data-testid="webview-input"]')?.getAttribute('data-input-locked')
    ).toBe('false')
  })

  it('renders nothing when every catalog app is disabled', () => {
    storeBox.floatingWorkspaceApps = {
      'whatsapp-web': { enabled: false },
      slack: { enabled: false },
      discord: { enabled: false }
    }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    act(() => root!.render(<Harness panel={container!} />))
    expect(container.querySelector('[data-testid="popover-root"]')).toBeNull()
  })
})
