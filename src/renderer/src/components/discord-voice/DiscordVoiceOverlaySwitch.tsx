import { SettingsSwitch } from '../settings/SettingsFormControls'
import { useDiscordVoiceOverlayState } from './useDiscordVoiceOverlayState'
import { translate } from '@/i18n/i18n'

export function DiscordVoiceOverlaySwitch(): React.JSX.Element {
  const { open, toggle } = useDiscordVoiceOverlayState()

  return (
    <SettingsSwitch
      checked={open}
      onChange={toggle}
      ariaLabel={translate('communicationRail.overlaySeparate', 'Separate overlay')}
    />
  )
}
