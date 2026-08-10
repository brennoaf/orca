import { describe, expect, it } from 'vitest'
import type { CommunicationsDockLayout } from '../../shared/communications-dock'
import {
  activateCommunicationsDockLeaf,
  moveCommunicationsDockApp,
  reorderCommunicationsDockTab,
  updateCommunicationsDockRatio
} from './communications-dock-state'

const layout: CommunicationsDockLayout = {
  version: 1,
  bounds: { x: 10, y: 10, width: 420, height: 640 },
  tabs: [
    { id: 'one', layout: { type: 'leaf', appId: 'whatsapp-web' }, activeLeafAppId: 'whatsapp-web' },
    { id: 'two', layout: { type: 'leaf', appId: 'slack' }, activeLeafAppId: 'slack' },
    { id: 'three', layout: { type: 'leaf', appId: 'discord' }, activeLeafAppId: 'discord' }
  ],
  activeTabId: 'one',
  collapsed: false
}

describe('communications dock state', () => {
  it('moves an app into a nested split without duplicating it', () => {
    const first = moveCommunicationsDockApp(layout, 'slack', 'one', 'whatsapp-web', 'right')
    const second = moveCommunicationsDockApp(first, 'discord', 'one', 'whatsapp-web', 'down')
    expect(second.tabs).toHaveLength(1)
    expect(second.tabs[0]).toMatchObject({
      id: 'one',
      activeLeafAppId: 'discord',
      layout: {
        type: 'split',
        direction: 'horizontal',
        first: { type: 'split', direction: 'vertical' },
        second: { type: 'leaf', appId: 'slack' }
      }
    })
  })

  it('activates leaves, reorders tabs, and clamps ratios', () => {
    const moved = moveCommunicationsDockApp(layout, 'slack', 'one', 'whatsapp-web', 'right')
    const active = activateCommunicationsDockLeaf(moved, 'one', 'slack')
    const ratio = updateCommunicationsDockRatio(active, 'one', [], 0.9)
    const reordered = reorderCommunicationsDockTab(ratio, 'three', 0)
    expect(ratio.tabs.find((tab) => tab.id === 'one')?.layout).toMatchObject({ ratio: 0.85 })
    expect(reordered.tabs[0].id).toBe('three')
    expect(reordered.activeTabId).toBe('one')
  })

  it('rejects duplicate self moves and invalid ratio paths', () => {
    expect(() => moveCommunicationsDockApp(layout, 'slack', 'two', 'slack', 'right')).toThrow()
    expect(() => updateCommunicationsDockRatio(layout, 'one', [], 0.5)).toThrow()
  })
})
