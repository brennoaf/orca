import type { Store } from '../persistence'
import { browserSessionRegistry } from '../browser/browser-session-registry'
import type { BrowserSessionProfile } from '../../shared/types'
import {
  FLOATING_WORKSPACE_APPS,
  getFloatingWorkspaceAppPreference,
  type FloatingWorkspaceAppPreferences
} from '../../shared/floating-workspace-apps'

export function resolveDiscordWebFastResponseProfile(store: Store): BrowserSessionProfile {
  const preferences = store.getUI().floatingWorkspaceApps as FloatingWorkspaceAppPreferences
  const preference = getFloatingWorkspaceAppPreference(preferences, 'discord')
  const profileId = preference.sessionProfileIdOverride ?? preference.dedicatedSessionProfileId
  if (profileId) {
    const partition = browserSessionRegistry.resolveKnownPartition(profileId)
    if (!partition) {
      throw new Error('discord_web_fast_response_profile_denied')
    }
    const profile = browserSessionRegistry
      .listProfiles()
      .find((candidate) => candidate.id === profileId)
    if (!profile || profile.partition !== partition) {
      throw new Error('discord_web_fast_response_profile_denied')
    }
    return profile
  }
  const discord = FLOATING_WORKSPACE_APPS.find((app) => app.id === 'discord')
  if (!discord) {
    throw new Error('discord_web_fast_response_catalog_missing')
  }
  const profile = browserSessionRegistry.createProfile('isolated', discord.label, {
    userAgentMode: discord.userAgentMode
  })
  if (!profile) {
    throw new Error('discord_web_fast_response_profile_unavailable')
  }
  store.updateUI({
    floatingWorkspaceApps: {
      ...preferences,
      discord: { ...preference, dedicatedSessionProfileId: profile.id }
    }
  })
  return profile
}

export function resolveDiscordWebFastResponsePartition(store: Store): string {
  return resolveDiscordWebFastResponseProfile(store).partition
}
