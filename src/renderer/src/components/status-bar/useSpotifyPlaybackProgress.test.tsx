// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSpotifyPlaybackProgress } from './useSpotifyPlaybackProgress'

let now = 0
let nextFrame = 0
let frames = new Map<number, FrameRequestCallback>()

describe('useSpotifyPlaybackProgress', () => {
  beforeEach(() => {
    now = 0
    nextFrame = 0
    frames = new Map()
    vi.spyOn(performance, 'now').mockImplementation(() => now)
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
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  afterEach(() => vi.restoreAllMocks())

  it('interpolates, clamps, reanchors for seeks and stops while hidden', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ positionMs, durationMs, playing }) =>
        useSpotifyPlaybackProgress({ positionMs, durationMs, playing }),
      { initialProps: { positionMs: 1_000, durationMs: 2_000, playing: true } }
    )
    const fill = document.createElement('div')
    const bar = document.createElement('div')
    result.current.fillRef.current = fill
    result.current.progressBarRef.current = bar
    now = 500
    await act(async () => frames.values().next().value?.(now))
    expect(fill.style.width).toBe('75%')
    expect(bar.getAttribute('aria-valuenow')).toBe('1500')
    now = 1_500
    await act(async () => frames.values().next().value?.(now))
    expect(fill.style.width).toBe('100%')
    rerender({ positionMs: 200, durationMs: 2_000, playing: true })
    now = 1_600
    await act(async () => frames.values().next().value?.(now))
    expect(fill.style.width).toBe('15%')
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(cancelAnimationFrame).toHaveBeenCalled()
    unmount()
  })
})
