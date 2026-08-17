// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  FloatingWorkspaceAppId,
  FloatingWorkspaceAppPreference,
  FloatingWorkspaceAppPreferences
} from '../../../../shared/floating-workspace-apps'

const mocks = vi.hoisted(() => ({
  setPreference: vi.fn(),
  openApp: vi.fn(async () => null),
  slackPreference: {
    enabled: true,
    hideArchivedChats: false,
    sessionProfileIdOverride: null,
    dedicatedSessionProfileId: 'slack-profile'
  } as FloatingWorkspaceAppPreference
}))

type StoreFixture = {
  floatingWorkspaceApps: FloatingWorkspaceAppPreferences
  setFloatingWorkspaceAppPreference: (
    appId: FloatingWorkspaceAppId,
    update: Partial<FloatingWorkspaceAppPreference>
  ) => void
}

vi.mock('@/store', () => {
  const state: StoreFixture = {
    floatingWorkspaceApps: { slack: mocks.slackPreference },
    setFloatingWorkspaceAppPreference: mocks.setPreference
  }
  const useAppStore = Object.assign(
    <T,>(selector: (store: StoreFixture) => T): T => selector(state),
    { getState: () => state }
  )
  return { useAppStore }
})

vi.mock('@/lib/floating-workspace-tab-creation', () => ({
  openOrFocusFloatingWorkspaceAppTab: mocks.openApp
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

vi.mock('@/components/discord-voice/DiscordVoiceOverlaySwitch', () => ({
  DiscordVoiceOverlaySwitch: () => null
}))

vi.mock('./CommunicationIntegrationDialog', () => ({
  DiscordCommunicationIntegrationDialog: () => null
}))

vi.mock('./use-communication-integration-statuses', () => ({
  useCommunicationIntegrationStatuses: () => ({
    getStatus: () => null,
    loading: false,
    error: null
  })
}))

vi.mock('./use-communication-integration-card-actions', () => ({
  useCommunicationIntegrationCardActions: () => ({
    pending: null,
    error: null,
    testResult: null,
    save: vi.fn(),
    clear: vi.fn(),
    test: vi.fn()
  })
}))

import { CommunicationIntegrationsSection } from './CommunicationIntegrationsSection'

describe('Slack web integration settings', () => {
  beforeEach(() => {
    mocks.setPreference.mockReset()
    mocks.openApp.mockClear()
    mocks.slackPreference.enabled = true
  })

  afterEach(() => cleanup())

  it('shows web-session controls without obsolete API credential fields', () => {
    render(<CommunicationIntegrationsSection />)

    expect(
      screen.getByText(
        'Slack Web uses its own persistent browser session for full and fast-response views.'
      )
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Open Slack' })).toBeEnabled()
    expect(screen.getByRole('switch', { name: 'Show Slack' })).toBeChecked()
    expect(document.body.textContent).not.toMatch(
      /Socket Mode|App Token|User OAuth Token|API base URL/u
    )
  })

  it('updates catalog enablement and opens Slack through the shared dedup flow', async () => {
    const user = userEvent.setup()
    render(<CommunicationIntegrationsSection />)

    await user.click(screen.getByRole('switch', { name: 'Show Slack' }))
    expect(mocks.setPreference).toHaveBeenCalledWith('slack', { enabled: false })

    await user.click(screen.getByRole('button', { name: 'Open Slack' }))
    expect(mocks.openApp).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'slack', url: 'https://app.slack.com/client' })
    )
  })
})
