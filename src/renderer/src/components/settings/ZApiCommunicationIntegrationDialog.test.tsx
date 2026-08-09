// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  SaveAndConfigureZApiParams,
  ZApiCommunicationIntegrationStatus,
  ZApiListeningValidationSnapshot,
  ZApiPreparedIngressSnapshot
} from '../../../../shared/communication-integrations'
import { DEFAULT_Z_API_BASE_URL } from '../../../../shared/communication-integrations'
import { ConfirmationDialogContext } from '@/components/confirmation-dialog-context'
import { ZApiCommunicationIntegrationDialog } from './ZApiCommunicationIntegrationDialog'

const preparedIngress: ZApiPreparedIngressSnapshot = {
  listenPort: 43210,
  localTunnelTarget: 'http://127.0.0.1:43210'
}
const attemptId = '11111111-1111-4111-8111-111111111111'
const validationCode = 'orca-000042'
const nextValidationCode = 'orca-654321'

const notStartedValidation: ZApiListeningValidationSnapshot = {
  state: 'not_started',
  attemptId: null,
  code: null,
  deadline: null,
  remainingMs: null,
  confirmedAt: null,
  error: null
}

const awaitingValidation: ZApiListeningValidationSnapshot = {
  state: 'awaiting',
  attemptId,
  code: validationCode,
  deadline: '2026-08-09T00:05:00.000Z',
  remainingMs: 125_000,
  confirmedAt: null,
  error: null
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

function technicalStatus(
  listeningValidation: ZApiListeningValidationSnapshot = notStartedValidation
): ZApiCommunicationIntegrationStatus {
  return createStatus({
    readiness: {
      configured: true,
      verified: false,
      sendReady: true,
      receiveReady: false,
      verifiedAt: null,
      lastError: null
    },
    instanceId: 'active-instance',
    instanceTokenStored: true,
    clientTokenStored: true,
    instanceConnected: true,
    smartphoneConnected: true,
    ingressPrepared: true,
    listenPort: 43210,
    localTunnelTarget: preparedIngress.localTunnelTarget,
    publicWebhookBaseUrl: 'https://hooks.example.test',
    publicIngressVerified: true,
    webhooksConfigured: true,
    listeningValidation
  })
}

function dialog(props: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  status?: ZApiCommunicationIntegrationStatus | null
  onPrepare?: (listenPort: number) => Promise<ZApiPreparedIngressSnapshot | null>
  onDiscardPrepared?: () => Promise<boolean>
  onSaveAndConfigure?: (params: SaveAndConfigureZApiParams) => Promise<boolean>
  onStartListeningValidation?: () => Promise<ZApiListeningValidationSnapshot | null>
  onCancelListeningValidation?: (
    attemptId: string
  ) => Promise<ZApiListeningValidationSnapshot | null>
  onRemove?: () => Promise<boolean>
}): React.JSX.Element {
  return (
    <ConfirmationDialogContext.Provider value={rejectConfirmation}>
      <ZApiCommunicationIntegrationDialog
        open={props.open ?? true}
        onOpenChange={props.onOpenChange ?? vi.fn()}
        status={props.status === undefined ? createStatus() : props.status}
        pending={null}
        error={null}
        onPrepare={props.onPrepare ?? (async () => null)}
        onDiscardPrepared={props.onDiscardPrepared ?? (async () => false)}
        onSaveAndConfigure={props.onSaveAndConfigure ?? (async () => false)}
        onStartListeningValidation={props.onStartListeningValidation ?? (async () => null)}
        onCancelListeningValidation={props.onCancelListeningValidation ?? (async () => null)}
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
    const onSaveAndConfigure = vi.fn(async () => true)
    const onStartListeningValidation = vi.fn(async () => awaitingValidation)
    const onOpenChange = vi.fn()
    const { rerender } = render(
      dialog({
        onOpenChange,
        onPrepare,
        onSaveAndConfigure,
        onStartListeningValidation
      })
    )

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
    expect(onStartListeningValidation).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()

    rerender(
      dialog({
        status: technicalStatus(),
        onOpenChange,
        onPrepare,
        onSaveAndConfigure,
        onStartListeningValidation
      })
    )
    expect(screen.getByRole('button', { name: 'Validate listening' })).toBeVisible()
  })

  it('shows an explicit validation action without starting on open or save', async () => {
    const user = userEvent.setup()
    const onStartListeningValidation = vi.fn(async () => awaitingValidation)
    const onOpenChange = vi.fn()
    render(
      dialog({
        status: technicalStatus(),
        onOpenChange,
        onStartListeningValidation
      })
    )

    expect(onStartListeningValidation).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Validate listening' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Validate listening' }))
    await waitFor(() => expect(onStartListeningValidation).toHaveBeenCalledOnce())
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('shows an authoritative awaiting code, copies it, and closes without cancelling', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const onCancelListeningValidation = vi.fn(async () => null)
    const { rerender } = render(
      dialog({
        status: technicalStatus(awaitingValidation),
        onOpenChange,
        onCancelListeningValidation
      })
    )

    await screen.findByText(validationCode)
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'true')
    expect(screen.getByRole('timer')).toHaveTextContent('02:05 remaining')
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'off')
    expect(screen.getByText(/WhatsApp mobile, web, or desktop/)).toBeVisible()
    expect(screen.getByText(/Send it to yourself or ask someone/)).toBeVisible()
    expect(screen.getByText(/Any conversation works/)).toBeVisible()
    expect(screen.getByText(/Do not use Orca's fast-response composer/)).toBeVisible()
    expect(screen.queryByLabelText('Instance ID')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Copy validation code' }))
    expect(window.api.ui.writeClipboardText).toHaveBeenCalledWith(validationCode)
    await user.click(screen.getAllByRole('button', { name: 'Close' })[0]!)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onCancelListeningValidation).not.toHaveBeenCalled()

    rerender(
      dialog({
        open: false,
        status: technicalStatus(awaitingValidation),
        onOpenChange,
        onCancelListeningValidation
      })
    )
    rerender(
      dialog({
        status: technicalStatus(awaitingValidation),
        onOpenChange,
        onCancelListeningValidation
      })
    )
    expect(await screen.findByText(validationCode)).toBeVisible()
  })

  it('renders a redacted failed validation as an alert', async () => {
    const failed: ZApiListeningValidationSnapshot = {
      state: 'failed',
      attemptId: null,
      code: null,
      deadline: null,
      remainingMs: null,
      confirmedAt: null,
      error: {
        code: 'message_persistence_failed',
        message: 'Orca could not persist the validation callback.',
        field: null
      }
    }
    render(dialog({ status: technicalStatus(failed) }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Orca could not persist the validation callback.'
    )
    expect(document.body.textContent).not.toContain('conversationId')
    expect(document.body.textContent).not.toContain('phone')
  })

  it('cancels only the validation and returns to the configured form', async () => {
    const user = userEvent.setup()
    const cancelled: ZApiListeningValidationSnapshot = {
      ...awaitingValidation,
      state: 'cancelled',
      code: null,
      remainingMs: 0
    }
    const onCancelListeningValidation = vi.fn(async () => cancelled)
    const { rerender } = render(
      dialog({
        status: technicalStatus(awaitingValidation),
        onCancelListeningValidation
      })
    )

    await user.click(await screen.findByRole('button', { name: 'Cancel validation' }))
    await waitFor(() => expect(onCancelListeningValidation).toHaveBeenCalledWith(attemptId))
    rerender(
      dialog({
        status: technicalStatus(cancelled),
        onCancelListeningValidation
      })
    )
    expect(screen.getByLabelText('Instance ID')).toHaveValue('active-instance')
    expect(screen.getByLabelText('Public HTTPS tunnel or reverse proxy URL')).toHaveValue(
      'https://hooks.example.test'
    )
    expect(screen.getByRole('button', { name: 'Validate listening' })).toBeVisible()
  })

  it('generates a new code after expiry and presents confirmed completion', async () => {
    const user = userEvent.setup()
    const expired: ZApiListeningValidationSnapshot = {
      ...awaitingValidation,
      state: 'expired',
      code: null,
      remainingMs: 0
    }
    const nextAwaiting: ZApiListeningValidationSnapshot = {
      ...awaitingValidation,
      attemptId: '22222222-2222-4222-8222-222222222222',
      code: nextValidationCode,
      remainingMs: 300_000
    }
    const confirmed: ZApiListeningValidationSnapshot = {
      ...nextAwaiting,
      state: 'confirmed',
      code: null,
      remainingMs: 0,
      confirmedAt: '2026-08-09T00:01:00.000Z'
    }
    const onStartListeningValidation = vi.fn(async () => nextAwaiting)
    const onOpenChange = vi.fn()
    const { rerender } = render(
      dialog({
        status: technicalStatus(expired),
        onOpenChange,
        onStartListeningValidation
      })
    )

    await user.click(await screen.findByRole('button', { name: 'Generate a new code' }))
    await waitFor(() => expect(onStartListeningValidation).toHaveBeenCalledOnce())
    rerender(
      dialog({
        status: technicalStatus(nextAwaiting),
        onOpenChange,
        onStartListeningValidation
      })
    )
    expect(await screen.findByText(nextValidationCode)).toBeVisible()
    expect(screen.getByText('05:00 remaining')).toBeVisible()
    expect(screen.queryByText(validationCode)).toBeNull()

    rerender(
      dialog({
        status: technicalStatus(confirmed),
        onOpenChange,
        onStartListeningValidation
      })
    )
    expect(await screen.findByText('WhatsApp listening confirmed')).toBeVisible()
    expect(screen.getByText(/Confirmed at/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
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
