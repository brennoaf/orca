// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DiscordVoiceSnapshot } from '../../../../../shared/discord-voice'
import type {
  DiscordWebCompactMode,
  DiscordWebCompactModeChanged
} from '../../../../../shared/discord-web-fast-response'
import { FLOATING_WORKSPACE_APPS } from '../../../../../shared/floating-workspace-apps'
import { CommunicationManagerSurfaceContent } from './CommunicationManagerSurfaceContent'
import { DiscordPresentation } from './communication-managers'

const mocks = vi.hoisted(() => ({
  snapshot: {
    connection: 'disconnected',
    channelId: null,
    channelName: null,
    selfUserId: null,
    participants: [],
    credentialsConfigured: false,
    lastError: null
  } as DiscordVoiceSnapshot,
  apply: vi.fn(),
  command: vi.fn(),
  openSettings: vi.fn(),
  setOverlayOpen: vi.fn(),
  runtimeCall: vi.fn(),
  webState: { kind: 'ready', contentMode: 'ready' },
  compactModeListener: null as ((state: DiscordWebCompactModeChanged) => void) | null
}))

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: Record<string, string | number>): string =>
    Object.entries(values ?? {}).reduce(
      (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
      fallback
    )
}))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children
}))

vi.mock('@/components/discord-voice/useDiscordVoiceSnapshot', () => ({
  callDiscordVoice: mocks.command,
  useDiscordVoiceSnapshot: () => ({ snapshot: mocks.snapshot, apply: mocks.apply })
}))

vi.mock('./use-discord-web-fast-response-host', () => ({
  useDiscordWebFastResponseHost: () => mocks.webState
}))

vi.mock('@/runtime/runtime-rpc-client', () => ({
  callRuntimeRpc: mocks.runtimeCall
}))

vi.mock('./communication-manager-runtime', () => ({
  CommunicationManagerRuntimeProvider: ({ children }: { children: React.ReactNode }) => children,
  useCommunicationManagerRuntime: () => ({
    commandDiscord: mocks.command,
    loadIntegrationStatuses: vi.fn(),
    openSettings: mocks.openSettings,
    overlayOpen: false,
    setOverlayOpen: mocks.setOverlayOpen
  }),
  useCommunicationManagerStatuses: vi.fn(),
  useCommunicationSettingsAction: () => mocks.openSettings
}))

vi.mock('./communication-manager-actions', () => ({
  getCommunicationSettingsTarget: vi.fn(),
  useOpenCommunicationSettings: () => mocks.openSettings
}))

function renderPresentation(): void {
  render(
    <DiscordPresentation
      isPopoverOpen
      discordWebHost={{
        identity: {
          target: 'dock',
          appId: 'discord',
          generation: 1,
          revision: 1,
          tabId: 'all',
          activeLeafAppId: 'discord'
        },
        visible: true
      }}
    >
      {(presentation) => (
        <>
          <div data-testid="discord-web-content">{presentation.content}</div>
          <div data-testid="discord-header-actions">{presentation.headerActions}</div>
          <output data-testid="discord-hide-footer">{String(presentation.hideFooter)}</output>
        </>
      )}
    </DiscordPresentation>
  )
}

