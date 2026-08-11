import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendToTrustedUIRenderer = vi.hoisted(() => vi.fn())

vi.mock('../ipc/ui', () => ({ sendToTrustedUIRenderer }))

import { createCompactWhatsAppAttentionController } from './compact-host-attention'

describe('CompactWhatsAppAttention', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sendToTrustedUIRenderer.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('publishes initial unread attention without notifying and keeps it through a failed poll', async () => {
    const executeJavaScriptInIsolatedWorld = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('guest unavailable'))
    const onUnread = vi.fn()
    const publish = vi.fn()
    const attention = createCompactWhatsAppAttentionController({
      isCurrent: () => true,
      isFocused: () => false,
      onUnread,
      publish
    })
    const view = { webContents: { executeJavaScriptInIsolatedWorld } } as never

    attention.schedule(view, true, 1)
    await vi.advanceTimersByTimeAsync(2000)

    expect(attention.snapshot()).toEqual({ hasUnread: true })
    expect(onUnread).not.toHaveBeenCalled()
    expect(publish).toHaveBeenCalledWith('ready')
    expect(sendToTrustedUIRenderer).toHaveBeenCalledWith('whatsappFastResponse:attentionChanged', {
      hasUnread: true
    })

    await vi.advanceTimersByTimeAsync(2000)

    expect(attention.snapshot()).toEqual({ hasUnread: true })
    expect(onUnread).not.toHaveBeenCalled()
  })

  it('notifies only after an observed false-to-true transition', async () => {
    const executeJavaScriptInIsolatedWorld = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const onUnread = vi.fn()
    const attention = createCompactWhatsAppAttentionController({
      isCurrent: () => true,
      isFocused: () => false,
      onUnread,
      publish: vi.fn()
    })
    const view = { webContents: { executeJavaScriptInIsolatedWorld } } as never

    attention.schedule(view, true, 1)
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(2000)

    expect(attention.snapshot()).toEqual({ hasUnread: true })
    expect(onUnread).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(2000)

    expect(attention.snapshot()).toEqual({ hasUnread: true })
    expect(onUnread).toHaveBeenCalledTimes(2)
  })
})
