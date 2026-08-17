// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { act } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiscordCommunicationIntegrationStatus } from '../../../../shared/communication-integrations'
import {
  applyCommunicationIntegrationStatus,
  refreshCommunicationIntegrationStatuses,
  resetCommunicationIntegrationStatusesForTests,
  useCommunicationIntegrationStatuses
} from './use-communication-integration-statuses'

const mocks = vi.hoisted(() => ({ callRuntimeRpc: vi.fn() }))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: mocks.callRuntimeRpc
}))

function createDiscordStatus(message: string): DiscordCommunicationIntegrationStatus {
  return {
    provider: 'discord',
    endpoint: null,
    readiness: {
      configured: true,
      verified: false,
      sendReady: false,
      receiveReady: false,
      verifiedAt: null,
      lastError: { code: 'provider_rejected', message, field: null }
    },
    clientId: '12345678901234567',
    clientSecretStored: true
  }
}

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function StatusHarness(): React.JSX.Element {
  const { getStatus, loading } = useCommunicationIntegrationStatuses()
  const status = getStatus('discord')
  return (
    <p data-testid="snapshot">
      {loading ? 'loading' : (status?.readiness.lastError?.message ?? 'empty')}
    </p>
  )
}

describe('communication integration status refresh', () => {
  beforeEach(() => {
    resetCommunicationIntegrationStatusesForTests()
    mocks.callRuntimeRpc.mockReset()
  })

  afterEach(() => cleanup())

  it('deduplicates concurrent refreshes and lets an after-current refresh win a stale race', async () => {
    const stale = createDiscordStatus('stale status')
    const current = createDiscordStatus('current status')
    const first = deferred<DiscordCommunicationIntegrationStatus[]>()
    const second = deferred<DiscordCommunicationIntegrationStatus[]>()
    mocks.callRuntimeRpc.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render(<StatusHarness />)
    await waitFor(() => expect(mocks.callRuntimeRpc).toHaveBeenCalledTimes(1))

    const duplicateA = refreshCommunicationIntegrationStatuses()
    const duplicateB = refreshCommunicationIntegrationStatuses()
    const afterCurrent = refreshCommunicationIntegrationStatuses({ afterCurrent: true })
    expect(duplicateA).toBe(duplicateB)
    expect(mocks.callRuntimeRpc).toHaveBeenCalledTimes(1)

    act(() => applyCommunicationIntegrationStatus(current))
    expect(screen.getByTestId('snapshot')).toHaveTextContent('current status')

    await act(async () => {
      first.resolve([stale])
      await duplicateA
    })
    await waitFor(() => expect(mocks.callRuntimeRpc).toHaveBeenCalledTimes(2))

    await act(async () => {
      second.resolve([current])
      await afterCurrent
    })
    expect(screen.getByTestId('snapshot')).toHaveTextContent('current status')
  })
})
