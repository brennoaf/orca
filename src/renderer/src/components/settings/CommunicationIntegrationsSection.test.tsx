// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CommunicationIntegrationStatus,
  CommunicationProviderId,
  SlackCommunicationIntegrationStatus
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

const mocks = vi.hoisted(() => ({
  statuses: [] as CommunicationIntegrationStatus[],
  loading: false,
  error: null as string | null,
  actions: {} as Record<CommunicationProviderId, MockAction>
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
    expect(
      screen.getByText(/Receiving WhatsApp messages requires an external public HTTPS relay/)
    ).toBeVisible()
    expect(document.body.textContent).not.toContain('xapp-')
    expect(document.body.textContent).not.toContain('xoxp-')
  })

  it('announces loading statuses with text available to assistive technology', () => {
    mocks.loading = true
    renderSection()

    const statuses = screen.getAllByRole('status')
    expect(statuses).toHaveLength(3)
    for (const status of statuses) {
      expect(status).toHaveTextContent('Checking…')
    }
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