describe('DiscordPresentation', () => {
  beforeEach(() => {
    mocks.snapshot = {
      connection: 'disconnected',
      channelId: null,
      channelName: null,
      selfUserId: null,
      participants: [],
      credentialsConfigured: false,
      lastError: null
    }
    mocks.webState = { kind: 'ready', contentMode: 'ready' }
    mocks.compactModeListener = null
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        discordWebFastResponse: {
          onCompactModeChanged: (listener: (state: DiscordWebCompactModeChanged) => void) => {
            mocks.compactModeListener = listener
            return () => {
              mocks.compactModeListener = null
            }
          }
        }
      }
    })
    mocks.runtimeCall.mockImplementation((_: unknown, method: string) =>
      Promise.resolve(
        method.endsWith('getCompactMode')
          ? { mode: { kind: 'manager', tab: 'servers' }, canClose: false }
          : { mode: { kind: 'manager', tab: 'servers' }, canClose: false, state: 'installed' }
      )
    )
    vi.clearAllMocks()
  })

  afterEach(cleanup)

  it('keeps Discord Web full-height and exposes unconfigured voice only in the header', () => {
    renderPresentation()

    expect(screen.getByLabelText('Discord Web — fast response')).toBeTruthy()
    expect(screen.queryByText('Discord not connected')).toBeNull()
    expect(screen.getByTestId('discord-hide-footer').textContent).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Controles de voz não configurados' }))
    expect(mocks.openSettings).toHaveBeenCalledWith('discord')
  })

  it('shows real compact call controls in the header when voice is active', () => {
    mocks.snapshot = {
      connection: 'connected',
      channelId: 'voice-channel',
      channelName: 'Daily voice',
      selfUserId: 'self',
      participants: [
        {
          userId: 'self',
          displayName: 'Brenno',
          avatarUrl: null,
          mute: false,
          deaf: false,
          selfMute: false,
          selfDeaf: false,
          speaking: false
        }
      ],
      credentialsConfigured: true,
      lastError: null
    }

    renderPresentation()

    expect(screen.getByText('Daily voice')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Mute' }).closest('[data-no-drag]')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Deafen' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy()
    expect(screen.queryByText('Connected — not in a call')).toBeNull()
    expect(screen.getByText('Daily voice').className).toContain('max-w-28')
    expect(screen.getByText('Daily voice').className).toContain('shrink-0')
    expect(
      screen.getByRole('button', { name: 'Mute' }).closest('[data-no-drag]')?.className
    ).toContain('shrink-0')
  })

  it('exposes one compact hub button without header tabs', async () => {
    renderPresentation()

    const hub = await screen.findByRole('button', { name: 'Discord hub has no previous view' })
    expect(hub.closest('[data-no-drag]')).toBeTruthy()
    expect(hub).toHaveProperty('disabled', true)
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('tracks DOM-driven host modes and reopens the contextual manager', async () => {
    renderPresentation()
    await screen.findByRole('button', { name: 'Discord hub has no previous view' })
    const dedicated: DiscordWebCompactMode = {
      kind: 'dedicated',
      source: {
        kind: 'direct-message',
        href: '/channels/@me/12345678901234567',
        name: 'Brenno'
      }
    }

    mocks.compactModeListener?.({ mode: dedicated, canClose: false })
    const toggle = await screen.findByRole('button', { name: 'Open Discord manager' })
    fireEvent.click(toggle)

    await waitFor(() =>
      expect(mocks.runtimeCall).toHaveBeenCalledWith(
        { kind: 'local' },
        'discordWebFastResponse.toggleCompactHub'
      )
    )
  })

  it('keeps the compact control disabled with an honest error after a failed read', async () => {
    mocks.runtimeCall.mockRejectedValueOnce(new Error('unavailable'))
    renderPresentation()

    const toggle = await screen.findByRole('button', { name: 'Could not change the Discord view.' })
    expect(toggle).toHaveProperty('disabled', true)
  })

  it.each([
    ['pending', 'Selecting voice channel…'],
    ['failed', 'Could not select voice channel.']
  ] as const)('renders the real %s selection state in the header', (kind, label) => {
    mocks.snapshot = {
      connection: 'connected',
      channelId: null,
      channelName: null,
      selfUserId: 'self',
      participants: [],
      credentialsConfigured: true,
      lastError: null,
      selection: {
        kind,
        revision: 2,
        requestId: 2,
        channelId: '12345678901234567',
        errorCode: kind === 'failed' ? 'selection_failed' : null
      }
    }

    renderPresentation()

    expect(screen.getByRole('status', { name: label })).toBeTruthy()
  })

  it('keeps detached header controls clickable while free header space remains draggable', () => {
    const app = FLOATING_WORKSPACE_APPS.find((candidate) => candidate.id === 'discord')
    if (!app) {
      throw new Error('Discord app fixture missing')
    }
    render(
      <CommunicationManagerSurfaceContent
        app={app}
        content={<div />}
        detached
        headerActions={<button type="button">Manager action</button>}
        onOpenApp={vi.fn()}
        onToggleDetached={vi.fn()}
      />
    )

    const action = screen.getByRole('button', { name: 'Manager action' })
    expect(action.closest('[data-no-drag]')).toBeTruthy()
    const header = screen.getByText('Discord').closest('[data-drag-region]')
    expect(header).toBeTruthy()
    expect(header?.className).toContain('min-w-0')
    expect(header?.className).not.toContain('overflow-hidden')
    expect(header?.className).not.toContain('flex-wrap')
    const actions = screen.getByRole('region', { name: 'Discord controls' })
    expect(actions.className).toContain('overflow-x-auto')
    expect(actions.className).not.toContain('overflow-hidden')
    expect(actions.tabIndex).toBe(0)
  })

  it('keeps every active-call action reachable through the detached header viewport', async () => {
    mocks.snapshot = {
      connection: 'connected',
      channelId: 'voice-channel',
      channelName: 'Daily voice',
      selfUserId: 'self',
      participants: [
        {
          userId: 'self',
          displayName: 'Brenno',
          avatarUrl: null,
          mute: false,
          deaf: false,
          selfMute: false,
          selfDeaf: false,
          speaking: false
        }
      ],
      credentialsConfigured: true,
      lastError: null
    }
    const app = FLOATING_WORKSPACE_APPS.find((candidate) => candidate.id === 'discord')
    if (!app) {
      throw new Error('Discord app fixture missing')
    }
    render(
      <DiscordPresentation
        isPopoverOpen
        discordWebHost={{
          identity: {
            target: 'dock',
            appId: 'discord',
            generation: 1,
            revision: 1,
            tabId: 'all',
            activeLeafAppId: 'discord'
          },
          visible: true
        }}
      >
        {(presentation) => (
          <CommunicationManagerSurfaceContent
            app={app}
            content={presentation.content}
            detached
            headerActions={presentation.headerActions}
            hideFooter={presentation.hideFooter}
            onOpenApp={vi.fn()}
            onToggleDetached={vi.fn()}
          />
        )}
      </DiscordPresentation>
    )

    await screen.findByRole('button', { name: 'Discord hub has no previous view' })
    const actions = screen.getByRole('region', { name: 'Discord controls' })
    expect(
      actions.contains(screen.getByRole('button', { name: 'Discord hub has no previous view' }))
    ).toBe(true)
    for (const name of ['Mute', 'Deafen', 'Disconnect']) {
      expect(actions.contains(screen.getByRole('button', { name }))).toBe(true)
    }
    expect(actions.className).toContain('overflow-x-auto')
    expect(actions.tabIndex).toBe(0)
    expect(actions.contains(screen.getByRole('button', { name: 'Open Discord' }))).toBe(false)
    expect(actions.contains(screen.getByRole('button', { name: 'Back to panel' }))).toBe(false)
  })
})
