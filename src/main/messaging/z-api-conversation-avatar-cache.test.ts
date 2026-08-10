import { describe, expect, it, vi } from 'vitest'
import {
  ZApiConversationAvatarCache,
  type ZApiConversationAvatarCacheValue
} from './z-api-conversation-avatar-cache'

function available(value: string | Buffer): ZApiConversationAvatarCacheValue {
  return {
    state: 'available',
    mimeType: 'image/png',
    content: typeof value === 'string' ? Buffer.from(value) : value
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise: ((value: T) => void) | null = null
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  if (!resolvePromise) {
    throw new Error('Deferred promise resolver was not initialized.')
  }
  return { promise, resolve: resolvePromise }
}

async function saturatedCache(): Promise<{
  cache: ZApiConversationAvatarCache
  active: Promise<ZApiConversationAvatarCacheValue>[]
  gates: ReturnType<typeof deferred<ZApiConversationAvatarCacheValue>>[]
  queued: Promise<ZApiConversationAvatarCacheValue>
  queuedLoad: ReturnType<typeof vi.fn>
}> {
  const cache = new ZApiConversationAvatarCache()
  const gates = Array.from({ length: 4 }, () => deferred<ZApiConversationAvatarCacheValue>())
  let started = 0
  const active = gates.map((gate, conversationId) =>
    cache.load({
      configurationId: 'configuration',
      conversationId,
      load: () => {
        started += 1
        return gate.promise
      }
    })
  )
  await vi.waitFor(() => expect(started).toBe(4))
  const queuedLoad = vi.fn(async () => available('queued'))
  const queued = cache.load({
    configurationId: 'configuration',
    conversationId: 4,
    load: queuedLoad
  })
  await Promise.resolve()
  expect(queuedLoad).not.toHaveBeenCalled()
  return { cache, active, gates, queued, queuedLoad }
}

describe('ZApiConversationAvatarCache', () => {
  it('keeps available entries fresh for 24 hours and negative entries for one hour', async () => {
    let now = 0
    const cache = new ZApiConversationAvatarCache(() => now)
    const loadAvailable = vi.fn(async () => available(`value-${now}`))
    const args = { configurationId: 'configuration', conversationId: 1, load: loadAvailable }

    await expect(cache.load(args)).resolves.toEqual(available('value-0'))
    now = 24 * 60 * 60 * 1_000 - 1
    await expect(cache.load(args)).resolves.toEqual(available('value-0'))
    now += 1
    await expect(cache.load(args)).resolves.toEqual(available(`value-${now}`))
    expect(loadAvailable).toHaveBeenCalledTimes(2)

    now = 0
    const negative = new ZApiConversationAvatarCache(() => now)
    const loadNegative = vi.fn(async () => ({
      state: 'unavailable' as const
    }))
    const negativeArgs = { configurationId: 'configuration', conversationId: 2, load: loadNegative }
    await negative.load(negativeArgs)
    now = 60 * 60 * 1_000 - 1
    await negative.load(negativeArgs)
    now += 1
    await negative.load(negativeArgs)
    expect(loadNegative).toHaveBeenCalledTimes(2)
  })

  it('uses a stale available entry only when refresh fails before 48 hours', async () => {
    let now = 0
    const cache = new ZApiConversationAvatarCache(() => now)
    const initial = vi.fn(async () => available('initial'))
    await cache.load({ configurationId: 'configuration', conversationId: 1, load: initial })

    now = 25 * 60 * 60 * 1_000
    const failedRefresh = vi.fn(async (): Promise<ZApiConversationAvatarCacheValue> => {
      throw new Error('refresh failed')
    })
    await expect(
      cache.load({
        configurationId: 'configuration',
        conversationId: 1,
        load: failedRefresh
      })
    ).resolves.toEqual(available('initial'))

    now = 48 * 60 * 60 * 1_000
    await expect(
      cache.load({
        configurationId: 'configuration',
        conversationId: 1,
        load: failedRefresh
      })
    ).rejects.toThrow('refresh failed')
  })

  it('single-flights equal keys and admits at most four concurrent loads', async () => {
    const cache = new ZApiConversationAvatarCache()
    const shared = deferred<ZApiConversationAvatarCacheValue>()
    const loadShared = vi.fn(() => shared.promise)
    const first = cache.load({
      configurationId: 'configuration',
      conversationId: 1,
      load: loadShared
    })
    const second = cache.load({
      configurationId: 'configuration',
      conversationId: 1,
      load: loadShared
    })
    expect(loadShared).toHaveBeenCalledOnce()
    shared.resolve(available('shared'))
    await expect(Promise.all([first, second])).resolves.toEqual([
      available('shared'),
      available('shared')
    ])

    let active = 0
    let peak = 0
    let started = 0
    const gates = Array.from({ length: 5 }, () => deferred<ZApiConversationAvatarCacheValue>())
    const promises = gates.map((gate, index) =>
      cache.load({
        configurationId: 'concurrent',
        conversationId: index,
        load: async () => {
          started += 1
          active += 1
          peak = Math.max(peak, active)
          const result = await gate.promise
          active -= 1
          return result
        }
      })
    )
    await vi.waitFor(() => expect(started).toBe(4))
    gates[0]?.resolve(available('zero'))
    await vi.waitFor(() => expect(started).toBe(5))
    expect(active).toBe(4)
    for (let index = 1; index < gates.length; index += 1) {
      gates[index]?.resolve(available(String(index)))
    }
    await Promise.all(promises)
    expect(peak).toBe(4)
  })

  it('enforces entry count, aggregate bytes, and per-entry bytes', async () => {
    const countCache = new ZApiConversationAvatarCache()
    const countLoad = vi.fn(async (value: number) => available(String(value)))
    for (let conversationId = 0; conversationId < 65; conversationId += 1) {
      await countCache.load({
        configurationId: 'count',
        conversationId,
        load: () => countLoad(conversationId)
      })
    }
    await countCache.load({
      configurationId: 'count',
      conversationId: 0,
      load: () => countLoad(0)
    })
    expect(countLoad).toHaveBeenCalledTimes(66)

    const byteCache = new ZApiConversationAvatarCache()
    const byteLoad = vi.fn(async (value: number) => available(Buffer.alloc(300 * 1024, value)))
    for (let conversationId = 0; conversationId < 55; conversationId += 1) {
      await byteCache.load({
        configurationId: 'bytes',
        conversationId,
        load: () => byteLoad(conversationId)
      })
    }
    await byteCache.load({
      configurationId: 'bytes',
      conversationId: 0,
      load: () => byteLoad(0)
    })
    expect(byteLoad).toHaveBeenCalledTimes(56)

    const entryCache = new ZApiConversationAvatarCache()
    const oversized = vi.fn(async () => available(Buffer.alloc(512 * 1024 + 1)))
    await entryCache.load({ configurationId: 'entry', conversationId: 1, load: oversized })
    await entryCache.load({ configurationId: 'entry', conversationId: 1, load: oversized })
    expect(oversized).toHaveBeenCalledTimes(2)
  })

  it('prevents cleared in-flight entries from repopulating and waits for them on dispose', async () => {
    const cache = new ZApiConversationAvatarCache()
    const pending = deferred<ZApiConversationAvatarCacheValue>()
    const firstLoad = vi.fn(() => pending.promise)
    const first = cache.load({
      configurationId: 'configuration',
      conversationId: 1,
      load: firstLoad
    })
    cache.clearConfiguration('configuration')
    pending.resolve(available('old'))
    await expect(first).resolves.toEqual(available('old'))

    const replacement = vi.fn(async () => available('new'))
    await expect(
      cache.load({ configurationId: 'configuration', conversationId: 1, load: replacement })
    ).resolves.toEqual(available('new'))
    expect(replacement).toHaveBeenCalledOnce()

    const finalPending = deferred<ZApiConversationAvatarCacheValue>()
    const finalLoad = cache.load({
      configurationId: 'configuration',
      conversationId: 2,
      load: () => finalPending.promise
    })
    let disposed = false
    const disposal = cache.dispose().then(() => {
      disposed = true
    })
    await Promise.resolve()
    expect(disposed).toBe(false)
    finalPending.resolve(available('final'))
    await Promise.all([finalLoad, disposal])
    await expect(
      cache.load({
        configurationId: 'configuration',
        conversationId: 2,
        load: async () => available('unexpected')
      })
    ).rejects.toThrow('disposed')
  })

  it.each(['configuration', 'global'] as const)(
    'cancels queued loads on %s clear and does not repopulate from active completions',
    async (scope) => {
      const value = await saturatedCache()
      const queuedRejection = expect(value.queued).rejects.toThrow('cancelled')
      if (scope === 'configuration') {
        value.cache.clearConfiguration('configuration')
      } else {
        value.cache.clear()
      }
      await queuedRejection
      expect(value.queuedLoad).not.toHaveBeenCalled()
      value.gates.forEach((gate, index) => gate.resolve(available(`old-${index}`)))
      await Promise.all(value.active)

      const replacement = vi.fn(async () => available('replacement'))
      await value.cache.load({
        configurationId: 'configuration',
        conversationId: 0,
        load: replacement
      })
      expect(replacement).toHaveBeenCalledOnce()
    }
  )

  it('cancels queued loads immediately on dispose while waiting only for active loads', async () => {
    const value = await saturatedCache()
    const queuedRejection = expect(value.queued).rejects.toThrow('cancelled')
    let disposed = false
    const disposal = value.cache.dispose().then(() => {
      disposed = true
    })

    await queuedRejection
    expect(value.queuedLoad).not.toHaveBeenCalled()
    expect(disposed).toBe(false)
    value.gates.forEach((gate, index) => gate.resolve(available(`old-${index}`)))
    await Promise.all([...value.active, disposal])
    expect(disposed).toBe(true)
  })
})
