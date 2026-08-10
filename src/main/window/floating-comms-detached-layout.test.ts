import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  displays: [
    {
      workArea: { x: 0, y: 0, width: 1_920, height: 1_080 }
    }
  ]
}))

vi.mock('electron', () => ({ screen: { getAllDisplays: () => mocks.displays } }))

import {
  FLOATING_COMMS_DETACHED_LAYOUT_FILE,
  FloatingCommsDetachedLayoutStore
} from './floating-comms-detached-layout'

describe('FloatingCommsDetachedLayoutStore', () => {
  let directory: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'orca-floating-comms-layout-'))
    mocks.displays = [{ workArea: { x: 0, y: 0, width: 1_920, height: 1_080 } }]
  })

  afterEach(async () => {
    vi.useRealTimers()
    await rm(directory, { recursive: true, force: true })
  })

  it('round-trips valid per-app DIP bounds without session data', async () => {
    const store = new FloatingCommsDetachedLayoutStore(directory)
    store.set('discord', { x: 120, y: 80, width: 500, height: 480 })
    await store.flush()
    const restored = new FloatingCommsDetachedLayoutStore(directory)
    expect(restored.get('discord')).toEqual({ x: 120, y: 80, width: 500, height: 480 })
    const serialized = await readFile(join(directory, FLOATING_COMMS_DETACHED_LAYOUT_FILE), 'utf8')
    expect(serialized).not.toContain('sessionState')
    expect(serialized).not.toContain('draft')
  })

  it('rejects corrupt and off-screen persisted bounds', async () => {
    const file = join(directory, FLOATING_COMMS_DETACHED_LAYOUT_FILE)
    await writeFile(file, '{broken', 'utf8')
    expect(new FloatingCommsDetachedLayoutStore(directory).get('discord')).toBeNull()
    await writeFile(
      file,
      JSON.stringify({ discord: { x: 8_000, y: 8_000, width: 500, height: 480 } }),
      'utf8'
    )
    expect(new FloatingCommsDetachedLayoutStore(directory).get('discord')).toBeNull()
  })

  it('debounces atomic persistence and keeps the latest bounds', async () => {
    vi.useFakeTimers()
    const store = new FloatingCommsDetachedLayoutStore(directory)
    store.set('slack', { x: 100, y: 100, width: 420, height: 420 })
    store.set('slack', { x: 200, y: 160, width: 520, height: 460 })
    await vi.advanceTimersByTimeAsync(249)
    await expect(
      readFile(join(directory, FLOATING_COMMS_DETACHED_LAYOUT_FILE), 'utf8')
    ).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(1)
    await store.flush()
    expect(new FloatingCommsDetachedLayoutStore(directory).get('slack')).toEqual({
      x: 200,
      y: 160,
      width: 520,
      height: 460
    })
  })
})
