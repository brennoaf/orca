import type { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import type { CommunicationsDockLayout } from '../../shared/communications-dock'

vi.mock('electron', () => ({
  BrowserWindow: class {},
  screen: {
    getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }],
    getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
  }
}))
vi.mock('./communications-dock-window', () => ({
  clampCommunicationsDockBounds: (bounds: unknown) => bounds
}))

import { CommunicationsDockCollapseController } from './communications-dock-collapse'

const expandedBounds = { x: 100, y: 120, width: 420, height: 640 }
const collapsedLayout: CommunicationsDockLayout = {
  version: 1,
  bounds: expandedBounds,
  tabs: [
    {
      id: 'whatsapp-web',
      layout: { type: 'leaf', appId: 'whatsapp-web' },
      activeLeafAppId: 'whatsapp-web'
    }
  ],
  activeTabId: 'whatsapp-web',
  collapsed: true
}

function windowStub(): BrowserWindow {
  return {
    setMinimumSize: vi.fn(),
    setBounds: vi.fn()
  } as unknown as BrowserWindow
}

describe('CommunicationsDockCollapseController', () => {
  it('applies persisted collapsed state without discarding expanded bounds', () => {
    const window = windowStub()
    const controller = new CommunicationsDockCollapseController(expandedBounds)

    controller.applyInitialState(window, collapsedLayout)

    expect(window.setMinimumSize).toHaveBeenCalledWith(320, 40)
    expect(window.setBounds).toHaveBeenCalledWith({ ...expandedBounds, height: 40 }, false)
    expect(controller.getBounds()).toEqual(expandedBounds)
  })

  it('persists position changes while collapsed and preserves expanded dimensions', () => {
    const controller = new CommunicationsDockCollapseController(expandedBounds)

    controller.boundsChanged({ x: 260, y: 280, width: 420, height: 40 }, true)

    expect(controller.getBounds()).toEqual({ ...expandedBounds, x: 260, y: 280 })
  })
})
