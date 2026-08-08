import { useEffect } from 'react'
import {
  FLOATING_WORKSPACE_APPS,
  getFloatingWorkspaceAppPreference,
  groupFloatingWorkspaceAppsByCategory,
  type FloatingWorkspaceApp
} from '../../../../shared/floating-workspace-apps'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import type { BrowserSessionProfile } from '../../../../shared/types'
import { useAppStore } from '../../store'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { SearchableSetting } from './SearchableSetting'
import { SettingsRow, SettingsSubsectionHeader, SettingsSwitch } from './SettingsFormControls'
import { getFloatingWorkspaceAppCategoryLabel } from '@/lib/floating-workspace-app-labels'
import { translate } from '@/i18n/i18n'

const DEDICATED_SESSION_VALUE = 'dedicated'

const EMPTY_BROWSER_SESSION_PROFILES: BrowserSessionProfile[] = []

function FloatingWorkspaceAppRow({ app }: { app: FloatingWorkspaceApp }): React.JSX.Element {
  const preferences = useAppStore((s) => s.floatingWorkspaceApps)
  const setPreference = useAppStore((s) => s.setFloatingWorkspaceAppPreference)
  const browserSessionProfiles = useAppStore(
    (s) =>
      s.browserSessionProfilesByHostId[LOCAL_EXECUTION_HOST_ID] ?? EMPTY_BROWSER_SESSION_PROFILES
  )
  const preference = getFloatingWorkspaceAppPreference(preferences, app.id)
  const selectedValue =
    preference.sessionProfileIdOverride !== null &&
    browserSessionProfiles.some((profile) => profile.id === preference.sessionProfileIdOverride)
      ? preference.sessionProfileIdOverride
      : DEDICATED_SESSION_VALUE

  return (
    <SettingsRow
      label={app.label}
      description={app.url}
      control={
        <div className="flex items-center gap-2">
          <Select
            value={selectedValue}
            onValueChange={(value) =>
              setPreference(app.id, {
                sessionProfileIdOverride: value === DEDICATED_SESSION_VALUE ? null : value
              })
            }
          >
            <SelectTrigger className="h-7 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEDICATED_SESSION_VALUE} className="text-xs">
                {translate(
                  'auto.components.settings.FloatingWorkspaceAppsSection.dedicatedSession',
                  'Dedicated session'
                )}
              </SelectItem>
              {browserSessionProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id} className="text-xs">
                  {profile.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SettingsSwitch
            checked={preference.enabled}
            ariaLabel={app.label}
            onChange={() => setPreference(app.id, { enabled: !preference.enabled })}
          />
        </div>
      }
    />
  )
}

export function FloatingWorkspaceAppsSection(): React.JSX.Element {
  const fetchBrowserSessionProfiles = useAppStore((s) => s.fetchBrowserSessionProfiles)
  useEffect(() => {
    void fetchBrowserSessionProfiles(LOCAL_EXECUTION_HOST_ID)
  }, [fetchBrowserSessionProfiles])

  return (
    <>
      {groupFloatingWorkspaceAppsByCategory(FLOATING_WORKSPACE_APPS).map((group) => (
        <SearchableSetting
          key={group.categoryId}
          title={getFloatingWorkspaceAppCategoryLabel(group.categoryId)}
          description={translate(
            'auto.components.settings.FloatingWorkspaceAppsSection.description',
            'Choose which apps appear in the floating workspace new-tab menu and which browser session each one uses.'
          )}
          keywords={['WhatsApp', 'Slack', 'Discord', 'apps', 'communications', 'chat', 'session']}
          className="space-y-2"
        >
          <SettingsSubsectionHeader
            title={getFloatingWorkspaceAppCategoryLabel(group.categoryId)}
            description={translate(
              'auto.components.settings.FloatingWorkspaceAppsSection.categoryDescription',
              'Each app opens as a floating workspace browser tab with its own persistent session.'
            )}
          />
          <div className="divide-y divide-border/40">
            {group.apps.map((app) => (
              <FloatingWorkspaceAppRow key={app.id} app={app} />
            ))}
          </div>
        </SearchableSetting>
      ))}
    </>
  )
}
