// @vitest-environment happy-dom

import { act } from 'react'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  ZApiConversationAvatarSnapshot,
  ZApiConversationKind,
  ZApiConversationSnapshot
} from '../../../../../shared/communication-integrations'
import type { ZApiCommunicationManagerClient } from './communication-manager-runtime'
import { ZApiConversationAvatar } from './ZApiConversationAvatar'

const AVAILABLE_AVATAR: ZApiConversationAvatarSnapshot = {
  state: 'available',
  mimeType: 'image/png',
  contentBase64: 'AQID'
}

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

function createClient(
  getConversationAvatar: ZApiCommunicationManagerClient['getConversationAvatar']
): ZApiCommunicationManagerClient {
  const unexpected = (): Promise<never> => Promise.reject(new Error('Unexpected client call'))
  return {
    getStatus: unexpected,
    getConversationAvatar: vi.fn(getConversationAvatar),
    listConversations: unexpected,
    listMessages: unexpected,
    sendReply: unexpected
  }
}

function conversation(
  id: number,
  conversationKind: ZApiConversationKind,
  displayName: string | null
): ZApiConversationSnapshot {
  return { id, conversationKind, displayName, lastMessageAt: 1 }
}

let observedTarget: Element | null = null
let intersectionCallback: IntersectionObserverCallback | null = null

class ControlledIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '0px'
  readonly scrollMargin = '0px'
  readonly thresholds: readonly number[] = []

  constructor(callback: IntersectionObserverCallback) {
    intersectionCallback = callback
  }

  disconnect(): void {}

  observe(target: Element): void {
    observedTarget = target
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  unobserve(): void {}
}

function emitIntersection(isIntersecting: boolean): void {
  if (!intersectionCallback || !observedTarget) {
    throw new Error('Intersection observer was not initialized')
  }
  const rect = new DOMRectReadOnly()
  intersectionCallback(
    [
      {
        boundingClientRect: rect,
        intersectionRatio: isIntersecting ? 1 : 0,
        intersectionRect: rect,
        isIntersecting,
        rootBounds: null,
        target: observedTarget,
        time: 0
      }
    ],
    {} as IntersectionObserver
  )
}

const originalCreateObjectURL = URL.createObjectURL
const originalRevokeObjectURL = URL.revokeObjectURL

