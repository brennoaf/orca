// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  SaveAndConfigureZApiParams,
  ZApiCommunicationIntegrationStatus,
  ZApiPreparedIngressSnapshot
} from '../../../../shared/communication-integrations'
import { DEFAULT_Z_API_BASE_URL } from '../../../../shared/communication-integrations'
import { ConfirmationDialogContext } from '@/components/confirmation-dialog-context'
import { ZApiCommunicationIntegrationDialog } from './ZApiCommunicationIntegrationDialog'

const preparedIngress: ZApiPreparedIngressSnapshot = {
  listenPort: 43210,
  localTunnelTarget: 'http://127.0.0.1:43210'
}

const rejectConfirmation = async (): Promise<boolean> => false

function createStatus(
  overrides: Partial<ZApiCommunicationIntegrationStatus> = {}
): ZApiCommunicationIntegrationStatus {
  return {
    provider: 'z-api',
    endpoint: {
      baseUrl: DEFAULT_Z_API_BASE_URL,
      authority: 'api.z-api.io',
      trust: { kind: 'default' }
    },
    readiness: {
      configured: false,
      verified: false,
      sendReady: false,
      receiveReady: false,
      verifiedAt: null,
      lastError: null
    },
    instanceId: null,
    instanceTokenStored: false,
    clientTokenStored: false,
    instanceConnected: null,
    smartphoneConnected: null,
    ingressPrepared: false,
    listenPort: null,
    localTunnelTarget: null,
    publicWebhookBaseUrl: null,
    publicIngressVerified: false,
    webhooksConfigured: false,
    lastErrorCode: null,
    ...overrides
  }
}

function dialog(props: {
  status?: ZApiCommunicationIntegrationStatus | null
  onPrepare?: (listenPort: number) => Promise<ZApiPreparedIngressSnapshot | null>
  onDiscardPrepared?: () => Promise<boolean>
  onSaveAndConfigure?: (params: SaveAndConfigureZApiParams) => Promise<boolean>
  onRemove?: () => Promise<boolean>
}): React.JSX.Element {
  return (
    <ConfirmationDialogContext.Provider value={rejectConfirmation}>
      <ZApiCommunicationIntegrationDialog
        open
        onOpenChange={vi.fn()}
        status={props.status === undefined ? createStatus() : props.status}
        pending={null}
        error={null}
        onPrepare={props.onPrepare ?? (async () => null)}
        onDiscardPrepared={props.onDiscardPrepared ?? (async () => false)}
        onSaveAndConfigure={props.onSaveAndConfigure ?? (async () => false)}
        onRemove={props.onRemove ?? (async () => false)}
      />
    </ConfirmationDialogContext.Provider>
  )
}

