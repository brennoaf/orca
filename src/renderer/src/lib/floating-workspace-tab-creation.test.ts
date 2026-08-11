import { describe, expect, it, vi } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import {
  FLOATING_WORKSPACE_APPS,
  type FloatingWorkspaceAppPreferences
} from '../../../shared/floating-workspace-apps'
import type { BrowserSessionProfile, BrowserTab } from '../../../shared/types'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import { openOrFocusFloatingWorkspaceAppTab } from './floating-workspace-tab-creation'

const discord = FLOATING_WORKSPACE_APPS.find((app) => app.id === 'discord')!

function makeBrowserTab(overrides: Partial<BrowserTab> = {}): BrowserTab {
  return {
    id: 'browser-1',
    worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
    url: 'https://discord.com/channels/1/2',
    title: 'Discord',
    loading: false,
    faviconUrl: null,
    canGoBack: true,
    canGoForward: false,
    loadError: null,
    createdAt: 1,
    ...overrides
  }
}

function makeStore(tabs: BrowserTab[]) {
  const created = makeBrowserTab({ id: 'created' })
  return {
    store: {
      activeGroupIdByWorktree: { [FLOATING_TERMINAL_WORKTREE_ID]: 'group-1' },
      browserTabsByWorktree: { [FLOATING_TERMINAL_WORKTREE_ID]: tabs },
      browserSessionProfilesByHostId: {
        [LOCAL_EXECUTION_HOST_ID]: [
          {
            id: 'shared-profile',
            scope: 'isolated' as const,
            partition: 'persist:shared-profile',
            label: 'Shared',
            source: null
          }
        ]
      },
      floatingWorkspaceApps: {
        discord: {
          enabled: true,
          sessionProfileIdOverride: 'shared-profile',
          dedicatedSessionProfileId: null
        }
      } as FloatingWorkspaceAppPreferences,
      createBrowserTab: vi.fn(() => created),
      setActiveBrowserTab: vi.fn(),
      createBrowserSessionProfile: vi.fn(),
      fetchBrowserSessionProfiles: vi.fn(),
      setFloatingWorkspaceAppPreference: vi.fn()
    },
    created
  }
}

describe('openOrFocusFloatingWorkspaceAppTab', () => {
  it('focuses the canonical app tab after its URL changes', async () => {
    const existing = makeBrowserTab({ floatingWorkspaceAppId: 'discord' })
    const { store } = makeStore([existing])

    await expect(openOrFocusFloatingWorkspaceAppTab(store, discord)).resolves.toBe(existing)
    expect(store.setActiveBrowserTab).toHaveBeenCalledWith(existing.id)
    expect(store.createBrowserTab).not.toHaveBeenCalled()
  })

  it('does not collide with another app that uses the same session profile', async () => {
    const slack = makeBrowserTab({ floatingWorkspaceAppId: 'slack' })
    const { store, created } = makeStore([slack])

    await expect(openOrFocusFloatingWorkspaceAppTab(store, discord)).resolves.toBe(created)
    expect(store.createBrowserTab).toHaveBeenCalledWith(
      FLOATING_TERMINAL_WORKTREE_ID,
      discord.url,
      expect.objectContaining({
        floatingWorkspaceAppId: 'discord',
        sessionProfileId: 'shared-profile'
      })
    )
  })

  it('serializes concurrent opens through one profile and one tab creation', async () => {
    const { store, created } = makeStore([])
    store.browserSessionProfilesByHostId[LOCAL_EXECUTION_HOST_ID] = []
    store.floatingWorkspaceApps.discord = {
      enabled: true,
      hideArchivedChats: false,
      sessionProfileIdOverride: null,
      dedicatedSessionProfileId: null
    }
    let resolveProfile!: (profile: BrowserSessionProfile | null) => void
    const profilePromise = new Promise<BrowserSessionProfile | null>((resolve) => {
      resolveProfile = resolve
    })
    store.createBrowserSessionProfile.mockImplementation(() => profilePromise)

    const first = openOrFocusFloatingWorkspaceAppTab(store, discord)
    const second = openOrFocusFloatingWorkspaceAppTab(store, discord)

    expect(first).toBe(second)
    expect(store.createBrowserSessionProfile).toHaveBeenCalledTimes(1)
    expect(store.createBrowserTab).not.toHaveBeenCalled()

    resolveProfile({
      id: 'discord-profile',
      scope: 'isolated',
      partition: 'persist:discord-profile',
      label: 'Discord',
      source: null
    })

    await expect(Promise.all([first, second])).resolves.toEqual([created, created])
    expect(store.setFloatingWorkspaceAppPreference).toHaveBeenCalledTimes(1)
    expect(store.createBrowserTab).toHaveBeenCalledTimes(1)
  })

  it('propagates a shared failure and clears it before retrying', async () => {
    const { store, created } = makeStore([])
    store.browserSessionProfilesByHostId[LOCAL_EXECUTION_HOST_ID] = []
    store.floatingWorkspaceApps.discord = {
      enabled: true,
      hideArchivedChats: false,
      sessionProfileIdOverride: null,
      dedicatedSessionProfileId: null
    }
    const failure = new Error('profile failed')
    store.createBrowserSessionProfile.mockImplementation(() => Promise.reject(failure))

    const first = openOrFocusFloatingWorkspaceAppTab(store, discord)
    const second = openOrFocusFloatingWorkspaceAppTab(store, discord)
    await expect(Promise.all([first, second])).rejects.toBe(failure)

    store.createBrowserSessionProfile.mockImplementation(() =>
      Promise.resolve({
        id: 'discord-profile',
        scope: 'isolated',
        partition: 'persist:discord-profile',
        label: 'Discord',
        source: null
      })
    )

    await expect(openOrFocusFloatingWorkspaceAppTab(store, discord)).resolves.toBe(created)
    expect(store.createBrowserSessionProfile).toHaveBeenCalledTimes(2)
  })
})