describe('ZApiConversationAvatar', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', undefined)
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:avatar')
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn()
    })
    observedTarget = null
    intersectionCallback = null
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    if (originalCreateObjectURL) {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: originalCreateObjectURL
      })
    } else {
      delete (URL as Partial<typeof URL>).createObjectURL
    }
    if (originalRevokeObjectURL) {
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: originalRevokeObjectURL
      })
    } else {
      delete (URL as Partial<typeof URL>).revokeObjectURL
    }
    vi.restoreAllMocks()
  })

  it('loads visible avatars through the bounded client and creates a typed Blob URL', async () => {
    const client = createClient(() => Promise.resolve(AVAILABLE_AVATAR))
    const view = render(
      <ZApiConversationAvatar
        active
        conversation={conversation(7, 'private', 'Brenno Malafaia')}
        client={client}
      />
    )

    expect(view.container.textContent).toBe('BM')
    await waitFor(() =>
      expect(view.container.querySelector('img')?.getAttribute('src')).toBe('blob:avatar')
    )
    expect(client.getConversationAvatar).toHaveBeenCalledWith({ conversationId: 7 })
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]?.[0]
    if (!(blob instanceof Blob)) {
      throw new Error('Avatar Blob was not created')
    }
    expect(blob.type).toBe('image/png')
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([1, 2, 3])
    expect(view.container.querySelector('img')?.getAttribute('alt')).toBe('')

    view.unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar')
  })

  it('uses stable initials and kind-specific icon fallbacks', () => {
    const client = createClient(() => Promise.resolve({ state: 'unavailable' }))
    const view = render(
      <div>
        <ZApiConversationAvatar
          active
          conversation={conversation(1, 'private', 'Brenno Malafaia')}
          client={client}
        />
        <ZApiConversationAvatar
          active
          conversation={conversation(2, 'private', null)}
          client={client}
        />
        <ZApiConversationAvatar
          active
          conversation={conversation(3, 'group', 'Equipe Giftbox')}
          client={client}
        />
        <ZApiConversationAvatar
          active
          conversation={conversation(4, 'group', null)}
          client={client}
        />
        <ZApiConversationAvatar
          active
          conversation={conversation(5, 'newsletter', 'News')}
          client={client}
        />
        <ZApiConversationAvatar
          active
          conversation={conversation(6, 'broadcast', 'Broadcast')}
          client={client}
        />
        <ZApiConversationAvatar
          active
          conversation={conversation(7, 'unknown', null)}
          client={client}
        />
      </div>
    )

    expect(view.container.textContent).toBe('BMEG')
    expect(view.container.querySelector('.lucide-user-round')).toBeTruthy()
    expect(view.container.querySelector('.lucide-users-round')).toBeTruthy()
    expect(view.container.querySelector('.lucide-radio')).toBeTruthy()
    expect(view.container.querySelector('.lucide-megaphone')).toBeTruthy()
    expect(view.container.querySelector('.lucide-message-circle')).toBeTruthy()
    expect(view.container.querySelector('.animate-spin')).toBeNull()
  })

  it('does not request while inactive or outside the viewport', async () => {
    vi.stubGlobal('IntersectionObserver', ControlledIntersectionObserver)
    const client = createClient(() => Promise.resolve(AVAILABLE_AVATAR))
    const snapshot = conversation(7, 'private', 'Brenno')
    const view = render(
      <ZApiConversationAvatar active={false} conversation={snapshot} client={client} />
    )

    await act(async () => undefined)
    expect(client.getConversationAvatar).not.toHaveBeenCalled()
    view.rerender(<ZApiConversationAvatar active conversation={snapshot} client={client} />)
    act(() => emitIntersection(false))
    expect(client.getConversationAvatar).not.toHaveBeenCalled()
    act(() => emitIntersection(true))
    await waitFor(() => expect(client.getConversationAvatar).toHaveBeenCalledOnce())
  })

  it('never requests newsletter, broadcast, or unknown avatars', async () => {
    const client = createClient(() => Promise.resolve(AVAILABLE_AVATAR))
    const ineligibleAvatars = (
      <>
        <ZApiConversationAvatar
          active
          conversation={conversation(5, 'newsletter', 'News')}
          client={client}
        />
        <ZApiConversationAvatar
          active
          conversation={conversation(6, 'broadcast', 'Broadcast')}
          client={client}
        />
        <ZApiConversationAvatar
          active
          conversation={conversation(7, 'unknown', null)}
          client={client}
        />
      </>
    )
    const view = render(ineligibleAvatars)

    await act(async () => undefined)
    expect(client.getConversationAvatar).not.toHaveBeenCalled()
    view.unmount()

    vi.stubGlobal('IntersectionObserver', ControlledIntersectionObserver)
    render(ineligibleAvatars)
    await act(async () => undefined)
    expect(intersectionCallback).toBeNull()
    expect(client.getConversationAvatar).not.toHaveBeenCalled()
  })

  it('keeps the fallback for unavailable and failed avatar requests', async () => {
    const unavailable = createClient(() => Promise.resolve({ state: 'unavailable' }))
    const failed = createClient(() => Promise.reject(new Error('avatar failed')))
    const view = render(
      <div>
        <ZApiConversationAvatar
          active
          conversation={conversation(1, 'private', 'Brenno')}
          client={unavailable}
        />
        <ZApiConversationAvatar
          active
          conversation={conversation(2, 'group', 'Equipe')}
          client={failed}
        />
      </div>
    )

    await waitFor(() => expect(failed.getConversationAvatar).toHaveBeenCalledOnce())
    expect(view.container.textContent).toBe('BE')
    expect(view.container.querySelector('img')).toBeNull()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('revokes replaced and deactivated avatar URLs', async () => {
    let urlIndex = 0
    vi.mocked(URL.createObjectURL).mockImplementation(() => `blob:avatar-${urlIndex++}`)
    const client = createClient(() => Promise.resolve(AVAILABLE_AVATAR))
    const view = render(
      <ZApiConversationAvatar
        active
        conversation={conversation(1, 'private', 'One')}
        client={client}
      />
    )

    await waitFor(() =>
      expect(view.container.querySelector('img')?.getAttribute('src')).toBe('blob:avatar-0')
    )
    view.rerender(
      <ZApiConversationAvatar
        active
        conversation={conversation(2, 'private', 'Two')}
        client={client}
      />
    )
    await waitFor(() =>
      expect(view.container.querySelector('img')?.getAttribute('src')).toBe('blob:avatar-1')
    )
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar-0')

    view.rerender(
      <ZApiConversationAvatar
        active={false}
        conversation={conversation(2, 'private', 'Two')}
        client={client}
      />
    )
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar-1')
    expect(view.container.querySelector('img')).toBeNull()
  })

  it('revokes a URL created by a response that arrives after unmount', async () => {
    const avatar = deferred<ZApiConversationAvatarSnapshot>()
    const client = createClient(() => avatar.promise)
    const view = render(
      <ZApiConversationAvatar
        active
        conversation={conversation(7, 'private', 'Brenno')}
        client={client}
      />
    )
    await waitFor(() => expect(client.getConversationAvatar).toHaveBeenCalledOnce())
    view.unmount()

    avatar.resolve(AVAILABLE_AVATAR)
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar'))
  })

  it('does not refetch or recreate the avatar when polling replaces the same conversation', async () => {
    const client = createClient(() => Promise.resolve(AVAILABLE_AVATAR))
    const view = render(
      <ZApiConversationAvatar
        active
        conversation={conversation(7, 'private', 'Before')}
        client={client}
      />
    )
    await waitFor(() => expect(view.container.querySelector('img')).toBeTruthy())

    view.rerender(
      <ZApiConversationAvatar
        active
        conversation={conversation(7, 'private', 'After')}
        client={client}
      />
    )
    await act(async () => undefined)
    expect(client.getConversationAvatar).toHaveBeenCalledOnce()
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })
})
