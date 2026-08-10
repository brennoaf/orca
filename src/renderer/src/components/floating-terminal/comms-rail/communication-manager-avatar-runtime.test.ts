import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const callRuntimeRpc = vi.hoisted(() => vi.fn(() => Promise.resolve({ state: 'unavailable' })))

vi.mock('@/runtime/runtime-rpc-client', () => ({ callRuntimeRpc }))

import { LOCAL_Z_API_COMMUNICATION_MANAGER_CLIENT as exportedClient } from './communication-managers'
import { LOCAL_Z_API_COMMUNICATION_MANAGER_CLIENT as runtimeClient } from './communication-manager-runtime'

describe('Z-API avatar runtime client', () => {
  it('calls the local avatar RPC with only the conversation id', async () => {
    await runtimeClient.getConversationAvatar({ conversationId: 7 })

    expect(callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      'communicationIntegrations.zApi.getConversationAvatar',
      { conversationId: 7 }
    )
  })

  it('shares the same local client with the auxiliary communication surface', () => {
    expect(exportedClient).toBe(runtimeClient)
    const surfaceSource = readFileSync(resolve('src/renderer/src/floating-comms.tsx'), 'utf8')
    expect(surfaceSource).toContain('zApi: LOCAL_Z_API_COMMUNICATION_MANAGER_CLIENT')
  })
})
