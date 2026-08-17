import {
  getFloatingWorkspaceAppPreference,
  type FloatingWorkspaceApp
} from '../../../shared/floating-workspace-apps'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import type { BrowserSessionProfile } from '../../../shared/browser-workspace-types'
import type { AppState } from '@/store/types'

export type FloatingWorkspaceAppSessionStore = Pick<
  AppState,
  | 'browserSessionProfilesByHostId'
  | 'createBrowserSessionProfile'
  | 'fetchBrowserSessionProfiles'
  | 'floatingWorkspaceApps'
  | 'setFloatingWorkspaceAppPreference'
>

export async function resolveFloatingWorkspaceAppSessionProfile(
  store: FloatingWorkspaceAppSessionStore,
  app: FloatingWorkspaceApp
): Promise<BrowserSessionProfile | null> {
  if (app.id === 'discord' && typeof window !== 'undefined' && window.api.discordWebFastResponse) {
    const profile = await window.api.discordWebFastResponse.resolveSessionProfile()
    store.setFloatingWorkspaceAppPreference(app.id, {
      dedicatedSessionProfileId: profile.id
    })
    return profile
  }
  const preference = getFloatingWorkspaceAppPreference(store.floatingWorkspaceApps, app.id)
  const candidateIds = [
    preference.sessionProfileIdOverride,
    preference.dedicatedSessionProfileId
  ].filter((profileId): profileId is string => profileId !== null)

  if (candidateIds.length > 0) {
    const localProfiles =
      store.browserSessionProfilesByHostId[LOCAL_EXECUTION_HOST_ID] ??
      (await store.fetchBrowserSessionProfiles(LOCAL_EXECUTION_HOST_ID))
    for (const profileId of candidateIds) {
      const configured = localProfiles.find((profile) => profile.id === profileId)
      if (configured) {
        return configured
      }
    }
  }

  const created = await store.createBrowserSessionProfile('isolated', app.label, {
    userAgentMode: app.userAgentMode,
    hostId: LOCAL_EXECUTION_HOST_ID
  })
  if (!created) {
    return null
  }
  store.setFloatingWorkspaceAppPreference(app.id, { dedicatedSessionProfileId: created.id })
  return created
}
