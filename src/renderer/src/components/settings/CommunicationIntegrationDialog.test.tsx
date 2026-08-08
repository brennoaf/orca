// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  SaveCommunicationIntegrationParams,
  SlackCommunicationIntegrationStatus
} from '../../../../shared/communication-integrations'
import { DEFAULT_SLACK_API_BASE_URL } from '../../../../shared/communication-integrations'
import { ConfirmationDialogContext } from '@/components/confirmation-dialog-context'
import { SlackCommunicationIntegrationDialog } from './CommunicationIntegrationDialog'
import type { CommunicationIntegrationPendingOperation } from './CommunicationIntegrationDialogFields'

const slackStatus: SlackCommunicationIntegrationStatus = {
  provider: 'slack',
  endpoint: {
    baseUrl: DEFAULT_SLACK_API_BASE_URL,
    authority: 'slack.com',
    trust: { kind: 'default' }
  },
  readiness: {
    configured: true,
    verified: false,
    sendReady: false,
    receiveReady: false,
    verifiedAt: null,
    lastError: null
  },
  appTokenStored: true,
  userTokenStored: true,
  workspace: null
}

function dialog(
  overrides: {
    pending?: CommunicationIntegrationPendingOperation
    error?: string | null
    onSave?: (params: SaveCommunicationIntegrationParams) => Promise<boolean>
    onClear?: () => Promise<boolean>
  } = {},
  confirm: (options: {
    title: string
    description?: string
    confirmLabel?: string
    confirmVariant?: 'default' | 'destructive'
  }) => Promise<boolean> = async () => false
): React.JSX.Element {
  return (
    <ConfirmationDialogContext.Provider value={confirm}>
      <SlackCommunicationIntegrationDialog
        open
        onOpenChange={vi.fn()}
        status={slackStatus}
        pending={overrides.pending ?? null}
        error={overrides.error ?? null}
        onSave={overrides.onSave ?? (async () => false)}
        onClear={overrides.onClear ?? (async () => false)}
      />
    </ConfirmationDialogContext.Provider>
  )
}

describe('SlackCommunicationIntegrationDialog', () => {
  afterEach(() => cleanup())

  it('never rehydrates stored secrets and emits keep, replace, clear, and undo mutations', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async (_params: SaveCommunicationIntegrationParams) => false)
    render(dialog({ onSave }))

    const appToken = screen.getByLabelText('App Token')
    const userToken = screen.getByLabelText('User OAuth Token')
    expect(appToken).toHaveValue('')
    expect(userToken).toHaveValue('')
    expect(
      screen.getAllByText('A token is stored. Leave this field empty to keep it.')
    ).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        appToken: { action: 'keep' },
        userToken: { action: 'keep' }
      })
    )

    await user.type(appToken, 'replacement-app-token')
    await user.click(screen.getAllByRole('button', { name: 'Clear saved token' })[1])
    expect(userToken).toBeDisabled()
    expect(screen.getByText('The saved token will be cleared when you save.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        appToken: { action: 'replace', value: 'replacement-app-token' },
        userToken: { action: 'clear' }
      })
    )

    await user.click(screen.getByRole('button', { name: 'Undo clear' }))
    expect(userToken).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        appToken: { action: 'replace', value: 'replacement-app-token' },
        userToken: { action: 'keep' }
      })
    )
  })

  it('requires confirmation before clearing stored integration data', async () => {
    const user = userEvent.setup()
    const confirm = vi
      .fn<
        (options: { title: string; confirmVariant?: 'default' | 'destructive' }) => Promise<boolean>
      >()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const onClear = vi.fn(async () => false)
    render(dialog({ onClear }, confirm))

    await user.click(screen.getByRole('button', { name: 'Clear integration' }))
    expect(onClear).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Clear integration' }))
    expect(onClear).toHaveBeenCalledOnce()
    expect(confirm).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: 'Clear Slack integration?',
        confirmVariant: 'destructive'
      })
    )
  })

  it('requires custom endpoint trust, resets it on authority changes, and accepts canonical default URLs', async () => {
    const user = userEvent.setup()
    render(dialog())

    await user.click(screen.getByRole('button', { name: 'Advanced' }))
    const endpoint = screen.getByLabelText('API base URL')
    const save = screen.getByRole('button', { name: 'Save' })

    await user.clear(endpoint)
    await user.type(endpoint, 'https://SLACK.COM.:443/api/')
    expect(save).toBeEnabled()
    expect(screen.queryByRole('checkbox')).toBeNull()

    await user.clear(endpoint)
    await user.type(endpoint, 'https://proxy.example.test/slack')
    const trust = screen.getByRole('checkbox')
    expect(save).toBeDisabled()
    await user.click(trust)
    expect(save).toBeEnabled()

    await user.clear(endpoint)
    await user.type(endpoint, 'https://other.example.test/slack')
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked())
    expect(save).toBeDisabled()

    await user.click(screen.getByRole('checkbox'))
    fireEvent.change(endpoint, {
      target: { value: 'https://other.example.test/another-path/' }
    })
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(save).toBeEnabled()

    await user.clear(endpoint)
    await user.type(endpoint, 'https://user@other.example.test/api')
    expect(endpoint).toHaveAttribute('aria-invalid', 'true')
    expect(save).toBeDisabled()
  })

  it('disables dialog actions while pending and exposes inline errors as alerts', () => {
    const { rerender } = render(dialog({ pending: 'save' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear integration' })).toBeDisabled()
    expect(screen.getByLabelText('App Token')).toBeDisabled()

    rerender(dialog({ pending: 'clear', error: 'Credentials could not be cleared.' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Credentials could not be cleared.')
    expect(screen.getByRole('button', { name: 'Clear integration' })).toBeDisabled()
  })
})
