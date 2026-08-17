// @vitest-environment happy-dom

import { act, StrictMode } from 'react'
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
  contentMode: 'loading',
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

function attachedDomBinding(): WhatsAppFastResponseHostBinding {
  return {
    identity: {
      target: 'attached',
      appId: 'whatsapp-web',
      requestId: 7,
      surfaceId: 9,
      mode: 'attached-dom'
    },
    visible: true
  }
}

describe('useWhatsAppFastResponseHost', () => {
  let resize: (() => void) | null
  let intersect: (() => void) | null
  let stateChanged: ((event: WhatsAppFastResponseStateChanged) => void) | null
  let rect: DOMRect
  const intersectionDisconnect = vi.fn()
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
    intersect = null
    stateChanged = null
    rect = new DOMRect(12, 18, 300, 240)
    Object.defineProperties(window, {
      innerHeight: { configurable: true, value: 415 },
      innerWidth: { configurable: true, value: 600 }
    })
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
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: () => void) {
          intersect = callback
        }
        observe(): void {}
        disconnect(): void {
          intersectionDisconnect()
        }
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

    act(() =>
      stateChanged?.({
        contentMode: 'compact',
        identity: binding.identity,
        state: 'ready',
        recoverable: true
      })
    )
    expect(view.result.current).toEqual({ kind: 'ready', contentMode: 'compact' })
    act(() =>
      stateChanged?.({
        contentMode: 'compact',
        identity: dockBinding(2).identity,
        state: 'crashed',
        recoverable: false
      })
    )
    expect(view.result.current).toEqual({ kind: 'ready', contentMode: 'compact' })
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
    expect(view.result.current).toEqual({ kind: 'ready', contentMode: 'loading' })
    expect(api.onStateChanged).toHaveBeenCalledOnce()
    view.unmount()
  })

  it('attaches a DOM-attached surface to its real host element', async () => {
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect)
    const binding = attachedDomBinding()
    const view = renderHook(() => useWhatsAppFastResponseHost({ binding, element }))
    await act(async () => undefined)

    expect(api.attach).toHaveBeenCalledWith({
      ...binding.identity,
      rectCss: { x: 12, y: 18, width: 300, height: 240 },
      rendererZoomFactor: 1.2
    })
    expect(view.result.current.kind).not.toBe('inactive')
    view.unmount()
  })

  it('publishes the actual constrained host height without expanding it to the QR target', async () => {
    rect = new DOMRect(12, 18, 300, 180)
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect)
    const binding = dockBinding()
    const view = renderHook(() => useWhatsAppFastResponseHost({ binding, element }))
    await act(async () => undefined)

    expect(api.attach).toHaveBeenCalledWith(
      expect.objectContaining({ rectCss: { x: 12, y: 18, width: 300, height: 180 } })
    )
    view.unmount()
  })

  it('waits for an initially offscreen host and attaches once when it intersects', async () => {
    rect = new DOMRect(1, -186, 318, 32)
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect)
    const binding = dockBinding()
    const view = renderHook(() => useWhatsAppFastResponseHost({ binding, element }))
    await act(async () => undefined)

    expect(api.attach).not.toHaveBeenCalled()
    expect(view.result.current).toEqual({ kind: 'inactive' })
    rect = new DOMRect(1, 1, 318, 32)
    await act(async () => {
      intersect?.()
    })

    expect(api.attach).toHaveBeenCalledOnce()
    expect(api.attach).toHaveBeenCalledWith(
      expect.objectContaining({ rectCss: { x: 1, y: 1, width: 318, height: 32 } })
    )
    view.unmount()
  })

  it('publishes a partially clipped 318px host that intersects the owner viewport', async () => {
    rect = new DOMRect(-317, -317, 318, 318)
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect)
    const binding = dockBinding()
    const view = renderHook(() => useWhatsAppFastResponseHost({ binding, element }))
    await act(async () => undefined)

    expect(api.attach).toHaveBeenCalledWith(
      expect.objectContaining({ rectCss: { x: -317, y: -317, width: 318, height: 318 } })
    )
    view.unmount()
  })

  it('serializes one viewport hide before one bounds update and show on reentry', async () => {
    let resolveHide: ((value: WhatsAppFastResponseSnapshot) => void) | null = null
    api.hide.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveHide = resolve
        })
    )
    const element = document.createElement('div')
    vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect)
    const binding = dockBinding()
    const view = renderHook(() => useWhatsAppFastResponseHost({ binding, element }))
    await act(async () => undefined)

    rect = new DOMRect(1, -240, 318, 32)
    await act(async () => {
      intersect?.()
    })
    expect(api.hide).toHaveBeenCalledOnce()
    await act(async () => {
      intersect?.()
    })
    expect(api.hide).toHaveBeenCalledOnce()

    rect = new DOMRect(1, 1, 318, 318)
    await act(async () => {
      intersect?.()
    })
    expect(api.updateBounds).not.toHaveBeenCalled()
    expect(api.show).not.toHaveBeenCalled()
    await act(async () => {
      resolveHide?.({ ...snapshot, visible: false })
    })

    expect(api.updateBounds).toHaveBeenCalledOnce()
    expect(api.updateBounds).toHaveBeenCalledWith(
      expect.objectContaining({ rectCss: { x: 1, y: 1, width: 318, height: 318 } })
    )
    expect(api.show).toHaveBeenCalledOnce()
    expect(view.result.current.kind).toBe('loading')
    view.unmount()
    expect(intersectionDisconnect).toHaveBeenCalledOnce()
    expect(api.hide).toHaveBeenCalledTimes(2)
  })

  it.each(['hide', 'updateBounds', 'show'] as const)(
    'does not loop after a viewport %s rejection',
    async (operation) => {
      api[operation].mockRejectedValueOnce(new Error(`${operation} rejected`))
      const element = document.createElement('div')
      vi.spyOn(element, 'getBoundingClientRect').mockImplementation(() => rect)
      const binding = dockBinding()
      const view = renderHook(() => useWhatsAppFastResponseHost({ binding, element }))
      await act(async () => undefined)

      rect = new DOMRect(1, -240, 318, 32)
      await act(async () => {
        intersect?.()
      })
      if (operation !== 'hide') {
        rect = new DOMRect(1, 1, 318, 318)
        await act(async () => {
          intersect?.()
        })
      }
      await act(async () => undefined)
      await act(async () => undefined)

      expect(api[operation]).toHaveBeenCalledOnce()
      view.unmount()
    }
  )

  it('preserves a hidden attached owner across StrictMode effect remounts', async () => {
    rect = new DOMRect(1, 1, 318, 318)
    const firstElement = document.createElement('div')
    const secondElement = document.createElement('div')
    vi.spyOn(firstElement, 'getBoundingClientRect').mockImplementation(() => rect)
    vi.spyOn(secondElement, 'getBoundingClientRect').mockImplementation(() => rect)
    const binding = attachedDomBinding()
    const view = renderHook(({ element }) => useWhatsAppFastResponseHost({ binding, element }), {
      initialProps: { element: firstElement },
      wrapper: StrictMode
    })
    await act(async () => undefined)

    rect = new DOMRect(1, -240, 318, 32)
    await act(async () => {
      intersect?.()
    })
    expect(api.hide).toHaveBeenCalledOnce()
    view.rerender({ element: secondElement })
    await act(async () => undefined)

    expect(api.hide).toHaveBeenCalledOnce()
    view.unmount()
    expect(api.hide).toHaveBeenCalledOnce()
  })

  it('ignores a stale attach result without hiding a newer owner', async () => {
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
    expect(api.hide).not.toHaveBeenCalledWith(dockBinding(1).identity)
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
      stateChanged?.({
        contentMode: 'compact',
        identity: binding.identity,
        state: 'crashed',
        recoverable: true
      })
    })
    expect(api.attach).toHaveBeenCalledTimes(2)

    await act(async () => {
      stateChanged?.({
        contentMode: 'compact',
        identity: binding.identity,
        state: 'crashed',
        recoverable: true
      })
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
      stateChanged?.({
        contentMode: 'compact',
        identity: binding.identity,
        state: 'crashed',
        recoverable: true
      })
    })
    expect(view.result.current).toEqual({ kind: 'crashed', recoverable: true })

    act(() =>
      stateChanged?.({
        contentMode: 'compact',
        identity: dockBinding(2).identity,
        state: 'ready',
        recoverable: false
      })
    )
    expect(view.result.current).toEqual({ kind: 'crashed', recoverable: true })

    act(() =>
      stateChanged?.({
        contentMode: 'compact',
        identity: binding.identity,
        state: 'ready',
        recoverable: false
      })
    )
    expect(view.result.current).toEqual({ kind: 'ready', contentMode: 'compact' })
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
        contentMode: 'compact',
        identity: dockBinding(2).identity,
        state: 'crashed',
        recoverable: true
      })
    )
    act(() =>
      stateChanged?.({
        contentMode: 'compact',
        identity: binding.identity,
        state: 'crashed',
        recoverable: false
      })
    )
    expect(api.attach).toHaveBeenCalledOnce()
    view.unmount()

    const unmounted = renderHook(() => useWhatsAppFastResponseHost({ binding, element }))
    await act(async () => undefined)
    expect(api.attach).toHaveBeenCalledTimes(2)
    act(() => {
      stateChanged?.({
        contentMode: 'compact',
        identity: binding.identity,
        state: 'crashed',
        recoverable: true
      })
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
