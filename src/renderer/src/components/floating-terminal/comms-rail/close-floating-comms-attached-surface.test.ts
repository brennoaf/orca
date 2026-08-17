// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FloatingCommsSurfaceIdentity } from '../../../../../shared/floating-comms-surface'
import { closeFloatingCommsAttachedSurface } from './close-floating-comms-attached-surface'
import {
  isWhatsAppFastResponseViewportHidden,
  markWhatsAppFastResponseViewportHidden
} from './whatsapp-fast-response-viewport-state'

function identity(mode: 'attached-dom' | 'attached-native'): FloatingCommsSurfaceIdentity {
  return {
    appId: 'whatsapp-web',
    mode,
    requestId: 3,
    surfaceId: 5
  }
}

function slackIdentity(mode: 'attached-dom' | 'attached-native'): FloatingCommsSurfaceIdentity {
  return {
    appId: 'slack',
    mode,
    requestId: 7,
    surfaceId: 9
  }
}

describe('closeFloatingCommsAttachedSurface', () => {
  const hide = vi.fn(() => Promise.resolve())
  const slackHide = vi.fn(() => Promise.resolve())
  const closeAttached = vi.fn(() => Promise.resolve())

  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(window, {
      api: {
        floatingComms: { closeAttached },
        whatsappFastResponse: { hide },
        slackFastResponse: { hide: slackHide }
      }
    })
  })

  it('hides an attached DOM owner before closing its controller record', async () => {
    const current = identity('attached-dom')
    await closeFloatingCommsAttachedSurface(current)

    expect(hide).toHaveBeenCalledWith({ target: 'attached', ...current })
    expect(closeAttached).toHaveBeenCalledWith(current)
    expect(hide.mock.invocationCallOrder[0]).toBeLessThan(closeAttached.mock.invocationCallOrder[0])
  })

  it('leaves native owner cleanup to the window close listener', async () => {
    const current = identity('attached-native')
    await closeFloatingCommsAttachedSurface(current)

    expect(hide).not.toHaveBeenCalled()
    expect(closeAttached).toHaveBeenCalledWith(current)
  })

  it('closes and clears a DOM owner after its hide rejects', async () => {
    const current = identity('attached-dom')
    const rejection = new Error('hide rejected')
    hide.mockRejectedValueOnce(rejection)

    await expect(closeFloatingCommsAttachedSurface(current)).rejects.toBe(rejection)

    expect(hide).toHaveBeenCalledOnce()
    expect(closeAttached).toHaveBeenCalledOnce()
    expect(isWhatsAppFastResponseViewportHidden(current)).toBe(false)
  })

  it('keeps viewport markers isolated by attached owner identity', async () => {
    const first = identity('attached-dom')
    const second = { ...first, requestId: 4, surfaceId: 6 }
    markWhatsAppFastResponseViewportHidden(first)

    expect(isWhatsAppFastResponseViewportHidden(first)).toBe(true)
    expect(isWhatsAppFastResponseViewportHidden(second)).toBe(false)
    await closeFloatingCommsAttachedSurface(first)
    expect(hide).not.toHaveBeenCalled()
    expect(isWhatsAppFastResponseViewportHidden(first)).toBe(false)
  })

  it('hides Slack before closing its attached DOM controller record', async () => {
    const current = slackIdentity('attached-dom')
    await closeFloatingCommsAttachedSurface(current)

    expect(slackHide).toHaveBeenCalledWith({ target: 'attached', ...current })
    expect(closeAttached).toHaveBeenCalledWith(current)
    expect(slackHide.mock.invocationCallOrder[0]).toBeLessThan(
      closeAttached.mock.invocationCallOrder[0]
    )
  })

  it('closes Slack after its hide rejects', async () => {
    const current = slackIdentity('attached-dom')
    const rejection = new Error('hide rejected')
    slackHide.mockRejectedValueOnce(rejection)

    await expect(closeFloatingCommsAttachedSurface(current)).rejects.toBe(rejection)

    expect(slackHide).toHaveBeenCalledOnce()
    expect(closeAttached).toHaveBeenCalledOnce()
  })
})
