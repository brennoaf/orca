import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ZApiAttentionSnapshot } from '../../shared/communication-integrations'

const {
  handlers,
  handleMock,
  getRuntimeMock,
  getSnapshotMock,
  markConversationSeenMock,
  isTrustedMock,
  isDockSenderMock,
  getSurfaceStateMock,
  canMarkSeenMock
} = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  handleMock: vi.fn(),
  getRuntimeMock: vi.fn(),
  getSnapshotMock: vi.fn(),
  markConversationSeenMock: vi.fn(),
  isTrustedMock: vi.fn(),
  isDockSenderMock: vi.fn(),
  getSurfaceStateMock: vi.fn(),
  canMarkSeenMock: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: handleMock }
}))
vi.mock('../messaging/z-api-attention-events', () => ({
  onZApiInboundAttention: vi.fn()
}))
vi.mock('../messaging/z-api-attention-visibility-state', () => ({
  setZApiAttentionVisibilityResolver: vi.fn()
}))
vi.mock('../messaging/z-api-communication-runtime', () => ({
  getZApiCommunicationRuntime: getRuntimeMock
}))
vi.mock('../window/communications-dock-controller', () => ({
  communicationsDockController: { isSender: isDockSenderMock }
}))
vi.mock('../window/floating-comms-surface-controller', () => ({
  floatingCommsSurfaceController: { getStateForSender: getSurfaceStateMock }
}))
vi.mock('../window/z-api-attention-visibility', () => ({
  canMarkZApiAttentionSeen: canMarkSeenMock,
  isZApiAttentionVisible: vi.fn(() => false)
}))
vi.mock('./ui', () => ({ isTrustedUIRenderer: isTrustedMock }))

import { registerZApiAttentionHandlers } from './z-api-attention'

const SNAPSHOT: ZApiAttentionSnapshot = {
  provider: 'z-api',
  totalUnread: 1,
  conversations: [{ conversationId: 7, unreadCount: 1 }]
}

function handler(
  channel: string
): (event: { sender: Electron.WebContents }, value?: unknown) => unknown {
  const registered = handlers.get(channel)
  if (!registered) {
    throw new Error(`Missing IPC handler: ${channel}`)
  }
  return registered as (event: { sender: Electron.WebContents }, value?: unknown) => unknown
}

describe('Z-API attention IPC', () => {
  beforeEach(() => {
    handlers.clear()
    handleMock
      .mockReset()
      .mockImplementation((channel: string, registered: (...args: unknown[]) => unknown) => {
        handlers.set(channel, registered)
      })
    getSnapshotMock.mockReset().mockReturnValue(SNAPSHOT)
    markConversationSeenMock.mockReset().mockReturnValue({
      provider: 'z-api',
      totalUnread: 0,
      conversations: []
    })
    getRuntimeMock.mockReset().mockResolvedValue({
      store: {
        getAttentionSnapshot: getSnapshotMock,
        markConversationSeen: markConversationSeenMock
      }
    })
    isTrustedMock.mockReset().mockReturnValue(true)
    isDockSenderMock.mockReset().mockReturnValue(false)
    getSurfaceStateMock.mockReset().mockReturnValue(null)
    canMarkSeenMock.mockReset().mockReturnValue(true)
    registerZApiAttentionHandlers()
  })

  it('rejects an unauthorized snapshot sender', async () => {
    isTrustedMock.mockReturnValue(false)
    const sender = {} as Electron.WebContents

    await expect(handler('zApiAttention:getSnapshot')({ sender })).rejects.toThrow(
      'z_api_attention_sender_denied'
    )
    expect(getRuntimeMock).not.toHaveBeenCalled()
  })

  it('rejects non-strict mark-seen payloads before accessing storage', async () => {
    const sender = {} as Electron.WebContents

    await expect(
      handler('zApiAttention:markSeen')({ sender }, { conversationId: 7, extra: true })
    ).rejects.toThrow('z_api_attention_invalid_request')
    expect(getRuntimeMock).not.toHaveBeenCalled()
  })

  it('preserves unread attention while the sender is not focused and visible', async () => {
    canMarkSeenMock.mockReturnValue(false)
    const sender = {} as Electron.WebContents

    await expect(
      handler('zApiAttention:markSeen')({ sender }, { conversationId: 7 })
    ).resolves.toEqual(SNAPSHOT)
    expect(markConversationSeenMock).not.toHaveBeenCalled()
  })

  it('marks the conversation seen for a focused visible sender', async () => {
    const sender = {} as Electron.WebContents

    await expect(
      handler('zApiAttention:markSeen')({ sender }, { conversationId: 7 })
    ).resolves.toEqual({ provider: 'z-api', totalUnread: 0, conversations: [] })
    expect(markConversationSeenMock).toHaveBeenCalledWith(7)
  })
})
