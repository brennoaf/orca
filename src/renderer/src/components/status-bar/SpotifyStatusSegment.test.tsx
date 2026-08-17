// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SpotifyPlaybackSnapshot } from '../../../../shared/spotify-playback'
import { SpotifyStatusSegment } from './SpotifyStatusSegment'

const state = vi.hoisted(() => ({
  menuOpen: false,
  pending: false,
  audioLevel: null as number | null,
  command: vi.fn(),
  snapshot: null as SpotifyPlaybackSnapshot | null
}))

vi.mock('./useSpotifyPlayback', () => ({
  useSpotifyPlayback: () => ({
    snapshot: state.snapshot,
    pending: state.pending,
    command: state.command,
    audioLevel: state.audioLevel
  })
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children?: ReactNode }) => <span>{children}</span>
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children?: ReactNode }) =>
    state.menuOpen ? <div data-testid="spotify-menu">{children}</div> : null,
  DropdownMenuGroup: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
    ...props
  }: {
    children?: ReactNode
    disabled?: boolean
    onSelect?: (event: { preventDefault: () => void }) => void
    'aria-label'?: string
    className?: string
  }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect?.({ preventDefault: vi.fn() })}
      {...props}
    >
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children }: { children?: ReactNode }) => <div>{children}</div>
}))

const PLAYING: SpotifyPlaybackSnapshot = {
  status: 'playing',
  sessionId: 'spotify-session',
  revision: 4,
  item: {
    title: 'Track Name',
    artists: ['Artist'],
    album: 'Album Name',
    artworkDataUrl: 'data:image/png;base64,AAAA',
    positionMs: 61_000,
    durationMs: 185_000
  },
  capabilities: { previous: true, togglePlayPause: true, next: true },
  errorCode: null
}

let container: HTMLDivElement
let root: Root
let nextFrame = 0
let frames = new Map<number, FrameRequestCallback>()

async function render(compact = false, iconOnly = false): Promise<void> {
  await act(async () => root.render(<SpotifyStatusSegment compact={compact} iconOnly={iconOnly} />))
}

describe('SpotifyStatusSegment', () => {
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    state.menuOpen = false
    state.pending = false
    state.audioLevel = null
    state.command.mockReset()
    state.snapshot = PLAYING
    nextFrame = 0
    frames = new Map()
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        nextFrame += 1
        frames.set(nextFrame, callback)
        return nextFrame
      })
    )
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((frame: number) => frames.delete(frame))
    )
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }))
    )
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it.each(['unsupported', 'no-session', 'stopped', 'error'] as const)(
    'renders nothing for %s without a valid active item',
    async (status) => {
      state.snapshot = { ...PLAYING, status, item: null }
      await render()
      expect(container.textContent).toBe('')
    }
  )

  it.each([
    [false, false],
    [true, false],
    [true, true]
  ])('keeps only the wave and three controls collapsed', async (compact, iconOnly) => {
    await render(compact, iconOnly)
    expect(container.querySelector('[data-spotify-wave]')).not.toBeNull()
    expect(container.querySelectorAll('button')).toHaveLength(4)
    expect(container.querySelector('[aria-label="Previous"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Pause"]')).not.toBeNull()
    expect(container.querySelector('[aria-label="Next"]')).not.toBeNull()
    expect(container.textContent).not.toContain('Track Name')
    expect(container.textContent).not.toContain('Artist')
    expect(container.textContent).not.toContain('Album Name')
  })

  it('shows complete metadata, progress, artwork and controls when expanded', async () => {
    state.menuOpen = true
    await render()
    const menu = container.querySelector('[data-testid="spotify-menu"]')
    expect(menu?.textContent).toContain('Spotify')
    expect(menu?.textContent).toContain('Track Name')
    expect(menu?.textContent).toContain('Artist')
    expect(menu?.textContent).toContain('Album Name')
    expect(menu?.textContent).toContain('1:01')
    expect(menu?.textContent).toContain('3:05')
    expect(menu?.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA')
    expect(menu?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuetext')).toBe(
      '1:01 of 3:05'
    )
    expect(menu?.querySelectorAll('button')).toHaveLength(3)
  })

  it('disables each transport by capability and disables all while pending', async () => {
    state.snapshot = {
      ...PLAYING,
      capabilities: { previous: false, togglePlayPause: true, next: false }
    }
    await render()
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Previous"]')?.disabled).toBe(
      true
    )
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Pause"]')?.disabled).toBe(false)
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Next"]')?.disabled).toBe(true)
    state.pending = true
    await render()
    for (const control of container.querySelectorAll<HTMLButtonElement>(
      'button:not([aria-label="Open Spotify player"])'
    )) {
      expect(control.disabled).toBe(true)
    }
  })

  it('updates wave bars through animation-frame styles for distinct audio levels', async () => {
    state.audioLevel = 0.8
    await render()
    for (const callback of Array.from(frames.values())) {
      callback(100)
    }
    const bar = container.querySelector<HTMLElement>('[data-spotify-wave] span')
    const high = bar?.style.height
    state.audioLevel = 0.1
    await render()
    for (const callback of Array.from(frames.values())) {
      callback(200)
    }
    expect(bar?.style.height).not.toBe(high)
  })
})
