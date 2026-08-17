import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  profiles: [] as {
    id: string
    partition: string
    scope: 'isolated'
    label: string
    source: null
  }[],
  createProfile: vi.fn()
}))

vi.mock('../browser/browser-session-registry', () => ({
  browserSessionRegistry: {
    resolveKnownPartition: (id: string) =>
      mocks.profiles.find((profile) => profile.id === id)?.partition ?? null,
    listProfiles: () => mocks.profiles,
    createProfile: mocks.createProfile
  }
}))

import { resolveDiscordWebFastResponseProfile } from './compact-host-session'

describe('resolveDiscordWebFastResponseProfile', () => {
  beforeEach(() => {
    mocks.profiles.length = 0
    mocks.createProfile.mockReset()
    mocks.createProfile.mockImplementation(() => {
      const profile = {
        id: 'discord-profile',
        partition: 'persist:discord-profile',
        scope: 'isolated' as const,
        label: 'Discord',
        source: null
      }
      mocks.profiles.push(profile)
      return profile
    })
  })

  it('converges concurrent first-use requests on one profile and partition', async () => {
    const ui = { floatingWorkspaceApps: {} }
    const store = {
      getUI: vi.fn(() => ui),
      updateUI: vi.fn((updates: typeof ui) => Object.assign(ui, updates))
    }

    const [first, second] = await Promise.all([
      Promise.resolve().then(() => resolveDiscordWebFastResponseProfile(store as never)),
      Promise.resolve().then(() => resolveDiscordWebFastResponseProfile(store as never))
    ])

    expect(first).toEqual(second)
    expect(first.partition).toBe('persist:discord-profile')
    expect(mocks.createProfile).toHaveBeenCalledOnce()
  })
})
