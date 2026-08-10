// @vitest-environment happy-dom

import { act } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CommunicationIntegrationStatus,
  ZApiCommunicationIntegrationStatus,
  ZApiMessageSnapshot
} from '../../../../../shared/communication-integrations'
import { emptyDiscordVoiceSnapshot } from '../../../../../shared/discord-voice'
import {
  CommunicationManagerRuntimeProvider,
  type CommunicationManagerRuntime,
  type ZApiCommunicationManagerClient
} from './communication-manager-runtime'
import {
  isZApiFastResponseReady,
  ZApiCommunicationManagerPresentation
} from './ZApiCommunicationManager'

const READY_STATUS: ZApiCommunicationIntegrationStatus = {
  provider: 'z-api',
  endpoint: {
    baseUrl: 'https://api.z-api.io',
    authority: 'api.z-api.io',
    trust: { kind: 'default' }
  },
  readiness: {
    configured: true,
    verified: true,
    sendReady: true,
    receiveReady: true,
    verifiedAt: '2026-08-09T12:00:00.000Z',
    lastError: null
  },
  instanceId: 'instance',
  instanceTokenStored: true,
  clientTokenStored: true,
  instanceConnected: true,
  smartphoneConnected: true,
  ingressPrepared: true,
  listenPort: 8787,
  localTunnelTarget: 'http://127.0.0.1:8787',
  publicWebhookBaseUrl: 'https://example.trycloudflare.com',
  publicIngressVerified: true,
  webhooksConfigured: true,
  lastErrorCode: null
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolvePromise: ((value: T) => void) | null = null
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return {
    promise,
    resolve: (value) => {
      if (!resolvePromise) {
        throw new Error('Deferred promise is unavailable')
      }
      resolvePromise(value)
    }
  }
}

function createClient(): ZApiCommunicationManagerClient {
  return {
    getStatus: vi.fn(() => Promise.resolve(READY_STATUS)),
    listConversations: vi.fn(() =>
      Promise.resolve({
        conversations: [
          {
            id: 7,
            conversationKind: 'private' as const,
            displayName: 'Brenno',
            lastMessageAt: Date.now()
          }
        ],
        nextOffset: null
      })
    ),
    listMessages: vi.fn(() => Promise.resolve({ messages: [], nextOffset: null })),
    sendReply: vi.fn(() =>
      Promise.resolve({
        ok: true as const,
        status: READY_STATUS,
        value: { providerMessageId: 'message-1', deliveryStatus: 'sent' as const }
      })
    )
  }
}

function createRuntime(client: ZApiCommunicationManagerClient): CommunicationManagerRuntime {
  return {
    commandDiscord: vi.fn(() => Promise.resolve(emptyDiscordVoiceSnapshot())),
    loadIntegrationStatuses: vi.fn(() => Promise.resolve([READY_STATUS])),
    openSettings: vi.fn(),
    overlayOpen: false,
    setOverlayOpen: vi.fn(),
    zApi: client
  }
}

function renderManager(
  client: ZApiCommunicationManagerClient,
  isPopoverOpen = true
): ReturnType<typeof render> {
  return render(<ManagerHarness runtime={createRuntime(client)} isPopoverOpen={isPopoverOpen} />)
}

function ManagerHarness({
  runtime,
  isPopoverOpen
}: {
  runtime: CommunicationManagerRuntime
  isPopoverOpen: boolean
}): React.JSX.Element {
  return (
    <CommunicationManagerRuntimeProvider runtime={runtime}>
      <ZApiCommunicationManagerPresentation isPopoverOpen={isPopoverOpen}>
        {(presentation) => <div data-status={presentation.status.kind}>{presentation.content}</div>}
      </ZApiCommunicationManagerPresentation>
    </CommunicationManagerRuntimeProvider>
  )
}

