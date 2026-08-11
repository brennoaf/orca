import { describe, expect, it } from 'vitest'
import type { CommunicationsDockLayout } from '../../shared/communications-dock'
import {
  activateCommunicationsDockLeaf,
  createCommunicationsDockTab,
  moveCommunicationsDockApp,
  moveCommunicationsDockTab,
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

  it.each([
    ['left', 'horizontal'],
    ['right', 'horizontal'],
    ['up', 'vertical'],
    ['down', 'vertical']
  ] as const)('moves a tab subtree on the %s side', (side, direction) => {
    const grouped = moveCommunicationsDockApp(layout, 'slack', 'one', 'whatsapp-web', 'right')
    const moved = moveCommunicationsDockTab(grouped, 'one', 'three', 'discord', side)
    expect(moved.tabs).toHaveLength(1)
    expect(moved.tabs[0]).toMatchObject({
      id: 'three',
      activeLeafAppId: 'discord',
      layout: { type: 'split', direction, ratio: 0.5 }
    })
    expect(moved.activeTabId).toBe('three')
    expect(moved.tabs[0].layout).toMatchObject({
      first:
        side === 'left' || side === 'up' ? { type: 'split' } : { type: 'leaf', appId: 'discord' },
      second:
        side === 'left' || side === 'up' ? { type: 'leaf', appId: 'discord' } : { type: 'split' }
    })
  })

  it('rejects same-tab moves before changing the layout', () => {
    const before = structuredClone(layout)
    expect(() => moveCommunicationsDockTab(layout, 'one', 'one', 'whatsapp-web', 'right')).toThrow(
      'communications_dock_move_same_tab'
    )
    expect(layout).toEqual(before)
  })

  it('extracts apps from a group into clamped new tabs with deterministic active ids', () => {
    const grouped = moveCommunicationsDockApp(
      moveCommunicationsDockApp(layout, 'slack', 'one', 'whatsapp-web', 'right'),
      'discord',
      'one',
      'whatsapp-web',
      'down'
    )
    const withTwoTabs = createCommunicationsDockTab(grouped, 'one', 'slack', 9, 'created-slack')
    const withThreeTabs = createCommunicationsDockTab(
      withTwoTabs,
      'one',
      'whatsapp-web',
      -4,
      'created-whatsapp'
    )
    expect(withTwoTabs.tabs.map((tab) => tab.id)).toEqual(['one', 'created-slack'])
    expect(withTwoTabs.activeTabId).toBe('created-slack')
    expect(withThreeTabs.tabs.map((tab) => tab.id)).toEqual([
      'created-whatsapp',
      'one',
      'created-slack'
    ])
    expect(withThreeTabs.activeTabId).toBe('created-whatsapp')
    expect(withThreeTabs.tabs.map((tab) => tab.activeLeafAppId)).toEqual([
      'whatsapp-web',
      'discord',
      'slack'
    ])
  })

  it('preserves insertion positions when extracting a standalone tab', () => {
    const extracted = createCommunicationsDockTab(layout, 'one', 'whatsapp-web', 1, 'created')
    expect(extracted.tabs.map((tab) => tab.id)).toEqual(['created', 'two', 'three'])
  })

  it('rejects duplicate app layouts and duplicate generated tab ids', () => {
    const duplicate: CommunicationsDockLayout = {
      ...layout,
      tabs: [
        ...layout.tabs,
        { id: 'duplicate', layout: { type: 'leaf', appId: 'slack' }, activeLeafAppId: 'slack' }
      ]
    }
    expect(() => moveCommunicationsDockTab(duplicate, 'one', 'three', 'discord', 'right')).toThrow(
      'communications_dock_apps_invalid'
    )
    expect(() => createCommunicationsDockTab(layout, 'one', 'whatsapp-web', 0, 'two')).toThrow(
      'communications_dock_tab_id_invalid'
    )
  })
})
