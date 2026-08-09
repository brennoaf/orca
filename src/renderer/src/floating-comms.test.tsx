// @vitest-environment happy-dom

import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  measure: vi.fn(() => Promise.resolve()),
  action: vi.fn(() => Promise.resolve()),
  offStateChanged: vi.fn(),
  offVisibilityChanged: vi.fn(),
  visibilityChanged: null as ((visible: boolean) => void) | null,
  offSettingsChanged: vi.fn()
}))

vi.mock('./components/floating-terminal/comms-rail/communication-managers', () => ({
  LOCAL_Z_API_COMMUNICATION_MANAGER_CLIENT: {},
  COMMUNICATION_MANAGER_REGISTRY: {
    discord: {
      Presentation: ({
        isPopoverOpen,
        children
      }: {
        isPopoverOpen: boolean
        children: (presentation: {
          status: { kind: 'idle' }
          tooltip: string
          content: React.ReactNode
        }) => React.ReactNode
      }) =>
        children({
          status: { kind: 'idle' },
          tooltip: 'Discord',
          content: (
            <div data-testid="manager-content" data-visible={isPopoverOpen}>
              Manager content
            </div>
          )
        })
    }
  },
  CommunicationManagerRuntimeProvider: ({ children }: { children: React.ReactNode }) => children
}))

vi.mock('./components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children
}))

vi.mock('./i18n/I18nProvider', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => children
}))

vi.mock('./i18n/i18n', () => ({
  translate: (_key: string, fallback: string, values?: { app?: string }) =>
    fallback.replace('{{app}}', values?.app ?? '')
}))

describe('floating communications renderer root', () => {
  beforeEach(() => {
    vi.resetModules()
    document.body.innerHTML = '<div id="root"></div>'
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      }
    )
    Object.assign(window, {
      matchMedia: vi.fn(() => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      })),
      api: {
        settings: {
          getSync: vi.fn(() => null),
          get: vi.fn(() => Promise.resolve({ theme: 'system' })),
          onChanged: vi.fn(() => mocks.offSettingsChanged)
        },
        floatingComms: {
          getState: mocks.getState,
          measure: mocks.measure,
          action: mocks.action,
          discordCommand: vi.fn(),
          onStateChanged: vi.fn(() => mocks.offStateChanged),
          onVisibilityChanged: vi.fn((callback: (visible: boolean) => void) => {
            mocks.visibilityChanged = callback
            return mocks.offVisibilityChanged
          })
        }
      }
    })
    mocks.getState.mockResolvedValue({
      appId: 'discord',
      discord: {
        connection: 'connected',
        channelId: null,
        channelName: null,
        selfUserId: null,
        participants: [],
        credentialsConfigured: true,
        lastError: null
      },
      integrations: [],
      overlayOpen: false,
      visible: false
    })
    mocks.visibilityChanged = null
  })

  it('renders the registered manager inside the translated shared surface shell', async () => {
    await act(async () => {
      await import('./floating-comms')
    })
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="manager-content"]')).toBeTruthy()
    )
    const openButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Open Discord')
    )
    if (!openButton) {
      throw new Error('Shared open-app action was not rendered')
    }
    await act(async () => openButton.click())
    expect(mocks.action).toHaveBeenCalledWith({ type: 'open-app', appId: 'discord' })
    expect(mocks.getState).toHaveBeenCalled()
    expect(mocks.measure).toHaveBeenCalled()
    const content = document.querySelector('[data-testid="manager-content"]')
    expect(content?.getAttribute('data-visible')).toBe('false')
    await act(async () => mocks.visibilityChanged?.(true))
    expect(content?.getAttribute('data-visible')).toBe('true')
    await act(async () => mocks.visibilityChanged?.(false))
    expect(content?.getAttribute('data-visible')).toBe('false')
  })
})
