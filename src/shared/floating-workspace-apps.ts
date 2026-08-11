import type { BrowserSessionUserAgentMode } from './types'

export type FloatingWorkspaceAppId = 'whatsapp-web' | 'slack' | 'discord'

export type FloatingWorkspaceAppCategoryId = 'communications'

export type FloatingWorkspaceApp = {
  id: FloatingWorkspaceAppId
  categoryId: FloatingWorkspaceAppCategoryId
  label: string
  url: string
  userAgentMode: BrowserSessionUserAgentMode
}

export type FloatingWorkspaceAppCategoryGroup = {
  categoryId: FloatingWorkspaceAppCategoryId
  apps: readonly FloatingWorkspaceApp[]
}

export type FloatingWorkspaceAppPreference = {
  enabled: boolean
  hideArchivedChats: boolean
  sessionProfileIdOverride: string | null
  dedicatedSessionProfileId: string | null
}

export type FloatingWorkspaceAppPreferences = Partial<
  Record<FloatingWorkspaceAppId, FloatingWorkspaceAppPreference>
>

export const FLOATING_WORKSPACE_APP_CATEGORY_ORDER: readonly FloatingWorkspaceAppCategoryId[] = [
  'communications'
]

export const FLOATING_WORKSPACE_APPS: readonly FloatingWorkspaceApp[] = [
  {
    id: 'whatsapp-web',
    categoryId: 'communications',
    label: 'WhatsApp Web',
    url: 'https://web.whatsapp.com',
    userAgentMode: 'clean'
  },
  {
    id: 'slack',
    categoryId: 'communications',
    label: 'Slack',
    url: 'https://app.slack.com/client',
    userAgentMode: 'clean'
  },
  {
    id: 'discord',
    categoryId: 'communications',
    label: 'Discord',
    url: 'https://discord.com/app',
    userAgentMode: 'clean'
  }
]

const DEFAULT_FLOATING_WORKSPACE_APP_PREFERENCE: FloatingWorkspaceAppPreference = {
  enabled: true,
  hideArchivedChats: false,
  sessionProfileIdOverride: null,
  dedicatedSessionProfileId: null
}

export function getFloatingWorkspaceAppPreference(
  preferences: FloatingWorkspaceAppPreferences | undefined,
  appId: FloatingWorkspaceAppId
): FloatingWorkspaceAppPreference {
  return preferences?.[appId] ?? DEFAULT_FLOATING_WORKSPACE_APP_PREFERENCE
}

export function groupFloatingWorkspaceAppsByCategory(
  apps: readonly FloatingWorkspaceApp[]
): readonly FloatingWorkspaceAppCategoryGroup[] {
  const groups: FloatingWorkspaceAppCategoryGroup[] = []
  for (const categoryId of FLOATING_WORKSPACE_APP_CATEGORY_ORDER) {
    const categoryApps = apps.filter((app) => app.categoryId === categoryId)
    if (categoryApps.length > 0) {
      groups.push({ categoryId, apps: categoryApps })
    }
  }
  return groups
}

export function forgetFloatingWorkspaceAppSessionProfile(
  preferences: FloatingWorkspaceAppPreferences,
  profileId: string
): FloatingWorkspaceAppPreferences {
  const next: FloatingWorkspaceAppPreferences = {}
  let changed = false
  for (const app of FLOATING_WORKSPACE_APPS) {
    const preference = preferences[app.id]
    if (!preference) {
      continue
    }
    const referencesProfile =
      preference.sessionProfileIdOverride === profileId ||
      preference.dedicatedSessionProfileId === profileId
    changed = changed || referencesProfile
    next[app.id] = referencesProfile
      ? {
          ...preference,
          sessionProfileIdOverride:
            preference.sessionProfileIdOverride === profileId
              ? null
              : preference.sessionProfileIdOverride,
          dedicatedSessionProfileId:
            preference.dedicatedSessionProfileId === profileId
              ? null
              : preference.dedicatedSessionProfileId
        }
      : preference
  }
  return changed ? next : preferences
}

export function listEnabledFloatingWorkspaceApps(
  preferences: FloatingWorkspaceAppPreferences | undefined
): readonly FloatingWorkspaceApp[] {
  return FLOATING_WORKSPACE_APPS.filter(
    (app) => getFloatingWorkspaceAppPreference(preferences, app.id).enabled
  )
}

export function normalizeFloatingWorkspaceAppPreferences(
  value: unknown
): FloatingWorkspaceAppPreferences {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const source = value as Record<string, unknown>
  const normalized: FloatingWorkspaceAppPreferences = {}
  for (const app of FLOATING_WORKSPACE_APPS) {
    const entry = source[app.id]
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const candidate = entry as Partial<FloatingWorkspaceAppPreference>
    normalized[app.id] = {
      enabled: candidate.enabled !== false,
      hideArchivedChats: candidate.hideArchivedChats === true,
      sessionProfileIdOverride: normalizeSessionProfileId(candidate.sessionProfileIdOverride),
      dedicatedSessionProfileId: normalizeSessionProfileId(candidate.dedicatedSessionProfileId)
    }
  }
  return normalized
}

function normalizeSessionProfileId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}
