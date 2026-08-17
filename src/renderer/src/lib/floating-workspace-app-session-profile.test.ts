// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOATING_WORKSPACE_APPS } from '../../../shared/floating-workspace-apps'
import { resolveFloatingWorkspaceAppSessionProfile } from './floating-workspace-app-session-profile'

describe('resolveFloatingWorkspaceAppSessionProfile', () => {
  const profile = {
    id: 'discord-profile',
    partition: 'persist:discord-profile',
    scope: 'isolated' as const,
    label: 'Discord',
    source: null
  }
  const resolveSessionProfile = vi.fn(() => Promise.resolve(profile))

  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(window, {
      api: { discordWebFastResponse: { resolveSessionProfile } }
    })
  })

  it('uses the main-owned Discord profile instead of creating a renderer-side competitor', async () => {
    const store = {
      browserSessionProfilesByHostId: {},
      floatingWorkspaceApps: {},
      fetchBrowserSessionProfiles: vi.fn(),
      createBrowserSessionProfile: vi.fn(),
      setFloatingWorkspaceAppPreference: vi.fn()
    }
    const discord = FLOATING_WORKSPACE_APPS.find((app) => app.id === 'discord')
    if (!discord) {
      throw new Error('discord_catalog_missing')
    }

    await expect(
      resolveFloatingWorkspaceAppSessionProfile(store as never, discord)
    ).resolves.toEqual(profile)
    expect(resolveSessionProfile).toHaveBeenCalledOnce()
    expect(store.createBrowserSessionProfile).not.toHaveBeenCalled()
    expect(store.setFloatingWorkspaceAppPreference).toHaveBeenCalledWith('discord', {
      dedicatedSessionProfileId: profile.id
    })
  })
})
