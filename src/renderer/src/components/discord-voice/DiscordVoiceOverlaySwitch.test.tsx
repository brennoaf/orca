// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DiscordVoiceOverlaySwitch } from './DiscordVoiceOverlaySwitch'

const runtime = vi.hoisted(() => ({
  calls: [] as string[],
  open: true
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: vi.fn((target: unknown, method: string) => {
    void target
    runtime.calls.push(method)
    if (method === 'discordVoice.closeOverlay') {
      runtime.open = false
    }
    if (method === 'discordVoice.openOverlay') {
      runtime.open = true
    }
    return Promise.resolve({ open: runtime.open })
  })
}))

describe('DiscordVoiceOverlaySwitch', () => {
  let root: Root | null = null
  let container: HTMLDivElement | null = null

  afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    root = null
    container = null
    runtime.calls = []
    runtime.open = true
    vi.useRealTimers()
  })

  it('reads the real state after commands and after an external window close', async () => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    await act(async () => {
      root!.render(<DiscordVoiceOverlaySwitch />)
      await Promise.resolve()
    })
    const toggle = container.querySelector('[role="switch"]') as HTMLButtonElement
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    await act(async () => {
      toggle.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(runtime.calls.slice(-2)).toEqual([
      'discordVoice.closeOverlay',
      'discordVoice.getOverlayState'
    ])
    expect(toggle.getAttribute('aria-checked')).toBe('false')

    runtime.open = true
    await act(async () => {
      vi.advanceTimersByTime(1_000)
      await Promise.resolve()
    })
    expect(toggle.getAttribute('aria-checked')).toBe('true')

    runtime.open = false
    await act(async () => {
      vi.advanceTimersByTime(1_000)
      await Promise.resolve()
    })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
  })
})
