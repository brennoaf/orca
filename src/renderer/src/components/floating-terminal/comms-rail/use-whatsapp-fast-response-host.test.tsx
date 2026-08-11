// @vitest-environment happy-dom

import { act } from 'react'
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  WhatsAppFastResponseSnapshot,
  WhatsAppFastResponseStateChanged
} from '../../../../../shared/whatsapp-fast-response'
import {
  useWhatsAppFastResponseHost,
  type WhatsAppFastResponseHostBinding
} from './use-whatsapp-fast-response-host'

const snapshot: WhatsAppFastResponseSnapshot = {
  attention: { hasUnread: false },
  attached: true,
  crashed: false,
  loaded: false,
  visible: true
}

function dockBinding(revision = 1, visible = true): WhatsAppFastResponseHostBinding {
  return {
    identity: {
      target: 'dock',
      appId: 'whatsapp-web',
      generation: 4,
      revision,
      tabId: 'all',
      activeLeafAppId: 'whatsapp-web'
    },
    visible
  }
}

describe('useWhatsAppFastResponseHost', () => {
  let resize: (() => void) | null
  let stateChanged: ((event: WhatsAppFastResponseStateChanged) => void) | null
  let rect: DOMRect
  const api = {
    attach: vi.fn(() => Promise.resolve(snapshot)),
    updateBounds: vi.fn(() => Promise.resolve(snapshot)),
    show: vi.fn(() => Promise.resolve(snapshot)),
    hide: vi.fn(() => Promise.resolve({ ...snapshot, visible: false })),
    collapse: vi.fn(() => Promise.resolve({ ...snapshot, visible: false })),
    onStateChanged: vi.fn((callback: (event: WhatsAppFastResponseStateChanged) => void) => {
      stateChanged = callback
      return vi.fn()
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    resize = null
    stateChanged = null
    rect = new DOMRect(12, 18, 300, 240)
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback
        }
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
        ui: { getZoomLevel: vi.fn(() => 1) },
        whatsappFastResponse: api
      }
    })
  })

  it('publishes body geometry once, uses renderer zoom and accepts owner-scoped state', async () => {
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect)
    const binding = dockBinding()
    const view = renderHook(() => useWhatsAppFastResponseHost({ binding, element }))
    await act(async () => undefined)

    expect(api.attach).toHaveBeenCalledWith({
      ...binding.identity,
      rectCss: { x: 12, y: 18, width: 300, height: 240 },
      rendererZoomFactor: 1.2
    })
    act(() => resize?.())
    expect(api.updateBounds).not.toHaveBeenCalled()

    rect = new DOMRect(12, 18, 320, 240)
    act(() => resize?.())
    await act(async () => undefined)
    expect(api.updateBounds).toHaveBeenCalledOnce()

    act(() => stateChanged?.({ identity: binding.identity, state: 'ready', recoverable: true }))
    expect(view.result.current).toEqual({ kind: 'ready' })
    act(() =>
      stateChanged?.({
        identity: dockBinding(2).identity,
        state: 'crashed',
        recoverable: false
      })
    )
    expect(view.result.current).toEqual({ kind: 'ready' })
    view.unmount()
    expect(api.hide).toHaveBeenCalledWith(binding.identity)
  })

  it('applies an immediately resolved initial snapshot before passive subscriptions settle', async () => {
    api.attach.mockResolvedValueOnce({ ...snapshot, loaded: true })
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect)
    const binding = dockBinding()
    const view = renderHook(() => useWhatsAppFastResponseHost({ binding, element }))
    await act(async () => undefined)
    expect(view.result.current).toEqual({ kind: 'ready' })
    expect(api.onStateChanged).toHaveBeenCalledOnce()
    view.unmount()
  })

  it('ignores a stale attach result and hides that stale owner', async () => {
    let resolveFirst: ((value: WhatsAppFastResponseSnapshot) => void) | null = null
    api.attach.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve
        })
    )
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect)
    const view = renderHook(({ binding }) => useWhatsAppFastResponseHost({ binding, element }), {
      initialProps: { binding: dockBinding(1) }
    })
    view.rerender({ binding: dockBinding(2) })
    await act(async () => undefined)
    await act(async () => {
      resolveFirst?.(snapshot)
    })
    expect(api.hide).toHaveBeenCalledWith(dockBinding(1).identity)
    view.unmount()
  })

  it('reattaches once after a recoverable owner crash without geometry changes', async () => {
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect)
    const binding = dockBinding()
    const view = renderHook(() => useWhatsAppFastResponseHost({ binding, element }))
    await act(async () => undefined)
    expect(api.attach).toHaveBeenCalledOnce()

    await act(async () => {
      stateChanged?.({ identity: binding.identity, state: 'crashed', recoverable: true })
    })
    expect(api.attach).toHaveBeenCalledTimes(2)

    await act(async () => {
      stateChanged?.({ identity: binding.identity, state: 'crashed', recoverable: true })
    })
    expect(api.attach).toHaveBeenCalledTimes(2)
    expect(view.result.current).toEqual({ kind: 'crashed', recoverable: true })
    view.unmount()
  })

  it('recovers from a current ready event while a crashed owner is reattaching', async () => {
    api.attach.mockResolvedValueOnce(snapshot).mockImplementationOnce(() => new Promise(() => {}))
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect)
    const binding = dockBinding()
    const view = renderHook(() => useWhatsAppFastResponseHost({ binding, element }))
    await act(async () => undefined)

    await act(async () => {
      stateChanged?.({ identity: binding.identity, state: 'crashed', recoverable: true })
    })
    expect(view.result.current).toEqual({ kind: 'crashed', recoverable: true })

    act(() =>
      stateChanged?.({ identity: dockBinding(2).identity, state: 'ready', recoverable: false })
    )
    expect(view.result.current).toEqual({ kind: 'crashed', recoverable: true })

    act(() => stateChanged?.({ identity: binding.identity, state: 'ready', recoverable: false }))
    expect(view.result.current).toEqual({ kind: 'ready' })
    view.unmount()
  })

  it('does not retry stale, nonrecoverable or unmounted crashes', async () => {
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect)
    const binding = dockBinding()
    const view = renderHook(() => useWhatsAppFastResponseHost({ binding, element }))
    await act(async () => undefined)

    act(() =>
      stateChanged?.({
        identity: dockBinding(2).identity,
        state: 'crashed',
        recoverable: true
      })
    )
    act(() => stateChanged?.({ identity: binding.identity, state: 'crashed', recoverable: false }))
    expect(api.attach).toHaveBeenCalledOnce()
    view.unmount()

    const unmounted = renderHook(() => useWhatsAppFastResponseHost({ binding, element }))
    await act(async () => undefined)
    expect(api.attach).toHaveBeenCalledTimes(2)
    act(() => {
      stateChanged?.({ identity: binding.identity, state: 'crashed', recoverable: true })
      unmounted.unmount()
    })
    expect(api.attach).toHaveBeenCalledTimes(2)
  })

  it('does not poison current state when hide rejects after a visibility change', async () => {
    api.hide.mockRejectedValueOnce(new Error('sender denied'))
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect)
    const view = renderHook(({ binding }) => useWhatsAppFastResponseHost({ binding, element }), {
      initialProps: { binding: dockBinding(1, true) }
    })
    await act(async () => undefined)
    view.rerender({ binding: dockBinding(1, false) })
    await act(async () => undefined)
    expect(view.result.current.kind).not.toBe('error')
    view.unmount()
  })

  it('reports a current show rejection for the active owner', async () => {
    api.show.mockRejectedValueOnce(new Error('sender denied'))
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect)
    const view = renderHook(({ binding }) => useWhatsAppFastResponseHost({ binding, element }), {
      initialProps: { binding: dockBinding(1, true) }
    })
    await act(async () => undefined)
    view.rerender({ binding: dockBinding(1, false) })
    await act(async () => undefined)
    view.rerender({ binding: dockBinding(1, true) })
    await act(async () => undefined)
    expect(view.result.current).toEqual({ kind: 'error', recoverable: true })
    view.unmount()
  })
})
