// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  SaveAndConfigureZApiParams,
  ZApiCommunicationIntegrationStatus,
  ZApiListeningValidationSnapshot
} from '../../../../shared/communication-integrations'
import { useZApiListeningValidation } from './use-z-api-listening-validation'
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
  lastErrorCode: null,
  hideArchivedConversations: false
}

const saveParams: SaveAndConfigureZApiParams = {
  instanceId: 'instance-id',
  instanceToken: { action: 'keep' },
  clientToken: { action: 'keep' },
  apiBaseUrl: 'https://api.z-api.io',
  endpointTrust: { kind: 'default' },
  publicWebhookBaseUrl: 'https://hooks.example.test',
  listenPort: 43210,
  hideArchivedConversations: false
}

const attemptId = '11111111-1111-4111-8111-111111111111'
const awaitingValidation: ZApiListeningValidationSnapshot = {
  state: 'awaiting',
  attemptId,
  code: 'orca-000042',
  deadline: '2026-08-09T00:05:00.000Z',
  remainingMs: 300_000,
  confirmedAt: null,
  error: null
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
      <button type="button" onClick={() => void actions.startListeningValidation()}>
        Start validation
      </button>
      <button type="button" onClick={() => void actions.cancelListeningValidation(attemptId)}>
        Cancel validation
      </button>
      <button type="button" onClick={() => void actions.remove()}>
        Remove
      </button>
      <span data-testid="pending">{actions.pending ?? 'idle'}</span>
      {actions.error ? <p role="alert">{actions.error}</p> : null}
    </div>
  )
}

function PollHarness(props: {
  status: ZApiCommunicationIntegrationStatus
  enabled: boolean
}): React.JSX.Element {
  const result = useZApiListeningValidation(props.status, props.enabled)
  return (
    <div>
      <span data-testid="validation-state">{result.validation.state}</span>
      <span data-testid="remaining-ms">{result.validation.remainingMs ?? 'none'}</span>
      {result.error ? <p role="alert">{result.error}</p> : null}
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

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

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
        if (method === 'communicationIntegrations.zApi.startListeningValidation') {
          return Promise.resolve({ ok: true, status, value: awaitingValidation })
        }
        if (method === 'communicationIntegrations.zApi.cancelListeningValidation') {
          return Promise.resolve({
            ok: true,
            status,
            value: { ...awaitingValidation, state: 'cancelled', code: null, remainingMs: 0 }
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
    await user.click(screen.getByRole('button', { name: 'Start validation' }))
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('idle'))
    await user.click(screen.getByRole('button', { name: 'Cancel validation' }))
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('idle'))
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('idle'))

    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      'communicationIntegrations.zApi.startListeningValidation',
      null
    )
    expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      'communicationIntegrations.zApi.cancelListeningValidation',
      { attemptId }
    )
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
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'Z-API is configured. Validate WhatsApp listening to finish.'
    )
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Z-API integration removed.')
  })

  it('stops polling while closed and starts one chain when reopened', async () => {
    vi.useFakeTimers()
    const awaitingStatus = { ...status, listeningValidation: awaitingValidation }
    mocks.callRuntimeRpc.mockResolvedValue(awaitingStatus)
    const { rerender } = render(<PollHarness status={awaitingStatus} enabled />)

    expect(mocks.callRuntimeRpc).toHaveBeenCalledOnce()
    await act(() => Promise.resolve())
    rerender(<PollHarness status={awaitingStatus} enabled={false} />)
    await act(async () => vi.advanceTimersByTimeAsync(3_000))
    expect(mocks.callRuntimeRpc).toHaveBeenCalledOnce()

    rerender(<PollHarness status={awaitingStatus} enabled />)
    expect(mocks.callRuntimeRpc).toHaveBeenCalledTimes(2)
    await act(() => Promise.resolve())
    await act(async () => vi.advanceTimersByTimeAsync(1_000))
    expect(mocks.callRuntimeRpc).toHaveBeenCalledTimes(3)
  })

  it('single-flights an in-flight poll across attempt changes and fences its response', async () => {
    vi.useFakeTimers()
    const nextAttemptId = '22222222-2222-4222-8222-222222222222'
    const nextAwaiting: ZApiListeningValidationSnapshot = {
      ...awaitingValidation,
      attemptId: nextAttemptId,
      code: 'orca-654321',
      remainingMs: 90_000
    }
    const firstPollResult: ZApiCommunicationIntegrationStatus = {
      ...status,
      listeningValidation: {
        ...awaitingValidation,
        remainingMs: 30_000
      }
    }
    const confirmedNext: ZApiCommunicationIntegrationStatus = {
      ...status,
      listeningValidation: {
        ...nextAwaiting,
        state: 'confirmed',
        code: null,
        deadline: awaitingValidation.deadline,
        remainingMs: 0,
        confirmedAt: '2026-08-09T00:01:00.000Z',
        error: null
      }
    }
    const resolvers: ((value: ZApiCommunicationIntegrationStatus) => void)[] = []
    mocks.callRuntimeRpc.mockImplementation(
      () =>
        new Promise<ZApiCommunicationIntegrationStatus>((resolve) => {
          resolvers.push(resolve)
        })
    )
    const firstStatus = { ...status, listeningValidation: awaitingValidation }
    const nextStatus = { ...status, listeningValidation: nextAwaiting }
    const { rerender } = render(<PollHarness status={firstStatus} enabled />)

    expect(mocks.callRuntimeRpc).toHaveBeenCalledOnce()
    rerender(<PollHarness status={nextStatus} enabled />)
    await act(async () => vi.advanceTimersByTimeAsync(1_000))
    expect(mocks.callRuntimeRpc).toHaveBeenCalledOnce()

    await act(async () => resolvers[0]!(firstPollResult))
    expect(screen.getByTestId('remaining-ms')).toHaveTextContent('90000')
    await act(async () => vi.advanceTimersByTimeAsync(1_000))
    expect(mocks.callRuntimeRpc).toHaveBeenCalledTimes(2)

    await act(async () => resolvers[1]!(confirmedNext))
    expect(screen.getByTestId('validation-state')).toHaveTextContent('confirmed')
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
