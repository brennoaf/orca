import { describe, expect, it } from 'vitest'
import type { CommunicationsDockSnapshot } from '../../../../shared/communications-dock'
import { shouldAcceptCommunicationsDockSnapshot } from './useCommunicationsDockBridge'

function snapshot(generation: number, revision: number): CommunicationsDockSnapshot {
  return {
    generation,
    revision,
    visible: true,
    sessions: {},
    layout: {
      version: 1,
      bounds: { x: 0, y: 0, width: 420, height: 420 },
      collapsed: false,
      activeTabId: 'tab',
      tabs: [
        {
          id: 'tab',
          activeLeafAppId: 'discord',
          layout: { type: 'leaf', appId: 'discord' }
        }
      ]
    }
  }
}

describe('communications dock snapshot admission', () => {
  it('accepts current or newer snapshots and rejects stale revisions and generations', () => {
    const current = snapshot(2, 8)
    expect(shouldAcceptCommunicationsDockSnapshot(current, snapshot(2, 8))).toBe(true)
    expect(shouldAcceptCommunicationsDockSnapshot(current, snapshot(2, 9))).toBe(true)
    expect(shouldAcceptCommunicationsDockSnapshot(current, snapshot(3, 1))).toBe(true)
    expect(shouldAcceptCommunicationsDockSnapshot(current, snapshot(2, 7))).toBe(false)
    expect(shouldAcceptCommunicationsDockSnapshot(current, snapshot(1, 100))).toBe(false)
  })
})
