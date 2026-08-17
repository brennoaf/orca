import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mocks,
  request,
  resetCompactHostFixture,
  sender,
  store,
  visibility
} from './compact-host-test-fixture'

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: (sender: { id: number }) => mocks.windows.get(sender.id) ?? null,
    getAllWindows: () => [...mocks.windows.values()]
  },
  WebContentsView: mocks.WebContentsView
}))
vi.mock('../browser/browser-session-registry', () => ({
  browserSessionRegistry: {
    resolveKnownPartition: mocks.resolveKnownPartition,
    createProfile: mocks.createProfile
  }
}))
vi.mock('../ipc/ui', () => ({ sendToTrustedUIRenderer: vi.fn() }))

import { WhatsAppFastResponseHost } from './compact-host'

describe('WhatsAppFastResponseHost state', () => {
  beforeEach(() => {
    resetCompactHostFixture()
  })

  it('discards a crashed guest and reloads a replacement', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const crash = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'render-process-gone'
    )?.[1]
    crash?.()
    host.attach(sender as never, request)
    expect(mocks.WebContentsView).toHaveBeenCalledTimes(2)
    expect(mocks.webContents.loadURL).toHaveBeenCalledTimes(2)
  })
  it('publishes loading then crash only to the active owner', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const crash = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'render-process-gone'
    )?.[1]
    crash?.()
    expect(sender.send.mock.calls.map(([, state]) => state.state)).toEqual(['loading', 'crashed'])
    expect(sender.send.mock.calls[1]?.[1]).toMatchObject({ recoverable: true })
  })
  it('keeps loading state when hidden before ready', () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    host.hide(sender as never, visibility)
    expect(sender.send.mock.calls.map(([, state]) => state.state)).toEqual(['loading'])
    expect(host.snapshot()).toMatchObject({ loaded: false, crashed: false, visible: false })
  })
  it('keeps ready state when hidden after load', async () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    finish?.()
    await vi.waitFor(() => expect(host.snapshot()).toMatchObject({ loaded: true, crashed: false }))
    host.hide(sender as never, visibility)
    expect(sender.send.mock.calls.map(([, state]) => state.state)).toEqual(['loading', 'ready'])
    expect(host.snapshot()).toMatchObject({ loaded: true, crashed: false, visible: false })
  })
  it('uses the hidden polling cadence after its owner closes', async () => {
    vi.useFakeTimers()
    try {
      const host = new WhatsAppFastResponseHost(store as never)
      host.attach(sender as never, request)
      const finish = mocks.webContents.on.mock.calls.find(
        ([event]) => event === 'did-finish-load'
      )?.[1]
      finish?.()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(0)
      mocks.webContents.executeJavaScriptInIsolatedWorld.mockClear()
      const closed = mocks.windows
        .get(sender.id)!
        .once.mock.calls.find((call) => call[0] === 'closed')?.[1]
      if (typeof closed !== 'function') {
        throw new Error('owner closed listener missing')
      }
      closed()
      await vi.advanceTimersByTimeAsync(2000)
      expect(mocks.webContents.executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(5000)
      expect(mocks.webContents.executeJavaScriptInIsolatedWorld).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
  it('keeps initial unread attention silent through a main-frame reload', async () => {
    vi.useFakeTimers()
    try {
      mocks.webContents.executeJavaScriptInIsolatedWorld
        .mockResolvedValueOnce('qr')
        .mockResolvedValueOnce({ hasUnread: true, mode: 'qr' })
        .mockResolvedValueOnce('qr')
        .mockResolvedValueOnce({ hasUnread: true, mode: 'qr' })
      const onUnread = vi.fn()
      const host = new WhatsAppFastResponseHost(store as never, onUnread)
      host.attach(sender as never, request)
      const finish = mocks.webContents.on.mock.calls.find(
        ([event]) => event === 'did-finish-load'
      )?.[1]
      const start = mocks.webContents.on.mock.calls.find(
        ([event]) => event === 'did-start-navigation'
      )?.[1]
      finish?.()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(2000)
      expect(onUnread).not.toHaveBeenCalled()
      start?.({}, 'https://web.whatsapp.com/', false, true)
      finish?.()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(2000)
      expect(host.snapshot().attention).toEqual({ hasUnread: true })
      expect(onUnread).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
  it('tracks QR and compact content transitions through the existing attention polling', async () => {
    vi.useFakeTimers()
    try {
      mocks.webContents.executeJavaScriptInIsolatedWorld
        .mockResolvedValueOnce('qr')
        .mockResolvedValueOnce({ hasUnread: false, mode: 'list' })
        .mockResolvedValueOnce({ hasUnread: false, mode: 'conversation' })
        .mockResolvedValueOnce({ hasUnread: false, mode: 'qr' })
      const host = new WhatsAppFastResponseHost(store as never)
      host.attach(sender as never, request)
      expect(host.snapshot().contentMode).toBe('loading')
      const finish = mocks.webContents.on.mock.calls.find(
        ([event]) => event === 'did-finish-load'
      )?.[1]
      finish?.()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(0)
      expect(host.snapshot().contentMode).toBe('qr')
      sender.send.mockClear()
      await vi.advanceTimersByTimeAsync(2000)
      expect(host.snapshot().contentMode).toBe('compact')
      expect(sender.send).toHaveBeenCalledOnce()
      expect(sender.send.mock.calls[0]?.[1]).toMatchObject({ contentMode: 'compact' })
      await vi.advanceTimersByTimeAsync(2000)
      expect(sender.send).toHaveBeenCalledOnce()
      await vi.advanceTimersByTimeAsync(2000)
      expect(host.snapshot().contentMode).toBe('qr')
      expect(sender.send).toHaveBeenCalledTimes(2)
      expect(sender.send.mock.calls[1]?.[1]).toMatchObject({ contentMode: 'qr' })
    } finally {
      vi.useRealTimers()
    }
  })
  it('returns content mode to loading on compact main-frame navigation', async () => {
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    const start = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-start-navigation'
    )?.[1]
    finish?.()
    await vi.waitFor(() => expect(host.snapshot().contentMode).toBe('qr'))
    start?.({}, 'https://web.whatsapp.com/', false, true)
    expect(host.snapshot().contentMode).toBe('loading')
    expect(sender.send.mock.calls.at(-1)?.[1]).toMatchObject({
      contentMode: 'loading',
      state: 'loading'
    })
  })
  it('publishes loading on navigation when ready content is already loading', async () => {
    mocks.webContents.executeJavaScriptInIsolatedWorld.mockResolvedValueOnce('loading')
    const host = new WhatsAppFastResponseHost(store as never)
    host.attach(sender as never, request)
    const finish = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-finish-load'
    )?.[1]
    const start = mocks.webContents.on.mock.calls.find(
      ([event]) => event === 'did-start-navigation'
    )?.[1]
    finish?.()
    await vi.waitFor(() =>
      expect(host.snapshot()).toMatchObject({ contentMode: 'loading', loaded: true })
    )
    sender.send.mockClear()
    start?.({}, 'https://web.whatsapp.com/', false, true)
    expect(sender.send).toHaveBeenCalledOnce()
    expect(sender.send.mock.calls[0]?.[1]).toMatchObject({
      contentMode: 'loading',
      state: 'loading'
    })
  })
})
