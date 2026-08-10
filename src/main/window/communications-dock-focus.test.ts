import type { BrowserWindow, WebContents } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import type { CommunicationsDockLayout } from '../../shared/communications-dock'
import { isCommunicationsDockAppFocusedVisible } from './communications-dock-focus'

const sender = {} as WebContents
const layout: CommunicationsDockLayout = {
  version: 1,
  bounds: { x: 0, y: 0, width: 400, height: 400 },
  collapsed: false,
  tabs: [
    {
      id: 'active',
      activeLeafAppId: 'whatsapp-web',
      layout: {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        first: { type: 'leaf', appId: 'whatsapp-web' },
        second: { type: 'leaf', appId: 'discord' }
      }
    },
    { id: 'inactive', activeLeafAppId: 'slack', layout: { type: 'leaf', appId: 'slack' } }
  ],
  activeTabId: 'active'
}

function dockWindow(overrides: { focused?: boolean; visible?: boolean } = {}): BrowserWindow {
  return {
    webContents: sender,
    isDestroyed: vi.fn(() => false),
    isFocused: vi.fn(() => overrides.focused ?? true),
    isVisible: vi.fn(() => overrides.visible ?? true)
  } as unknown as BrowserWindow
}

describe('communications dock attention visibility', () => {
  it('accepts every visible split leaf in the active tab', () => {
    expect(
      isCommunicationsDockAppFocusedVisible({
        window: dockWindow(),
        sender,
        appId: 'whatsapp-web',
        layout
      })
    ).toBe(true)
  })

  it.each([
    { name: 'collapsed', next: { ...layout, collapsed: true } },
    { name: 'inactive tab', next: { ...layout, activeTabId: 'inactive' } }
  ])('rejects $name content', ({ next }) => {
    expect(
      isCommunicationsDockAppFocusedVisible({
        window: dockWindow(),
        sender,
        appId: 'whatsapp-web',
        layout: next
      })
    ).toBe(false)
  })

  it('rejects hidden, unfocused, and mismatched senders', () => {
    expect(
      isCommunicationsDockAppFocusedVisible({
        window: dockWindow({ visible: false }),
        sender,
        appId: 'whatsapp-web',
        layout
      })
    ).toBe(false)
    expect(
      isCommunicationsDockAppFocusedVisible({
        window: dockWindow({ focused: false }),
        sender,
        appId: 'whatsapp-web',
        layout
      })
    ).toBe(false)
    expect(
      isCommunicationsDockAppFocusedVisible({
        window: dockWindow(),
        sender: {} as WebContents,
        appId: 'whatsapp-web',
        layout
      })
    ).toBe(false)
  })
})
