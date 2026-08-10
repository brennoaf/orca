import { describe, expect, it } from 'vitest'
import type { CommunicationsDockTab } from '../../../../shared/communications-dock'
import {
  canDropCommunicationsDockApp,
  getCommunicationsDockTabReorderIndex,
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
  })
})
