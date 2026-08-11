import { describe, expect, it } from 'vitest'
import type { CommunicationsDockTab } from '../../../../shared/communications-dock'
import {
  canDropCommunicationsDockApp,
  canReorderCommunicationsDockTab,
  getCommunicationsDockTabInsertionIndex,
  getCommunicationsDockTabReorderIndex,
  resolveCommunicationsDockTabInsertion,
  resolveCommunicationsDockDropSide
} from './CommunicationsDockDragLayer'

describe('communications dock drag targets', () => {
  const rect = { left: 0, top: 0, width: 300, height: 300 }

  it.each([
    [{ x: 1, y: 150 }, 'left'],
    [{ x: 299, y: 150 }, 'right'],
    [{ x: 150, y: 1 }, 'up'],
    [{ x: 150, y: 299 }, 'down'],
    [{ x: 150, y: 150 }, null]
  ] as const)('resolves pointer %o to %s', (pointer, side) => {
    expect(resolveCommunicationsDockDropSide(rect, pointer)).toBe(side)
  })

  it('blocks duplicate app leaves and resolves tab reorder targets', () => {
    const tabs: CommunicationsDockTab[] = [
      { id: 'one', activeLeafAppId: 'slack', layout: { type: 'leaf', appId: 'slack' } },
      { id: 'two', activeLeafAppId: 'discord', layout: { type: 'leaf', appId: 'discord' } }
    ]
    expect(canDropCommunicationsDockApp('slack', 'slack')).toBe(false)
    expect(canDropCommunicationsDockApp('slack', 'discord')).toBe(true)
    expect(getCommunicationsDockTabReorderIndex(tabs, 'two')).toBe(1)
    expect(getCommunicationsDockTabReorderIndex(tabs, 'missing')).toBeNull()
    expect(getCommunicationsDockTabInsertionIndex(tabs, 'one', 2)).toBe(1)
    expect(getCommunicationsDockTabInsertionIndex(tabs, 'two', 0)).toBe(0)
    expect(getCommunicationsDockTabInsertionIndex(tabs, 'one', 3)).toBeNull()
    expect(canReorderCommunicationsDockTab('one', 'one')).toBe(false)
    expect(canReorderCommunicationsDockTab('one', 'two')).toBe(true)
  })

  it('resolves a grouped tab insertion from the pointer side', () => {
    const event = {
      active: {
        data: {
          current: {
            type: 'communications-dock-tab',
            tabId: 'source',
            groupId: 'source',
            unifiedTabId: 'source',
            visibleTabId: 'source'
          }
        }
      },
      over: {
        data: {
          current: {
            type: 'communications-dock-tab-target',
            tabId: 'target',
            groupId: 'target',
            unifiedTabId: 'target',
            visibleTabId: 'target'
          }
        },
        rect: { left: 100, top: 0, width: 80, height: 24 }
      },
      activatorEvent: { clientX: 150, clientY: 12 },
      delta: { x: 0, y: 0 }
    } as unknown as Parameters<typeof resolveCommunicationsDockTabInsertion>[0]

    expect(resolveCommunicationsDockTabInsertion(event)).toEqual({ tabId: 'target', side: 'right' })
  })
})
