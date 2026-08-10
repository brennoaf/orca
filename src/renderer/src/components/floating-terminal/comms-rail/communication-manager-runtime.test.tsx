// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CommunicationIntegrationStatus } from '../../../../../shared/communication-integrations'
import type { CommunicationManagerRuntime } from './communication-manager-runtime'
import { useCommunicationManagerStatuses } from './communication-manager-runtime'

vi.mock('@/components/settings/use-communication-integration-statuses', () => ({
  useCommunicationIntegrationStatuses: () => ({
    statuses: [],
    loading: false,
    error: null,
    getStatus: () => null,
    refresh: () => Promise.resolve()
  })
}))

function runtime(
  loadIntegrationStatuses: () => Promise<readonly CommunicationIntegrationStatus[]>
): CommunicationManagerRuntime {
  return {
    commandDiscord: vi.fn(),
    loadIntegrationStatuses,
    openSettings: vi.fn(),
    overlayOpen: false,
    setOverlayOpen: vi.fn()
  }
}

describe('useCommunicationManagerStatuses', () => {
  it('retries a failed dock status request and applies its replacement', async () => {
    const load = vi
      .fn<() => Promise<readonly CommunicationIntegrationStatus[]>>()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce([])
    const value = runtime(load)
    const view = renderHook(() => useCommunicationManagerStatuses(value, true))
    await waitFor(() => expect(view.result.current.error).not.toBeNull())
    act(() => view.result.current.refresh())
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(view.result.current).toMatchObject({ error: null, loading: false }))
  })
})