describe('ZApiCommunicationIntegrationDialog', () => {
  beforeEach(() => {
    Object.assign(window, {
      api: { ui: { writeClipboardText: vi.fn().mockResolvedValue(undefined) } }
    })
  })

  afterEach(() => cleanup())

  it('prepares the receiver before the single transactional save', async () => {
    const user = userEvent.setup()
    const onPrepare = vi.fn(async () => preparedIngress)
    const onSaveAndConfigure = vi.fn(async () => false)
    render(dialog({ onPrepare, onSaveAndConfigure }))

    await user.type(screen.getByLabelText('Instance ID'), ' instance-id ')
    await user.type(screen.getByLabelText('Instance Token'), 'instance-token')
    await user.type(screen.getByLabelText('Client Token'), 'client-token')
    await user.type(screen.getByLabelText('Public webhook base URL'), 'https://hooks.example.test')

    expect(screen.getByRole('button', { name: 'Save and configure' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Prepare receiver' }))
    await waitFor(() => expect(onPrepare).toHaveBeenCalledWith(0))
    expect(screen.getByLabelText('Local port')).toHaveValue('43210')
    expect(screen.getByRole('textbox', { name: 'Tunnel this local target' })).toHaveValue(
      'http://127.0.0.1:43210'
    )

    await user.click(
      screen.getByRole('checkbox', {
        name: "I understand that Orca will take over this instance's webhooks."
      })
    )
    await user.click(screen.getByRole('button', { name: 'Save and configure' }))

    expect(onSaveAndConfigure).toHaveBeenCalledWith({
      instanceId: 'instance-id',
      instanceToken: { action: 'replace', value: 'instance-token' },
      clientToken: { action: 'replace', value: 'client-token' },
      apiBaseUrl: DEFAULT_Z_API_BASE_URL,
      endpointTrust: { kind: 'default' },
      publicWebhookBaseUrl: 'https://hooks.example.test',
      listenPort: 43210
    })
  })

  it('rehydrates active public settings without exposing stored secrets or unlocking the port', () => {
    render(
      dialog({
        status: createStatus({
          readiness: {
            configured: true,
            verified: true,
            sendReady: true,
            receiveReady: true,
            verifiedAt: '2026-08-09T00:00:00.000Z',
            lastError: null
          },
          instanceId: 'active-instance',
          instanceTokenStored: true,
          clientTokenStored: true,
          ingressPrepared: true,
          listenPort: 43210,
          localTunnelTarget: preparedIngress.localTunnelTarget,
          publicWebhookBaseUrl: 'https://hooks.example.test',
          webhooksConfigured: true
        })
      })
    )

    expect(screen.getByLabelText('Instance ID')).toHaveValue('active-instance')
    expect(screen.getByLabelText('Instance Token')).toHaveValue('')
    expect(screen.getByLabelText('Client Token')).toHaveValue('')
    expect(screen.getByLabelText('Public webhook base URL')).toHaveValue(
      'https://hooks.example.test'
    )
    expect(screen.getByLabelText('Local port')).toHaveValue('43210')
    expect(screen.getByLabelText('Local port')).toBeDisabled()
    expect(
      screen.getByText('Remove the integration before changing the active receiver port.')
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Remove integration' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Clear saved token' })).toBeNull()
  })

  it('hydrates once when an open loading dialog receives its first real status', async () => {
    const user = userEvent.setup()
    const activeStatus = createStatus({
      readiness: {
        configured: true,
        verified: true,
        sendReady: true,
        receiveReady: true,
        verifiedAt: '2026-08-09T00:00:00.000Z',
        lastError: null
      },
      instanceId: 'active-instance',
      instanceTokenStored: true,
      clientTokenStored: true,
      ingressPrepared: true,
      listenPort: 43210,
      localTunnelTarget: preparedIngress.localTunnelTarget,
      publicWebhookBaseUrl: 'https://hooks.example.test',
      publicIngressVerified: true,
      webhooksConfigured: true
    })
    const { rerender } = render(dialog({ status: null }))

    expect(screen.getByLabelText('Public webhook base URL')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save and configure' })).toBeDisabled()

    rerender(dialog({ status: activeStatus }))
    await waitFor(() => {
      expect(screen.getByLabelText('Public webhook base URL')).toHaveValue(
        'https://hooks.example.test'
      )
      expect(screen.getByLabelText('Local port')).toHaveValue('43210')
    })
    await user.click(
      screen.getByRole('checkbox', {
        name: "I understand that Orca will take over this instance's webhooks."
      })
    )
    expect(screen.getByRole('button', { name: 'Save and configure' })).toBeEnabled()

    await user.clear(screen.getByLabelText('Public webhook base URL'))
    await user.type(screen.getByLabelText('Public webhook base URL'), 'https://draft.example.test')
    rerender(
      dialog({
        status: {
          ...activeStatus,
          publicWebhookBaseUrl: 'https://refreshed.example.test'
        }
      })
    )

    expect(screen.getByLabelText('Public webhook base URL')).toHaveValue(
      'https://draft.example.test'
    )
    expect(screen.getByRole('button', { name: 'Save and configure' })).toBeEnabled()
  })

  it('discards a non-active prepared receiver before allowing a port change', async () => {
    const user = userEvent.setup()
    const onDiscardPrepared = vi.fn(async () => true)
    render(
      dialog({
        status: createStatus({
          ingressPrepared: true,
          listenPort: 43210,
          localTunnelTarget: preparedIngress.localTunnelTarget
        }),
        onDiscardPrepared
      })
    )

    expect(screen.getByLabelText('Local port')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Change port' }))
    await waitFor(() => expect(onDiscardPrepared).toHaveBeenCalledOnce())
    expect(screen.getByLabelText('Local port')).toBeEnabled()
    expect(screen.queryByDisplayValue(preparedIngress.localTunnelTarget)).toBeNull()
    expect(screen.getByRole('button', { name: 'Save and configure' })).toBeDisabled()
  })
})
