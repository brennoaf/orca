// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CommunicationIntegrationOperationResult,
  SaveCommunicationIntegrationParams,
  SlackCommunicationIntegrationStatus
} from '../../../../shared/communication-integrations'
import { useCommunicationIntegrationCardActions } from './use-communication-integration-card-actions'
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

const saveParams: SaveCommunicationIntegrationParams = {
  provider: 'slack',
  baseUrl: 'https://slack.com/api',
  endpointTrust: { kind: 'default' },
  appToken: { action: 'keep' },
  userToken: { action: 'keep' }
}

function createSlackStatus(
  lastError: SlackCommunicationIntegrationStatus['readiness']['lastError'] = null
): SlackCommunicationIntegrationStatus {
  return {
    provider: 'slack',
    endpoint: {
      baseUrl: 'https://slack.com/api',
      authority: 'slack.com',
      trust: { kind: 'default' }
    },
    readiness: {
      configured: true,
      verified: lastError === null,
      sendReady: false,
      receiveReady: false,
      verifiedAt: null,
      lastError
    },
    appTokenStored: true,
    userTokenStored: true,
    workspace: null
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

function ActionsHarness(): React.JSX.Element {
  const actions = useCommunicationIntegrationCardActions('slack', 'Slack')
  return (
    <div>
      <button type="button" onClick={() => void actions.save(saveParams)}>
        Save request
      </button>
      <button type="button" onClick={() => void actions.clear()}>
        Clear request
      </button>
      <button type="button" onClick={() => void actions.test()}>
        Test request
      </button>
      <span data-testid="pending">{actions.pending ?? 'idle'}</span>
      {actions.error ? <p role="alert">{actions.error}</p> : null}
      {actions.testResult ? <p data-testid="test-result">{actions.testResult.message}</p> : null}
    </div>
  )
}

describe('useCommunicationIntegrationCardActions', () => {
  beforeEach(() => {
    resetCommunicationIntegrationStatusesForTests()
    mocks.callRuntimeRpc.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.toastError.mockReset()
  })

  afterEach(() => cleanup())

  it.each([
    ['Save', 'save', 'communicationIntegrations.save'],
    ['Clear', 'clear', 'communicationIntegrations.clear'],
    ['Test', 'test', 'communicationIntegrations.test']
  ] as const)(
    'exposes %s as pending until its RPC and refresh settle',
    async (_, pending, method) => {
      const operation = deferred<CommunicationIntegrationOperationResult>()
      const status = createSlackStatus()
      mocks.callRuntimeRpc.mockImplementation(
        (_target: unknown, requestedMethod: string): Promise<unknown> =>
          requestedMethod === method ? operation.promise : Promise.resolve([status])
      )
      const user = userEvent.setup()
      render(<ActionsHarness />)

      await user.click(
        screen.getByRole('button', {
          name: `${pending[0].toUpperCase()}${pending.slice(1)} request`
        })
      )
      expect(screen.getByTestId('pending')).toHaveTextContent(pending)

      operation.resolve({ ok: true, status })
      await waitFor(() => expect(screen.getByTestId('pending')).toHaveTextContent('idle'))
      expect(mocks.callRuntimeRpc).toHaveBeenCalledWith(
        { kind: 'local' },
        method,
        expect.anything()
      )
    }
  )

  it('surfaces operation errors inline and through a toast', async () => {
    const message = 'Slack rejected the user token.'
    const status = createSlackStatus({ code: 'unauthorized', message, field: 'userToken' })
    mocks.callRuntimeRpc.mockImplementation(
      (_target: unknown, method: string): Promise<unknown> =>
        method === 'communicationIntegrations.save'
          ? Promise.resolve({ ok: false, status, error: status.readiness.lastError })
          : Promise.resolve([status])
    )
    const user = userEvent.setup()
    render(<ActionsHarness />)

    await user.click(screen.getByRole('button', { name: 'Save request' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message))
    expect(screen.getAllByText(message)).toHaveLength(1)
    expect(mocks.toastError).toHaveBeenCalledWith(message)
  })

  it('reports transport failures without leaking thrown values', async () => {
    mocks.callRuntimeRpc.mockRejectedValue(new Error('secret transport detail'))
    const user = userEvent.setup()
    render(<ActionsHarness />)

    await user.click(screen.getByRole('button', { name: 'Save request' }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Could not save the Slack integration.')
    )
    expect(document.body.textContent).not.toContain('secret transport detail')
    expect(mocks.toastError).toHaveBeenCalledWith('Could not save the Slack integration.')
  })
})
