import { BrowserWindow, ipcMain, type WebContents } from 'electron'
import { z } from 'zod'
import type { ZApiAttentionSnapshot } from '../../shared/communication-integrations'
import { onZApiInboundAttention } from '../messaging/z-api-attention-events'
import { setZApiAttentionVisibilityResolver } from '../messaging/z-api-attention-visibility-state'
import { getZApiCommunicationRuntime } from '../messaging/z-api-communication-runtime'
import { communicationsDockController } from '../window/communications-dock-controller'
import { floatingCommsSurfaceController } from '../window/floating-comms-surface-controller'
import {
  canMarkZApiAttentionSeen,
  isZApiAttentionVisible
} from '../window/z-api-attention-visibility'
import { isTrustedUIRenderer } from './ui'

const MarkSeenSchema = z
  .object({ conversationId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) })
  .strict()

function isAttentionSender(sender: WebContents): boolean {
  return (
    isTrustedUIRenderer(sender) ||
    communicationsDockController.isSender(sender) ||
    floatingCommsSurfaceController.getStateForSender(sender) !== null
  )
}

function assertAttentionSender(sender: WebContents): void {
  if (!isAttentionSender(sender)) {
    throw new Error('z_api_attention_sender_denied')
  }
}

function publish(snapshot: ZApiAttentionSnapshot): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed() && isAttentionSender(window.webContents)) {
      window.webContents.send('zApiAttention:changed', snapshot)
    }
  }
}

export function registerZApiAttentionHandlers(): void {
  setZApiAttentionVisibilityResolver(isZApiAttentionVisible)
  ipcMain.handle('zApiAttention:getSnapshot', async (event) => {
    assertAttentionSender(event.sender)
    return (await getZApiCommunicationRuntime()).store.getAttentionSnapshot()
  })
  ipcMain.handle('zApiAttention:markSeen', async (event, value: unknown) => {
    assertAttentionSender(event.sender)
    const result = MarkSeenSchema.safeParse(value)
    if (!result.success) {
      throw new Error('z_api_attention_invalid_request')
    }
    const store = (await getZApiCommunicationRuntime()).store
    if (!canMarkZApiAttentionSeen(event.sender)) {
      return store.getAttentionSnapshot()
    }
    const snapshot = store.markConversationSeen(result.data.conversationId)
    publish(snapshot)
    return snapshot
  })
  onZApiInboundAttention(() => {
    void getZApiCommunicationRuntime()
      .then((runtime) => publish(runtime.store.getAttentionSnapshot()))
      .catch(() => undefined)
  })
}
