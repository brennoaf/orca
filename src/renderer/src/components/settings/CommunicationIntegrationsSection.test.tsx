// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CommunicationIntegrationStatus,
  CommunicationProviderId,
  SlackCommunicationIntegrationStatus,
  ZApiCommunicationIntegrationStatus
} from '../../../../shared/communication-integrations'
import { ConfirmationDialogContext } from '@/components/confirmation-dialog-context'
import { CommunicationIntegrationsSection } from './CommunicationIntegrationsSection'

type MockAction = {
  pending: 'save' | 'clear' | 'test' | null
  error: string | null
  testResult: { kind: 'ok' | 'error'; message: string } | null
  save: ReturnType<typeof vi.fn>
  clear: ReturnType<typeof vi.fn>
  test: ReturnType<typeof vi.fn>
}

type MockZApiAction = {
  pending: 'save' | 'clear' | 'prepare' | 'discard' | 'validate' | 'cancel-validation' | null
  error: string | null
  prepare: ReturnType<typeof vi.fn>
  discardPrepared: ReturnType<typeof vi.fn>
  saveAndConfigure: ReturnType<typeof vi.fn>
  startListeningValidation: ReturnType<typeof vi.fn>
  cancelListeningValidation: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

const mocks = vi.hoisted(() => ({
  statuses: [] as CommunicationIntegrationStatus[],
  loading: false,
  error: null as string | null,
  actions: {} as Record<CommunicationProviderId, MockAction>,
  zApiAction: {} as MockZApiAction
}))

vi.mock('./use-communication-integration-statuses', () => ({
  useCommunicationIntegrationStatuses: () => ({
    statuses: mocks.statuses,
    loading: mocks.loading,
    error: mocks.error,
    getStatus: (provider: CommunicationProviderId) =>
      mocks.statuses.find((status) => status.provider === provider) ?? null,
    refresh: vi.fn()
  })
}))

vi.mock('./use-communication-integration-card-actions', () => ({
  useCommunicationIntegrationCardActions: (provider: CommunicationProviderId) =>
    mocks.actions[provider]
}))

vi.mock('./use-z-api-transaction-actions', () => ({
  useZApiTransactionActions: () => mocks.zApiAction
}))

vi.mock('@/components/discord-voice/DiscordVoiceOverlaySwitch', () => ({
  DiscordVoiceOverlaySwitch: () => <button type="button">Separate overlay</button>
}))

function createAction(): MockAction {
  return {
    pending: null,
    error: null,
    testResult: null,
    save: vi.fn(),
    clear: vi.fn(),
    test: vi.fn()
  }
}

function createZApiAction(): MockZApiAction {
  return {
    pending: null,
    error: null,
    prepare: vi.fn(),
    discardPrepared: vi.fn(),
    saveAndConfigure: vi.fn(),
    startListeningValidation: vi.fn(),
    cancelListeningValidation: vi.fn(),
    remove: vi.fn()
  }
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
      verified: false,
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

function createZApiStatus(): ZApiCommunicationIntegrationStatus {
  return {
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
    listeningValidation: {
      state: 'confirmed',
      attemptId: '11111111-1111-4111-8111-111111111111',
      code: null,
      deadline: '2026-08-09T00:05:00.000Z',
      remainingMs: 0,
      confirmedAt: '2026-08-09T00:00:00.000Z',
      error: null
    },
    lastErrorCode: null
  }
}

const rejectConfirmation = async (): Promise<boolean> => false

function renderSection(): void {
  render(
    <ConfirmationDialogContext.Provider value={rejectConfirmation}>
      <CommunicationIntegrationsSection />
    </ConfirmationDialogContext.Provider>
  )
}

describe('CommunicationIntegrationsSection', () => {
  beforeEach(() => {
    mocks.statuses = []
    mocks.loading = false
    mocks.error = null
    mocks.actions = {
      discord: createAction(),
      slack: createAction(),
      'z-api': createAction()
    }
    mocks.zApiAction = createZApiAction()
  })

  afterEach(() => cleanup())

  it('renders Discord, Slack, and Z-API cards in order with deep-link section ids', () => {
    renderSection()

    expect(screen.getByText('Communications')).toBeVisible()
    const cards = document.querySelectorAll('[data-settings-section]')
    expect(Array.from(cards, (card) => card.getAttribute('data-settings-section'))).toEqual([
      'integrations-communications-discord',
      'integrations-communications-slack',
      'integrations-communications-z-api'
    ])
    expect(screen.getByRole('button', { name: 'Separate overlay' })).toBeVisible()
    expect(screen.getByText('Local receiver')).toBeVisible()
    expect(screen.getByText('Public ingress')).toBeVisible()
    expect(screen.getByText('Webhooks')).toBeVisible()
    expect(screen.getByText('WhatsApp listening')).toBeVisible()
    expect(document.body.textContent).not.toContain('xapp-')
    expect(document.body.textContent).not.toContain('xoxp-')
  })

  it('shows Z-API as ready only when verified and receive-ready', () => {
    const unverified = createZApiStatus()
    unverified.readiness.verified = false
    unverified.readiness.verifiedAt = null
    mocks.statuses = [unverified]
    renderSection()

    const unverifiedCard = document.querySelector<HTMLElement>(
      '[data-settings-section="integrations-communications-z-api"]'
    )
    expect(within(unverifiedCard as HTMLElement).getByRole('status')).toHaveTextContent(
      'Needs attention'
    )

    mocks.statuses = [createZApiStatus()]
    cleanup()
    renderSection()

    const zApiCard = document.querySelector<HTMLElement>(
      '[data-settings-section="integrations-communications-z-api"]'
    )
    expect(within(zApiCard as HTMLElement).getByRole('status')).toHaveTextContent('Ready')
    expect(
      within(zApiCard as HTMLElement).getByText('Listening on http://127.0.0.1:43210')
    ).toBeVisible()
    expect(within(zApiCard as HTMLElement).getByText(/Confirmed at/)).toBeVisible()

    const degraded = createZApiStatus()
    degraded.readiness.receiveReady = false
    degraded.webhooksConfigured = false
    mocks.statuses = [degraded]
    cleanup()
    renderSection()

    const degradedCard = document.querySelector<HTMLElement>(
      '[data-settings-section="integrations-communications-z-api"]'
    )
    expect(within(degradedCard as HTMLElement).getByRole('status')).toHaveTextContent(
      'Needs attention'
    )
    expect(within(degradedCard as HTMLElement).getByText('Verified')).toBeVisible()
    expect(within(degradedCard as HTMLElement).getByText('Not configured')).toBeVisible()
  })

  it('shows technical configuration as needing listening validation without an error', () => {
    const technical = createZApiStatus()
    technical.readiness.verified = false
    technical.readiness.receiveReady = false
    technical.readiness.verifiedAt = null
    technical.listeningValidation = {
      state: 'not_started',
      attemptId: null,
      code: null,
      deadline: null,
      remainingMs: null,
      confirmedAt: null,
      error: null
    }
    mocks.statuses = [technical]
    renderSection()

    const zApiCard = document.querySelector<HTMLElement>(
      '[data-settings-section="integrations-communications-z-api"]'
    )
    expect(within(zApiCard as HTMLElement).getByRole('status')).toHaveTextContent('Needs attention')
    expect(
      within(zApiCard as HTMLElement).getByText('Validate WhatsApp listening to finish setup.')
    ).toBeVisible()
    expect(within(zApiCard as HTMLElement).queryByRole('alert')).toBeNull()
    expect(within(zApiCard as HTMLElement).getByText('Public ingress')).toBeVisible()
    expect(within(zApiCard as HTMLElement).getByText('Verified')).toBeVisible()
    expect(within(zApiCard as HTMLElement).getByText('Not confirmed')).toBeVisible()
  })

  it('announces loading statuses with text available to assistive technology', () => {
    mocks.loading = true
    renderSection()

    const statuses = screen.getAllByRole('status')
    expect(statuses).toHaveLength(3)
    for (const status of statuses) {
      expect(status).toHaveTextContent('Checking…')
    }
    const zApiCard = document.querySelector<HTMLElement>(
      '[data-settings-section="integrations-communications-z-api"]'
    )
    expect(
      within(zApiCard as HTMLElement).getByRole('button', { name: 'Configure' })
    ).toBeDisabled()
  })

  it('renders a failed Test message exactly once and announces it as an alert', () => {
    const message = 'Slack rejected the credentials.'
    mocks.statuses = [createSlackStatus({ code: 'unauthorized', message, field: 'userToken' })]
    mocks.actions.slack.testResult = { kind: 'error', message }
    renderSection()

    expect(screen.getAllByText(message)).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent(message)
  })

  it('keeps successful Test feedback in a live status line', () => {
    mocks.statuses = [createSlackStatus()]
    mocks.actions.slack.testResult = {
      kind: 'ok',
      message: 'Slack credentials verified.'
    }
    renderSection()

    expect(
      screen.getByText('Slack credentials verified.').closest('[role="status"]')
    ).not.toBeNull()
  })

  it('disables Test and Edit while a Test request is pending', () => {
    mocks.statuses = [createSlackStatus()]
    mocks.actions.slack.pending = 'test'
    renderSection()

    expect(screen.getByRole('button', { name: 'Testing…' })).toBeDisabled()
    const slackCard = document.querySelector<HTMLElement>(
      '[data-settings-section="integrations-communications-slack"]'
    )
    expect(slackCard).not.toBeNull()
    expect(within(slackCard as HTMLElement).getByRole('button', { name: 'Edit' })).toBeDisabled()
  })
})
