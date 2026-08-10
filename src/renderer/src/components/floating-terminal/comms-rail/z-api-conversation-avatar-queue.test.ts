import { describe, expect, it } from 'vitest'
import { queueZApiConversationAvatarRequest } from './z-api-conversation-avatar-queue'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise: ((value: T) => void) | null = null
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  if (!resolvePromise) {
    throw new Error('Deferred promise resolver was not initialized')
  }
  return { promise, resolve: resolvePromise }
}

describe('queueZApiConversationAvatarRequest', () => {
  it('runs at most four avatar requests concurrently', async () => {
    const started: number[] = []
    const resolvers: (((value: number) => void) | undefined)[] = []
    const firstBatchStarted = deferred<void>()
    const fifthRequestStarted = deferred<void>()
    const requests = Array.from({ length: 5 }, (_, index) =>
      queueZApiConversationAvatarRequest(
        () =>
          new Promise<number>((resolve) => {
            started.push(index)
            resolvers[index] = resolve
            if (started.length === 4) {
              firstBatchStarted.resolve()
            }
            if (index === 4) {
              fifthRequestStarted.resolve()
            }
          })
      )
    )

    await firstBatchStarted.promise
    expect(started).toEqual([0, 1, 2, 3])
    resolvers[0]?.(0)
    await fifthRequestStarted.promise
    expect(started).toEqual([0, 1, 2, 3, 4])
    for (let index = 1; index < resolvers.length; index += 1) {
      resolvers[index]?.(index)
    }
    await expect(Promise.all(requests)).resolves.toEqual([0, 1, 2, 3, 4])
  })

  it('releases every slot after synchronous request failures', async () => {
    const failures = Array.from({ length: 5 }, (_, index) =>
      queueZApiConversationAvatarRequest(() => {
        throw new Error(`failure-${index}`)
      })
    )

    const results = await Promise.allSettled(failures)
    expect(results.every((result) => result.status === 'rejected')).toBe(true)
    await expect(queueZApiConversationAvatarRequest(() => Promise.resolve('next'))).resolves.toBe(
      'next'
    )
  })
})