describe('ZApiCommunicationManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('requires local, provider, send, receive, and webhook readiness', () => {
    expect(isZApiFastResponseReady(READY_STATUS)).toBe(true)
    expect(
      isZApiFastResponseReady({
        ...READY_STATUS,
        webhooksConfigured: false
      })
    ).toBe(false)
    expect(
      isZApiFastResponseReady({
        ...READY_STATUS,
        readiness: { ...READY_STATUS.readiness, sendReady: false }
      })
    ).toBe(false)
    expect(
      isZApiFastResponseReady({
        ...READY_STATUS,
        smartphoneConnected: null
      })
    ).toBe(false)
  })

  it('does not fetch manager data while the surface is closed', async () => {
    const client = createClient()
    renderManager(client, false)
    await act(async () => undefined)
    expect(client.getStatus).not.toHaveBeenCalled()
    expect(client.listConversations).not.toHaveBeenCalled()
  })

  it('keeps an explicit loading state until runtime statuses resolve', async () => {
    const statuses = deferred<readonly CommunicationIntegrationStatus[]>()
    const client = createClient()
    const runtime = createRuntime(client)
    vi.mocked(runtime.loadIntegrationStatuses).mockReturnValue(statuses.promise)
    const view = render(<ManagerHarness runtime={runtime} isPopoverOpen />)

    expect(view.container.firstElementChild?.getAttribute('data-status')).toBe('loading')
    expect(screen.getByText('Loading WhatsApp fast responses…')).toBeTruthy()
    expect(client.getStatus).not.toHaveBeenCalled()

    statuses.resolve([READY_STATUS])
    await waitFor(() =>
      expect(view.container.firstElementChild?.getAttribute('data-status')).toBe('idle')
    )
    expect(client.getStatus).toHaveBeenCalled()
  })

  it('ignores a stale status response after the runtime changes', async () => {
    const firstStatuses = deferred<readonly CommunicationIntegrationStatus[]>()
    const secondStatuses = deferred<readonly CommunicationIntegrationStatus[]>()
    const client = createClient()
    const firstRuntime = createRuntime(client)
    const secondRuntime = createRuntime(client)
    vi.mocked(firstRuntime.loadIntegrationStatuses).mockReturnValue(firstStatuses.promise)
    vi.mocked(secondRuntime.loadIntegrationStatuses).mockReturnValue(secondStatuses.promise)
    const view = render(<ManagerHarness runtime={firstRuntime} isPopoverOpen />)

    view.rerender(<ManagerHarness runtime={secondRuntime} isPopoverOpen />)
    firstStatuses.resolve([READY_STATUS])
    await act(async () => {
      await Promise.resolve()
    })
    expect(view.container.firstElementChild?.getAttribute('data-status')).toBe('loading')

    secondStatuses.resolve([READY_STATUS])
    await waitFor(() =>
      expect(view.container.firstElementChild?.getAttribute('data-status')).toBe('idle')
    )
  })

  it('discards a pending status response after the surface closes', async () => {
    const statuses = deferred<readonly CommunicationIntegrationStatus[]>()
    const client = createClient()
    const runtime = createRuntime(client)
    vi.mocked(runtime.loadIntegrationStatuses).mockReturnValue(statuses.promise)
    const view = render(<ManagerHarness runtime={runtime} isPopoverOpen />)

    view.rerender(<ManagerHarness runtime={runtime} isPopoverOpen={false} />)
    statuses.resolve([READY_STATUS])
    await act(async () => {
      await Promise.resolve()
    })
    expect(view.container.firstElementChild?.getAttribute('data-status')).toBe('loading')
    expect(client.getStatus).not.toHaveBeenCalled()
  })

  it('renders a redacted unavailable state only after status loading fails', async () => {
    const client = createClient()
    const runtime = createRuntime(client)
    vi.mocked(runtime.loadIntegrationStatuses).mockRejectedValue(
      new Error('secret-client-token-value')
    )
    const view = render(<ManagerHarness runtime={runtime} isPopoverOpen />)

    expect(view.container.firstElementChild?.getAttribute('data-status')).toBe('loading')
    await waitFor(() =>
      expect(view.container.firstElementChild?.getAttribute('data-status')).toBe('unavailable')
    )
    expect(screen.getByRole('alert').textContent).toBe(
      'Could not load communication integration status.'
    )
    expect(view.container.textContent).not.toContain('secret-client-token-value')
    expect(client.getStatus).not.toHaveBeenCalled()
  })

  it('stops every poll while hidden and resumes one chain when shown again', async () => {
    vi.useFakeTimers()
    const client = createClient()
    const runtime = createRuntime(client)
    const view = render(<ManagerHarness runtime={runtime} isPopoverOpen />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    const conversation = screen.getByRole('button', { name: /Brenno/ })
    act(() => conversation.click())
    await act(async () => {
      await Promise.resolve()
    })
    expect(client.listMessages).toHaveBeenCalledOnce()

    view.rerender(<ManagerHarness runtime={runtime} isPopoverOpen={false} />)
    await act(async () => {
      await Promise.resolve()
    })
    vi.mocked(client.getStatus).mockClear()
    vi.mocked(client.listConversations).mockClear()
    vi.mocked(client.listMessages).mockClear()
    await act(async () => vi.advanceTimersByTimeAsync(20_000))
    expect(client.getStatus).not.toHaveBeenCalled()
    expect(client.listConversations).not.toHaveBeenCalled()
    expect(client.listMessages).not.toHaveBeenCalled()

    view.rerender(<ManagerHarness runtime={runtime} isPopoverOpen />)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(client.getStatus).toHaveBeenCalledOnce()
    expect(client.listConversations).toHaveBeenCalledOnce()
    expect(client.listMessages).toHaveBeenCalledOnce()
    await act(async () => vi.advanceTimersByTimeAsync(2_100))
    expect(client.getStatus).toHaveBeenCalledOnce()
    expect(client.listConversations).toHaveBeenCalledOnce()
    expect(client.listMessages).toHaveBeenCalledTimes(2)
  })

  it('lists recent conversations and renders text and unsupported persisted messages', async () => {
    const client = createClient()
    const outboundMessages: ZApiMessageSnapshot[] = (['pending', 'sent', 'failed'] as const).map(
      (deliveryStatus, index) => ({
        id: index + 3,
        conversationId: 7,
        providerMessageId: `outgoing-${index}`,
        senderName: null,
        direction: 'outbound',
        contentKind: 'text',
        text: `Reply ${index}`,
        providerContentType: 'text',
        occurredAt: Date.now(),
        deliveryStatus
      })
    )
    const messages: ZApiMessageSnapshot[] = [
      {
        id: 1,
        conversationId: 7,
        providerMessageId: 'incoming-1',
        senderName: 'Brenno',
        direction: 'inbound',
        contentKind: 'text',
        text: 'Oi',
        providerContentType: 'text',
        occurredAt: Date.now(),
        deliveryStatus: 'received'
      },
      {
        id: 2,
        conversationId: 7,
        providerMessageId: 'incoming-2',
        senderName: 'Brenno',
        direction: 'inbound',
        contentKind: 'unsupported',
        text: null,
        providerContentType: 'image',
        occurredAt: Date.now(),
        deliveryStatus: 'received'
      },
      ...outboundMessages
    ]
    vi.mocked(client.listMessages).mockResolvedValue({ messages, nextOffset: null })
    renderManager(client)
    await userEvent.click(await screen.findByRole('button', { name: /Brenno/ }))
    expect(await screen.findByText('Oi')).toBeTruthy()
    expect(screen.getByText('Unsupported message · image')).toBeTruthy()
    expect(screen.getByText(/Pending/)).toBeTruthy()
    expect(screen.getByText(/Sent/)).toBeTruthy()
    expect(screen.getByText(/Failed/)).toBeTruthy()
    expect(client.listMessages).toHaveBeenCalledWith({
      conversationId: 7,
      limit: 20,
      offset: 0
    })
  })

  it('sends by conversation id and warns without retrying an ambiguous send', async () => {
    const client = createClient()
    const unknownMessage: ZApiMessageSnapshot = {
      id: 3,
      conversationId: 7,
      providerMessageId: null,
      senderName: null,
      direction: 'outbound',
      contentKind: 'text',
      text: 'Teste',
      providerContentType: 'text',
      occurredAt: Date.now(),
      deliveryStatus: 'unknown'
    }
    vi.mocked(client.sendReply).mockResolvedValue({
      ok: false,
      status: READY_STATUS,
      error: {
        code: 'ambiguous_send',
        message: 'Delivery could not be confirmed.',
        field: null
      }
    })
    vi.mocked(client.listMessages).mockImplementation(() =>
      Promise.resolve({
        messages: vi.mocked(client.sendReply).mock.calls.length > 0 ? [unknownMessage] : [],
        nextOffset: null
      })
    )
    renderManager(client)
    await userEvent.click(await screen.findByRole('button', { name: /Brenno/ }))
    await userEvent.type(screen.getByLabelText('Reply on WhatsApp'), 'Teste')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(
      await screen.findByText(
        'This message may have been delivered. Check WhatsApp before sending it again.'
      )
    ).toBeTruthy()
    expect(await screen.findByText(/Delivery unknown/)).toBeTruthy()
    expect(client.sendReply).toHaveBeenCalledTimes(1)
    expect(client.sendReply).toHaveBeenCalledWith({ conversationId: 7, text: 'Teste' })
    await waitFor(() => expect(client.listMessages).toHaveBeenCalledTimes(2))
  })
})
