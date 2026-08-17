import type { Store } from '../persistence'
import { browserSessionRegistry } from '../browser/browser-session-registry'
import {
  FLOATING_WORKSPACE_APPS,
  getFloatingWorkspaceAppPreference,
  type FloatingWorkspaceAppPreferences
} from '../../shared/floating-workspace-apps'

export function resolveSlackFastResponsePartition(store: Store): string {
  const preferences = store.getUI().floatingWorkspaceApps as FloatingWorkspaceAppPreferences
  const preference = getFloatingWorkspaceAppPreference(preferences, 'slack')
  const profileId = preference.sessionProfileIdOverride ?? preference.dedicatedSessionProfileId
  if (profileId) {
    const partition = browserSessionRegistry.resolveKnownPartition(profileId)
    if (!partition) {
      throw new Error('slack_fast_response_profile_denied')
    }
    return partition
  }
  const slack = FLOATING_WORKSPACE_APPS.find((app) => app.id === 'slack')
  if (!slack) {
    throw new Error('slack_fast_response_catalog_missing')
  }
  const profile = browserSessionRegistry.createProfile('isolated', slack.label, {
    userAgentMode: slack.userAgentMode
  })
  if (!profile) {
    throw new Error('slack_fast_response_profile_unavailable')
  }
  store.updateUI({
    floatingWorkspaceApps: {
      ...preferences,
      slack: { ...preference, dedicatedSessionProfileId: profile.id }
    }
  })
  return profile.partition
}
