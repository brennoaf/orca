import type { ZApiConversationAvatarSnapshot } from '../../shared/communication-integrations'
import { BoundedMap } from '../../shared/bounded-map'

const FRESH_MS = 24 * 60 * 60 * 1_000
const STALE_MS = 48 * 60 * 60 * 1_000
const NEGATIVE_MS = 60 * 60 * 1_000
const MAX_ENTRIES = 64
const MAX_BYTES = 16 * 1024 * 1024
const MAX_ENTRY_BYTES = 512 * 1024
const MAX_CONCURRENT_LOADS = 4

type AvatarCacheEntry = {
  value: ZApiConversationAvatarCacheValue
  storedAt: number
}

export type ZApiConversationAvatarCacheValue =
  | {
      state: 'available'
      mimeType: Extract<ZApiConversationAvatarSnapshot, { state: 'available' }>['mimeType']
      content: Buffer
    }
  | { state: 'unavailable' }

type AvatarLoadWaiter = {
  configurationId: string
  epoch: number
  resolve: () => void
  reject: (error: Error) => void
}

export class ZApiConversationAvatarCache {
  private readonly entries = new BoundedMap<string, AvatarCacheEntry>({
    maxEntries: MAX_ENTRIES,
    maxBytes: MAX_BYTES,
    maxEntryBytes: MAX_ENTRY_BYTES,
    sizeOf: (entry) => (entry.value.state === 'available' ? entry.value.content.length : 0)
  })
  private readonly inFlight = new Map<string, Promise<ZApiConversationAvatarCacheValue>>()
  private readonly pending = new Set<Promise<ZApiConversationAvatarCacheValue>>()
  private readonly scopeEpoch = new Map<string, number>()
  private readonly waiters: AvatarLoadWaiter[] = []
  private activeLoads = 0
  private epochTicker = 0
  private globalEpoch = 0
  private disposed = false

  constructor(private readonly now: () => number = Date.now) {}

  async load(args: {
    configurationId: string
    conversationId: number
    load: () => Promise<ZApiConversationAvatarCacheValue>
  }): Promise<ZApiConversationAvatarCacheValue> {
    if (this.disposed) {
      throw new Error('Z-API conversation avatar cache is disposed.')
    }
    const key = this.key(args.configurationId, args.conversationId)
    const entry = this.entries.get(key)
    const currentTime = this.now()
    if (entry) {
      const age = currentTime - entry.storedAt
      if (
        (entry.value.state === 'available' && age < FRESH_MS) ||
        (entry.value.state === 'unavailable' && age < NEGATIVE_MS)
      ) {
        return entry.value
      }
      if (
        (entry.value.state === 'available' && age >= STALE_MS) ||
        (entry.value.state === 'unavailable' && age >= NEGATIVE_MS)
      ) {
        this.entries.delete(key)
      }
    }
    const stale =
      entry?.value.state === 'available' && currentTime - entry.storedAt < STALE_MS
        ? entry.value
        : null
    try {
      return await this.singleFlight(key, args.configurationId, args.load)
    } catch (error) {
      if (stale) {
        return stale
      }
      throw error
    }
  }

  clearConfiguration(configurationId: string): void {
    this.scopeEpoch.set(configurationId, this.nextEpoch())
    this.rejectWaiters((waiter) => waiter.configurationId === configurationId)
    const prefix = `${configurationId}::`
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key)
      }
    }
    for (const key of this.inFlight.keys()) {
      if (key.startsWith(prefix)) {
        this.inFlight.delete(key)
      }
    }
  }

  clear(): void {
    this.globalEpoch = this.nextEpoch()
    this.scopeEpoch.clear()
    this.rejectWaiters(() => true)
    this.entries.clear()
    this.inFlight.clear()
  }

  async dispose(): Promise<void> {
    this.disposed = true
    const pending = [...this.pending]
    this.clear()
    await Promise.allSettled(pending)
  }

  private singleFlight(
    key: string,
    configurationId: string,
    load: () => Promise<ZApiConversationAvatarCacheValue>
  ): Promise<ZApiConversationAvatarCacheValue> {
    const existing = this.inFlight.get(key)
    if (existing) {
      return existing
    }
    const epoch = this.currentEpoch(configurationId)
    const promise = this.runLimited(configurationId, epoch, load)
      .then((loaded) => {
        if (this.currentEpoch(configurationId) === epoch) {
          this.entries.set(key, { value: loaded, storedAt: this.now() })
        }
        return loaded
      })
      .finally(() => {
        if (this.inFlight.get(key) === promise) {
          this.inFlight.delete(key)
        }
        this.pending.delete(promise)
      })
    this.inFlight.set(key, promise)
    this.pending.add(promise)
    return promise
  }

  private async runLimited<T>(
    configurationId: string,
    epoch: number,
    run: () => Promise<T>
  ): Promise<T> {
    if (this.activeLoads >= MAX_CONCURRENT_LOADS) {
      await new Promise<void>((resolve, reject) =>
        this.waiters.push({ configurationId, epoch, resolve, reject })
      )
    } else {
      this.activeLoads += 1
    }
    try {
      this.assertCurrent(configurationId, epoch)
      return await run()
    } finally {
      this.activeLoads -= 1
      this.startWaiters()
    }
  }

  private startWaiters(): void {
    while (this.activeLoads < MAX_CONCURRENT_LOADS) {
      const waiter = this.waiters.shift()
      if (!waiter) {
        return
      }
      if (!this.isCurrent(waiter.configurationId, waiter.epoch)) {
        waiter.reject(this.cancelledError())
        continue
      }
      this.activeLoads += 1
      waiter.resolve()
    }
  }

  private rejectWaiters(matches: (waiter: AvatarLoadWaiter) => boolean): void {
    const retained: AvatarLoadWaiter[] = []
    for (const waiter of this.waiters) {
      if (matches(waiter)) {
        waiter.reject(this.cancelledError())
      } else {
        retained.push(waiter)
      }
    }
    this.waiters.length = 0
    this.waiters.push(...retained)
  }

  private assertCurrent(configurationId: string, epoch: number): void {
    if (!this.isCurrent(configurationId, epoch)) {
      throw this.cancelledError()
    }
  }

  private isCurrent(configurationId: string, epoch: number): boolean {
    return !this.disposed && this.currentEpoch(configurationId) === epoch
  }

  private cancelledError(): Error {
    return new Error('Z-API conversation avatar load was cancelled.')
  }

  private key(configurationId: string, conversationId: number): string {
    return `${configurationId}::${conversationId}`
  }

  private nextEpoch(): number {
    this.epochTicker += 1
    return this.epochTicker
  }

  private currentEpoch(configurationId: string): number {
    return Math.max(this.globalEpoch, this.scopeEpoch.get(configurationId) ?? 0)
  }
}
