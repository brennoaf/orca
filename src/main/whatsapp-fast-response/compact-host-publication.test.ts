import { describe, expect, it, vi } from 'vitest'
import { publishCompactWhatsAppState } from './compact-host-publication'

describe('publishCompactWhatsAppState', () => {
  it('publishes attention state only to the current owner', () => {
    const send = vi.fn()
    publishCompactWhatsAppState(
      {
        target: 'attached',
        identity: 'owner',
        webContentsId: 1,
        sender: { isDestroyed: () => false, send } as never,
        request: {
          target: 'attached',
          appId: 'whatsapp-web',
          requestId: 1,
          surfaceId: 1,
          mode: 'attached-native'
        },
        window: {} as never,
        closed: () => {}
      },
      { hasUnread: true },
      'compact',
      'ready'
    )

    expect(send).toHaveBeenCalledWith('whatsappFastResponse:stateChanged', {
      attention: { hasUnread: true },
      contentMode: 'compact',
      identity: {
        target: 'attached',
        appId: 'whatsapp-web',
        requestId: 1,
        surfaceId: 1,
        mode: 'attached-native'
      },
      state: 'ready',
      recoverable: false
    })
  })

  it('does not publish after the owner is destroyed', () => {
    const send = vi.fn()
    publishCompactWhatsAppState(
      {
        target: 'attached',
        identity: 'owner',
        webContentsId: 1,
        sender: { isDestroyed: () => true, send } as never,
        request: {
          target: 'attached',
          appId: 'whatsapp-web',
          requestId: 1,
          surfaceId: 1,
          mode: 'attached-native'
        },
        window: {} as never,
        closed: () => {}
      },
      { hasUnread: true },
      'qr',
      'ready'
    )

    expect(send).not.toHaveBeenCalled()
  })
})
