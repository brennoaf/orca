import type { CommunicationProviderId } from '../../../../../shared/communication-integrations'
import { COMMUNICATION_INTEGRATION_SECTION_IDS } from '../../../../../shared/communication-integrations'
import { DiscordVoiceOverlaySwitch } from '@/components/discord-voice/DiscordVoiceOverlaySwitch'
import { SettingsSwitch } from '@/components/settings/SettingsFormControls'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  useCommunicationManagerRuntime,
  useCommunicationSettingsAction
} from './communication-manager-runtime'

export function CommunicationOverlayControl(): React.JSX.Element {
  const runtime = useCommunicationManagerRuntime()
  return (
    <div className="border-t border-border/60 px-3 py-2">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-xs font-medium">
            {translate('communicationRail.overlaySeparate', 'Separate overlay')}
          </div>
          <p className="text-xs text-muted-foreground">
            {translate(
              'communicationRail.overlaySeparateDescription',
              'Appears automatically when you join a call.'
            )}
          </p>
        </div>
        {runtime ? (
          <SettingsSwitch
            checked={runtime.overlayOpen}
            onChange={() => runtime.setOverlayOpen(!runtime.overlayOpen)}
            ariaLabel={translate('communicationRail.overlaySeparate', 'Separate overlay')}
          />
        ) : (
          <DiscordVoiceOverlaySwitch />
        )}
      </div>
    </div>
  )
}

export function getCommunicationSettingsTarget(provider: CommunicationProviderId) {
  return {
    pane: 'integrations' as const,
    repoId: null,
    sectionId: COMMUNICATION_INTEGRATION_SECTION_IDS[provider]
  }
}

function openCommunicationSettings(provider: CommunicationProviderId): void {
  const store = useAppStore.getState()
  store.openSettingsTarget(getCommunicationSettingsTarget(provider))
  store.openSettingsPage()
}

export function useOpenCommunicationSettings(): (provider: CommunicationProviderId) => void {
  return useCommunicationSettingsAction(openCommunicationSettings)
}
