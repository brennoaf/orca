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
    await user.type(
      screen.getByLabelText('Public HTTPS tunnel or reverse proxy URL'),
      'https://hooks.example.test'
    )

    expect(onPrepare).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: 'Use a custom local port' })).not.toBeChecked()
    expect(screen.queryByLabelText('Local port')).toBeNull()
    expect(screen.getByRole('button', { name: 'Save and configure' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Prepare receiving' }))
    await waitFor(() => expect(onPrepare).toHaveBeenCalledWith(0))
    expect(screen.queryByRole('checkbox', { name: 'Use a custom local port' })).toBeNull()
    expect(screen.queryByLabelText('Local port')).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Local tunnel target' })).toHaveValue(
      'http://127.0.0.1:43210'
    )
    expect(
      screen.getByText(/must forward requests, including their paths, to this local target/i)
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(window.api.ui.writeClipboardText).toHaveBeenCalledWith('http://127.0.0.1:43210')

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

  it('reveals and validates a custom port before preparing', async () => {
    const user = userEvent.setup()
    const customPreparedIngress = {
      listenPort: 43211,
      localTunnelTarget: 'http://127.0.0.1:43211'
    }
    const onPrepare = vi.fn(async () => customPreparedIngress)
    render(dialog({ onPrepare }))

    await user.click(screen.getByRole('checkbox', { name: 'Use a custom local port' }))
    const portInput = screen.getByLabelText('Local port')
    const prepareButton = screen.getByRole('button', { name: 'Prepare receiving' })

    expect(portInput).toHaveValue('')
    expect(prepareButton).toBeDisabled()
    await user.type(portInput, '0')
    expect(prepareButton).toBeDisabled()
    await user.clear(portInput)
    await user.type(portInput, '65536')
    expect(prepareButton).toBeDisabled()
    await user.clear(portInput)
    await user.type(portInput, '43211')
    expect(prepareButton).toBeEnabled()
    await user.click(prepareButton)

    await waitFor(() => expect(onPrepare).toHaveBeenCalledWith(43211))
    expect(screen.queryByLabelText('Local port')).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Use a custom local port' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Local tunnel target' })).toHaveValue(
      customPreparedIngress.localTunnelTarget
    )
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
          ingressPrepared: false,
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
    expect(screen.getByLabelText('Public HTTPS tunnel or reverse proxy URL')).toHaveValue(
      'https://hooks.example.test'
    )
    expect(screen.queryByLabelText('Local port')).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Use a custom local port' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'Local tunnel target' })).toHaveValue(
      preparedIngress.localTunnelTarget
    )
    expect(
      screen.getByText(
        'The local target stays fixed while this integration is active. Remove the integration to change its port.'
      )
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Change port' })).toBeNull()
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

    expect(screen.getByLabelText('Public HTTPS tunnel or reverse proxy URL')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save and configure' })).toBeDisabled()

    rerender(dialog({ status: activeStatus }))
    await waitFor(() => {
      expect(screen.getByLabelText('Public HTTPS tunnel or reverse proxy URL')).toHaveValue(
        'https://hooks.example.test'
      )
      expect(screen.getByRole('textbox', { name: 'Local tunnel target' })).toHaveValue(
        preparedIngress.localTunnelTarget
      )
    })
    await user.click(
      screen.getByRole('checkbox', {
        name: "I understand that Orca will take over this instance's webhooks."
      })
    )
    expect(screen.getByRole('button', { name: 'Save and configure' })).toBeEnabled()

    await user.clear(screen.getByLabelText('Public HTTPS tunnel or reverse proxy URL'))
    await user.type(
      screen.getByLabelText('Public HTTPS tunnel or reverse proxy URL'),
      'https://draft.example.test'
    )
    rerender(
      dialog({
        status: {
          ...activeStatus,
          publicWebhookBaseUrl: 'https://refreshed.example.test'
        }
      })
    )

    expect(screen.getByLabelText('Public HTTPS tunnel or reverse proxy URL')).toHaveValue(
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

    expect(screen.queryByLabelText('Local port')).toBeNull()
    expect(screen.queryByRole('checkbox', { name: 'Use a custom local port' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Change port' }))
    await waitFor(() => expect(onDiscardPrepared).toHaveBeenCalledOnce())
    expect(screen.getByRole('checkbox', { name: 'Use a custom local port' })).not.toBeChecked()
    expect(screen.queryByLabelText('Local port')).toBeNull()
    expect(screen.queryByDisplayValue(preparedIngress.localTunnelTarget)).toBeNull()
    expect(screen.getByRole('button', { name: 'Prepare receiving' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Save and configure' })).toBeDisabled()
  })
})
