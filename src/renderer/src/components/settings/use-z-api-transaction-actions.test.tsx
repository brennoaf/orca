// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  SaveAndConfigureZApiParams,
  ZApiCommunicationIntegrationStatus
} from '../../../../shared/communication-integrations'
import { useZApiTransactionActions } from './use-z-api-transaction-actions'
import { resetCommunicationIntegrationStatusesForTests } from './use-communication-integration-statuses'

const mocks = vi.hoisted(() => ({
  callRuntimeRpc: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn()
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: mocks.callRuntimeRpc
}))

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError
  }
}))

const status: ZApiCommunicationIntegrationStatus = {
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
    verifiedAt: '2026-08-09T00:00:00.000Z',
    lastError: null
  },
  instanceId: 'instance-id',
  instanceTokenStored: true,
  clientTokenStored: true,
  instanceConnected: true,
  smartphoneConnected: true,
  ingressPrepared: true,
  listenPort: 43210,
  localTunnelTarget: 'http://127.0.0.1:43210',
  publicWebhookBaseUrl: 'https://hooks.example.test',
  publicIngressVerified: true,
  webhooksConfigured: true,
  lastErrorCode: null
}

const saveParams: SaveAndConfigureZApiParams = {
  instanceId: 'instance-id',
  instanceToken: { action: 'keep' },
  clientToken: { action: 'keep' },
  apiBaseUrl: 'https://api.z-api.io',
  endpointTrust: { kind: 'default' },
  publicWebhookBaseUrl: 'https://hooks.example.test',
  listenPort: 43210
}

function ActionsHarness(): React.JSX.Element {
  const actions = useZApiTransactionActions()
  return (
    <div>
      <button type="button" onClick={() => void actions.prepare(0)}>
        Prepare
      </button>
      <button type="button" onClick={() => void actions.discardPrepared()}>
        Discard
      </button>
      <button type="button" onClick={() => void actions.saveAndConfigure(saveParams)}>
        Save
      </button>
      <button type="button" onClick={() => void actions.remove()}>
        Remove
      </button>
      <span data-testid="pending">{actions.pending ?? 'idle'}</span>
      {actions.error ? <p role="alert">{actions.error}</p> : null}
    </div>
  )
}

describe('useZApiTransactionActions', () => {
  beforeEach(() => {
    resetCommunicationIntegrationStatusesForTests()
    mocks.callRuntimeRpc.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastError.mockReset()
  })

  afterEach(() => cleanup())

  it('uses only the transactional Z-API RPC surface', async () => {
    mocks.callRuntimeRpc.mockImplementation(
      (_target: unknown, method: string): Promise<unknown> => {
        if (method === 'communicationIntegrations.getStatuses') {
          return Promise.resolve([status])
        }
        if (method === 'communicationIntegrations.zApi.prepareIngress') {
          return Promise.resolve({
            ok: true,
            status,
            value: { listenPort: 43210, localTunnelTarget: 'http://127.0.0.1:43210' }
          })
        }
        return Promise.resolve({ ok: true, status, value: undefined })
      }
    )
    const user = userEvent.setup()
    render(<ActionsHarness />)

    await user.click(screen.getByRole('button', { name: 'Prepare' }))
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('idle'))
    await user.click(screen.getByRole('button', { name: 'Discard' }))
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('idle'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('idle'))
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('idle'))

    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      'communicationIntegrations.zApi.prepareIngress',
      { listenPort: 0 }
    )
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      'communicationIntegrations.zApi.discardPreparedIngress',
      null
    )
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      'communicationIntegrations.zApi.saveAndConfigure',
      saveParams
    )
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      'communicationIntegrations.zApi.remove',
      null
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Z-API is ready.')
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Z-API integration removed.')
  })

  it('surfaces redacted operation errors and hides thrown transport details', async () => {
    const providerError = {
      code: 'webhook_state_conflict' as const,
      message: 'Z-API webhooks changed outside Orca.',
      field: null
    }
    mocks.callRuntimeRpc.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, status, error: providerError })
    )
    mocks.callRuntimeRpc.mockResolvedValue([status])
    const user = userEvent.setup()
    render(<ActionsHarness />)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(providerError.message))
    expect(mocks.toastError).toHaveBeenCalledWith(providerError.message)

    cleanup()
    resetCommunicationIntegrationStatusesForTests()
    mocks.callRuntimeRpc.mockReset()
    mocks.callRuntimeRpc.mockRejectedValue(new Error('secret transport detail'))
    render(<ActionsHarness />)
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not remove the Z-API integration.')
    )
    expect(document.body.textContent).not.toContain('secret transport detail')
  })
})
