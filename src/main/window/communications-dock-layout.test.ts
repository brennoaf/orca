import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  display: { workArea: { x: 0, y: 0, width: 1920, height: 1080 } }
}))

vi.mock('electron', () => ({
  screen: {
    getAllDisplays: () => [mocks.display],
    getPrimaryDisplay: () => mocks.display
  }
}))

import {
  COMMUNICATIONS_DOCK_LAYOUT_FILE,
  CommunicationsDockLayoutStore,
  normalizeCommunicationsDockLayout
} from './communications-dock-layout'

describe('CommunicationsDockLayoutStore', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'orca-communications-dock-'))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('normalizes duplicates, invalid active ids, and ratios', () => {
    const normalized = normalizeCommunicationsDockLayout({
      version: 1,
      bounds: { x: 10, y: 10, width: 420, height: 640 },
      tabs: [
        {
          id: 'first',
          activeLeafAppId: 'discord',
          layout: {
            type: 'split',
            direction: 'horizontal',
            ratio: 2,
            first: { type: 'leaf', appId: 'discord' },
            second: { type: 'leaf', appId: 'discord' }
          }
        },
        { id: 'second', activeLeafAppId: 'slack', layout: { type: 'leaf', appId: 'slack' } }
      ],
      activeTabId: 'missing',
      collapsed: true
    })
    expect(normalized).toMatchObject({ activeTabId: 'first', collapsed: true })
    expect(normalized?.tabs[0].layout).toEqual({ type: 'leaf', appId: 'discord' })
  })

  it('migrates deterministic legacy bounds and initializes catalog tabs', async () => {
    await writeFile(
      join(directory, 'floating-comms-detached-layout.json'),
      JSON.stringify({
        slack: { x: 300, y: 200, width: 500, height: 500 },
        'whatsapp-web': { x: 100, y: 80, width: 440, height: 600 }
      })
    )
    const store = new CommunicationsDockLayoutStore(directory)
    expect(store.get().bounds).toEqual({ x: 100, y: 80, width: 440, height: 600 })
    expect(store.get().tabs.map((tab) => tab.activeLeafAppId)).toEqual([
      'whatsapp-web',
      'slack',
      'discord'
    ])
    await store.flush()
    const raw = await readFile(join(directory, COMMUNICATIONS_DOCK_LAYOUT_FILE), 'utf8')
    expect(raw).not.toContain('draft')
    expect(JSON.parse(raw).version).toBe(1)
  })

  it('reads primary display bounds when opening without persisted layout', () => {
    const store = new CommunicationsDockLayoutStore(directory)
    expect(store.get().bounds).toEqual({ x: 750, y: 220, width: 420, height: 640 })
  })
})
