import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FloatingCommsAttachedHeightStore } from './floating-comms-attached-height'

describe('FloatingCommsAttachedHeightStore', () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'orca-floating-comms-attached-'))
  })
  afterEach(async () => rm(directory, { recursive: true, force: true }))

  it('normalizes corruption and persists each app independently', async () => {
    await writeFile(join(directory, 'floating-comms-attached-height.json'), '{broken', 'utf8')
    const store = new FloatingCommsAttachedHeightStore(directory)
    expect(store.get('whatsapp-web')).toBe(520)
    store.set('whatsapp-web', 721)
    store.set('discord', 419)
    await store.flush()
    expect(new FloatingCommsAttachedHeightStore(directory).get('whatsapp-web')).toBe(720)
    expect(new FloatingCommsAttachedHeightStore(directory).get('discord')).toBe(420)
    expect(
      await readFile(join(directory, 'floating-comms-attached-height.json'), 'utf8')
    ).toContain('whatsapp-web')
  })

  it('reports the current failure and runs later writes serially', async () => {
    const blocked = join(directory, 'blocked')
    await writeFile(blocked, 'not-a-directory', 'utf8')
    const store = new FloatingCommsAttachedHeightStore(blocked)

    store.set('whatsapp-web', 600)
    await expect(store.flush()).rejects.toBeTruthy()

    await rm(blocked)
    await mkdir(blocked)
    store.set('whatsapp-web', 610)
    store.set('discord', 620)
    await expect(store.flush()).resolves.toBeUndefined()

    const persisted: unknown = JSON.parse(
      await readFile(join(blocked, 'floating-comms-attached-height.json'), 'utf8')
    )
    expect(persisted).toEqual({ 'whatsapp-web': 610, discord: 620 })
  })
})
