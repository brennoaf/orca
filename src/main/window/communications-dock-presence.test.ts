import type { BrowserWindow, WebContents } from 'electron'
import { describe, expect, it } from 'vitest'
import type { CommunicationsDockLayout } from '../../shared/communications-dock'
import { communicationsDockPresence } from './communications-dock-presence'
import { isCommunicationsDockSender } from './communications-dock-sender'

const layout: CommunicationsDockLayout = {
  version: 1,
  bounds: { x: 10, y: 10, width: 420, height: 640 },
  tabs: [
    {
      id: 'whatsapp-web',
      layout: { type: 'leaf', appId: 'whatsapp-web' },
      activeLeafAppId: 'whatsapp-web'
    }
  ],
  activeTabId: 'whatsapp-web',
  collapsed: false
}

function windowStub(
  args: { destroyed?: boolean; visible?: boolean; sender?: WebContents } = {}
): BrowserWindow {
  return {
    isDestroyed: () => args.destroyed ?? false,
    isVisible: () => args.visible ?? false,
    webContents: args.sender ?? senderStub()
  } as unknown as BrowserWindow
}

function senderStub(destroyed = false): WebContents {
  return { isDestroyed: () => destroyed } as WebContents
}

describe('communications dock presence', () => {
  it('does not disclose a missing or destroyed dock', () => {
    expect(communicationsDockPresence(null, layout, 'panel')).toEqual({
      exists: false,
      visible: false,
      location: 'panel'
    })
    expect(communicationsDockPresence(windowStub({ destroyed: true }), layout, 'panel')).toEqual({
      exists: false,
      visible: false,
      location: 'panel'
    })
  })

  it('reports only active app and visibility for a live dock', () => {
    expect(communicationsDockPresence(windowStub({ visible: true }), layout, 'dock')).toEqual({
      exists: true,
      visible: true,
      location: 'dock',
      activeAppId: 'whatsapp-web'
    })
  })

  it('requires the current live dock sender and identity', () => {
    const sender = senderStub()
    const window = windowStub({ sender })
    expect(
      isCommunicationsDockSender({
        window,
        sender,
        generation: 2,
        revision: 3,
        identity: { generation: 2, revision: 3 }
      })
    ).toBe(true)
    expect(
      isCommunicationsDockSender({ window, sender: senderStub(), generation: 2, revision: 3 })
    ).toBe(false)
    expect(
      isCommunicationsDockSender({
        window,
        sender,
        generation: 2,
        revision: 3,
        identity: { generation: 2, revision: 4 }
      })
    ).toBe(false)
    expect(
      isCommunicationsDockSender({ window, sender: senderStub(true), generation: 2, revision: 3 })
    ).toBe(false)
  })
})
