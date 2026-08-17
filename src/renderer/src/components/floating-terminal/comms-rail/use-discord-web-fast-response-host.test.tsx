// @vitest-environment happy-dom

import { act } from 'react'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiscordWebFastResponseStateChanged } from '../../../../../shared/discord-web-fast-response'
import {
  useDiscordWebFastResponseHost,
  type DiscordWebFastResponseHostBinding
} from './use-discord-web-fast-response-host'

const snapshot = {
  attached: true,
  contentMode: 'ready' as const,
  crashed: false,
  loaded: true,
  visible: true
}

function binding(visible = true): DiscordWebFastResponseHostBinding {
  return {
    identity: {
      target: 'dock',
      appId: 'discord',
      generation: 4,
      revision: 7,
      tabId: 'tab',
      activeLeafAppId: 'discord'
    },
    visible
  }
}

describe('useDiscordWebFastResponseHost', () => {
  let stateChanged: ((event: DiscordWebFastResponseStateChanged) => void) | null
  const api = {
    attach: vi.fn(() => Promise.resolve(snapshot)),
    updateBounds: vi.fn(() => Promise.resolve(snapshot)),
    show: vi.fn(() => Promise.resolve(snapshot)),
    hide: vi.fn(() => Promise.resolve({ ...snapshot, visible: false })),
    onStateChanged: vi.fn((callback: (event: DiscordWebFastResponseStateChanged) => void) => {
      stateChanged = callback
      return vi.fn()
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    stateChanged = null
    Object.defineProperties(window, {
      innerHeight: { configurable: true, value: 600 },
      innerWidth: { configurable: true, value: 800 }
    })
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      }
    )
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      }
    )
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    Object.assign(window, {
      api: {
        ui: { getZoomLevel: vi.fn(() => 0) },
        discordWebFastResponse: api
      }
    })
  })

  it('attaches once and uses explicit hide and show around visibility changes', async () => {
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 18, 300, 240))
    const visibleBinding = binding(true)
    const hiddenBinding = binding(false)
    const view = renderHook(
      ({ visible }) =>
        useDiscordWebFastResponseHost({
          binding: visible ? visibleBinding : hiddenBinding,
          element
        }),
      {
        initialProps: { visible: true }
      }
    )
    await act(async () => undefined)
    expect(api.attach).toHaveBeenCalledOnce()

    view.rerender({ visible: false })
    await act(async () => undefined)
    expect(api.hide).toHaveBeenCalledOnce()

    view.rerender({ visible: true })
    await act(async () => undefined)
    expect(api.show).toHaveBeenCalledOnce()
    expect(api.updateBounds).toHaveBeenCalledOnce()
    expect(api.attach).toHaveBeenCalledOnce()
    view.unmount()
  })

  it('accepts state only for the current owner identity', async () => {
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 18, 300, 240))
    const currentBinding = binding()
    const view = renderHook(() =>
      useDiscordWebFastResponseHost({ binding: currentBinding, element })
    )
    await act(async () => undefined)
    act(() =>
      stateChanged?.({
        contentMode: 'ready',
        identity: currentBinding.identity,
        state: 'crashed',
        recoverable: false
      })
    )
    expect(view.result.current).toEqual({ kind: 'crashed' })
    act(() =>
      stateChanged?.({
        contentMode: 'ready',
        identity: {
          target: 'dock',
          appId: 'discord',
          generation: 4,
          revision: 8,
          tabId: 'tab',
          activeLeafAppId: 'discord'
        },
        state: 'ready',
        recoverable: false
      })
    )
    expect(view.result.current).toEqual({ kind: 'crashed' })
    view.unmount()
  })

  it('reattaches once after a recoverable crash while visible', async () => {
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 18, 300, 240))
    const currentBinding = binding(true)
    const view = renderHook(() =>
      useDiscordWebFastResponseHost({ binding: currentBinding, element })
    )
    await act(async () => undefined)

    await act(async () => {
      stateChanged?.({
        contentMode: 'ready',
        identity: currentBinding.identity,
        state: 'crashed',
        recoverable: true
      })
    })

    expect(api.attach).toHaveBeenCalledTimes(2)
    await act(async () => {
      stateChanged?.({
        contentMode: 'ready',
        identity: currentBinding.identity,
        state: 'crashed',
        recoverable: true
      })
    })
    expect(api.attach).toHaveBeenCalledTimes(2)
    view.unmount()
  })

  it('does not recover a crashed hidden owner', async () => {
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 18, 300, 240))
    const visibleBinding = binding(true)
    const hiddenBinding = binding(false)
    const view = renderHook(
      ({ visible }) =>
        useDiscordWebFastResponseHost({
          binding: visible ? visibleBinding : hiddenBinding,
          element
        }),
      { initialProps: { visible: true } }
    )
    await act(async () => undefined)
    view.rerender({ visible: false })
    await act(async () => undefined)

    await act(async () => {
      stateChanged?.({
        contentMode: 'ready',
        identity: hiddenBinding.identity,
        state: 'crashed',
        recoverable: true
      })
    })

    expect(api.attach).toHaveBeenCalledOnce()
    view.unmount()
  })
})
