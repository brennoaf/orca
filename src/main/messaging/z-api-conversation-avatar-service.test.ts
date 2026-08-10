import { describe, expect, it, vi } from 'vitest'
import type { MessagingReplyDestination } from './message-store'
import { ZApiConversationAvatarCache } from './z-api-conversation-avatar-cache'
import { ZApiConversationAvatarService } from './z-api-conversation-avatar-service'
import type { ZApiTransactionConfiguration } from './z-api-transaction-journal'

function configuration(
  overrides: Partial<ZApiTransactionConfiguration> = {}
): ZApiTransactionConfiguration {
  return {
    configurationId: '11111111111111111111111111111111',
    instanceId: 'instance-1',
    instanceToken: 'instance-secret',
    clientToken: 'client-secret',
    baseUrl: 'https://api.z-api.io',
    endpointTrust: { kind: 'default' },
    publicWebhookBaseUrl: 'https://hook.example.com',
    secretPath: '/secret/path',
    listenPort: 4321,
    ...overrides
  }
}

function destination(
  overrides: Partial<MessagingReplyDestination> = {}
): MessagingReplyDestination {
  return {
    provider: 'z-api',
    instanceId: 'instance-1',
    conversationAddress: '120363019502650977-group',
    conversationKind: 'group',
    ...overrides
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

function fixture(
  args: {
    configuration?: ZApiTransactionConfiguration | null
    destination?: MessagingReplyDestination | null
    profileThumbnail?: string | null
  } = {}
) {
  const active = args.configuration === undefined ? configuration() : args.configuration
  const replyDestination = args.destination === undefined ? destination() : args.destination
  const getReplyDestination = vi.fn(() => replyDestination)
  const getChatMetadata = vi.fn(async () => ({
    profileThumbnail:
      args.profileThumbnail === undefined
        ? 'https://cdn.example.com/avatar.png?signature=secret'
        : args.profileThumbnail
  }))
  const createClient = vi.fn(() => ({ getChatMetadata }))
  const downloadImage = vi.fn(async () => ({
    mimeType: 'image/png' as const,
    content: Buffer.from([0x89, 0x50, 0x4e, 0x47])
  }))
  const cache = new ZApiConversationAvatarCache()
  const service = new ZApiConversationAvatarService({
    messageStore: { getReplyDestination },
    getConfiguration: () => active,
    createClient,
    downloadImage,
    cache
  })
  return { service, cache, getReplyDestination, getChatMetadata, createClient, downloadImage }
}

describe('ZApiConversationAvatarService', () => {
  it.each(['private', 'group'] as const)(
    'loads and encodes an avatar for a %s conversation without returning provider identifiers',
    async (conversationKind) => {
      const value = fixture({ destination: destination({ conversationKind }) })
      const result = await value.service.getConversationAvatar(7)

      expect(result).toEqual({
        state: 'available',
        mimeType: 'image/png',
        contentBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')
      })
      expect(value.getReplyDestination).toHaveBeenCalledTimes(2)
      expect(value.getReplyDestination).toHaveBeenNthCalledWith(1, 7)
      expect(value.getReplyDestination).toHaveBeenNthCalledWith(2, 7)
      expect(value.getChatMetadata).toHaveBeenCalledExactlyOnceWith('120363019502650977-group')
      expect(value.downloadImage).toHaveBeenCalledExactlyOnceWith(
        'https://cdn.example.com/avatar.png?signature=secret'
      )
      expect(JSON.stringify(result)).not.toMatch(/instance|token|secret|example|120363/u)
    }
  )

  it('returns unavailable without downloading when metadata has no thumbnail', async () => {
    const value = fixture({ profileThumbnail: null })
    await expect(value.service.getConversationAvatar(7)).resolves.toEqual({
      state: 'unavailable'
    })
    expect(value.downloadImage).not.toHaveBeenCalled()
  })

  it.each(['newsletter', 'broadcast', 'unknown'] as const)(
    'returns unavailable without network access for a %s conversation',
    async (conversationKind) => {
      const value = fixture({ destination: destination({ conversationKind }) })
      await expect(value.service.getConversationAvatar(7)).resolves.toEqual({
        state: 'unavailable'
      })
      expect(value.createClient).not.toHaveBeenCalled()
      expect(value.downloadImage).not.toHaveBeenCalled()
    }
  )

  it.each([
    { active: null, reply: destination() },
    { active: configuration(), reply: null },
    {
      active: configuration(),
      reply: destination({ instanceId: 'different-instance' })
    }
  ])('rejects a conversation outside the active instance before network access', async (entry) => {
    const value = fixture({ configuration: entry.active, destination: entry.reply })
    await expect(value.service.getConversationAvatar(7)).rejects.toThrow(
      'does not belong to the active Z-API instance'
    )
    expect(value.createClient).not.toHaveBeenCalled()
  })

  it('single-flights through the cache and scopes entries by configuration', async () => {
    let active = configuration()
    const getChatMetadata = vi.fn(async () => ({ profileThumbnail: 'https://cdn.example.com/a' }))
    const downloadImage = vi.fn(async () => ({
      mimeType: 'image/jpeg' as const,
      content: Buffer.from([0xff, 0xd8, 0xff])
    }))
    const service = new ZApiConversationAvatarService({
      messageStore: { getReplyDestination: () => destination() },
      getConfiguration: () => active,
      createClient: () => ({ getChatMetadata }),
      downloadImage
    })

    await Promise.all([service.getConversationAvatar(7), service.getConversationAvatar(7)])
    expect(getChatMetadata).toHaveBeenCalledOnce()
    active = configuration({ configurationId: '22222222222222222222222222222222' })
    await service.getConversationAvatar(7)
    expect(getChatMetadata).toHaveBeenCalledTimes(2)
  })

  it('revalidates configuration and destination after waiting for a cache slot', async () => {
    const cache = new ZApiConversationAvatarCache()
    const gates = Array.from({ length: 4 }, () => deferred<{ state: 'unavailable' }>())
    let started = 0
    const blockers = gates.map((gate, conversationId) =>
      cache.load({
        configurationId: 'blocker',
        conversationId,
        load: () => {
          started += 1
          return gate.promise
        }
      })
    )
    await vi.waitFor(() => expect(started).toBe(4))
    let active = configuration()
    let currentDestination = destination()
    const createClient = vi.fn(() => ({
      getChatMetadata: vi.fn(async () => ({ profileThumbnail: null }))
    }))
    const service = new ZApiConversationAvatarService({
      messageStore: { getReplyDestination: () => currentDestination },
      getConfiguration: () => active,
      createClient,
      cache
    })
    const request = service.getConversationAvatar(7)
    const rejection = expect(request).rejects.toThrow('could not be loaded')

    active = configuration({ configurationId: '22222222222222222222222222222222' })
    currentDestination = destination({ conversationAddress: 'different-address' })
    gates[0]?.resolve({ state: 'unavailable' })
    await rejection
    expect(createClient).not.toHaveBeenCalled()
    for (let index = 1; index < gates.length; index += 1) {
      gates[index]?.resolve({ state: 'unavailable' })
    }
    await Promise.all(blockers)
  })

  it('redacts provider failures and delegates cache lifecycle cleanup', async () => {
    const value = fixture()
    value.getChatMetadata.mockRejectedValueOnce(new Error('secret-url-and-token'))
    const error = await value.service.getConversationAvatar(7).catch((reason: unknown) => reason)
    expect(String(error)).toBe('Error: The WhatsApp conversation avatar could not be loaded.')

    const clearConfiguration = vi.spyOn(value.cache, 'clearConfiguration')
    const clear = vi.spyOn(value.cache, 'clear')
    const dispose = vi.spyOn(value.cache, 'dispose')
    value.service.clearConfiguration('11111111111111111111111111111111')
    value.service.clear()
    await value.service.dispose()
    expect(clearConfiguration).toHaveBeenCalledExactlyOnceWith('11111111111111111111111111111111')
    expect(clear).toHaveBeenCalled()
    expect(dispose).toHaveBeenCalledOnce()
  })
})
