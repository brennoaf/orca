import { describe, expect, it, vi } from 'vitest'
import { dispatchZApiAttentionNotification } from './z-api-attention-notification-policy'

function dependencies(
  overrides: { enabled?: boolean; visible?: boolean; reserved?: boolean } = {}
) {
  return {
    enabled: vi.fn(() => overrides.enabled ?? true),
    visible: vi.fn(() => overrides.visible ?? false),
    reserve: vi.fn(() => overrides.reserved ?? true),
    supported: vi.fn(() => true),
    attention: vi.fn(),
    deliver: vi.fn()
  }
}

describe('Z-API attention notification policy', () => {
  it('delivers one generic notification for eligible attention', () => {
    const deps = dependencies()
    expect(dispatchZApiAttentionNotification({ conversationId: 1, messageId: 2 }, deps)).toEqual({
      delivered: true
    })
    expect(deps.deliver).toHaveBeenCalledTimes(1)
  })

  it.each([
    { name: 'disabled', overrides: { enabled: false }, reason: 'disabled' },
    { name: 'visible', overrides: { visible: true }, reason: 'visible' },
    { name: 'cooldown', overrides: { reserved: false }, reason: 'cooldown' }
  ] as const)('suppresses $name attention', ({ overrides, reason }) => {
    const deps = dependencies(overrides)
    expect(dispatchZApiAttentionNotification({ conversationId: 1, messageId: 2 }, deps)).toEqual({
      delivered: false,
      reason
    })
    expect(deps.deliver).not.toHaveBeenCalled()
  })
})
