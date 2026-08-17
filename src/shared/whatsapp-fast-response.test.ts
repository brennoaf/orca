import { describe, expect, it } from 'vitest'
import {
  WhatsAppFastResponseSnapshotSchema,
  WhatsAppFastResponseStateChangedSchema,
  WhatsAppFastResponseUnregisterBrowserSurfaceRequestSchema
} from './whatsapp-fast-response'

describe('WhatsApp fast response output schemas', () => {
  it('requires a recognized content mode in snapshots and state changes', () => {
    expect(
      WhatsAppFastResponseSnapshotSchema.parse({
        attention: { hasUnread: false },
        attached: true,
        contentMode: 'qr',
        crashed: false,
        loaded: true,
        visible: true
      })
    ).toMatchObject({ contentMode: 'qr' })
    expect(
      WhatsAppFastResponseStateChangedSchema.parse({
        attention: { hasUnread: false },
        contentMode: 'compact',
        identity: {
          appId: 'whatsapp-web',
          target: 'attached',
          requestId: 1,
          surfaceId: 1,
          mode: 'attached-native'
        },
        state: 'ready',
        recoverable: false
      })
    ).toMatchObject({ contentMode: 'compact' })
    expect(() =>
      WhatsAppFastResponseSnapshotSchema.parse({
        attention: { hasUnread: false },
        attached: true,
        contentMode: 'conversation',
        crashed: false,
        loaded: true,
        visible: true
      })
    ).toThrow()
  })

  it('requires the browser target in unregister requests', () => {
    const request = {
      appId: 'whatsapp-web',
      target: 'browser',
      browserTabId: 'tab',
      browserPageId: 'page',
      workspaceId: 'workspace',
      registrationToken: 'b6bf3471-5fd1-4f70-9ed8-42ebd88609f3',
      revision: 1
    }
    expect(WhatsAppFastResponseUnregisterBrowserSurfaceRequestSchema.parse(request)).toEqual(
      request
    )
    expect(() =>
      WhatsAppFastResponseUnregisterBrowserSurfaceRequestSchema.parse({
        ...request,
        target: undefined
      })
    ).toThrow()
    expect(() =>
      WhatsAppFastResponseUnregisterBrowserSurfaceRequestSchema.parse({
        ...request,
        target: 'dock'
      })
    ).toThrow()
  })
})
