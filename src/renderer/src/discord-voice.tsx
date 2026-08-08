import './assets/main.css'

import { StrictMode, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { DiscordVoiceOverlayRoot } from './components/discord-voice/DiscordVoiceOverlayRoot'
import { RecoverableRenderErrorBoundary } from './components/error-boundaries/RecoverableRenderErrorBoundary'
import {
  installRendererCrashDiagnostics,
  recordRendererCrashBreadcrumb
} from './lib/crash-diagnostics'
import { applyDocumentTheme } from './lib/document-theme'
import { buildAppFontFamily } from './lib/app-font-family'
import { I18nProvider } from './i18n/I18nProvider'
import { translate } from './i18n/i18n'
import { useAppStore } from './store'
import type { GlobalSettings } from '../../shared/types'
import { getOrCreateRendererRoot } from './lib/react-renderer-root'

recordRendererCrashBreadcrumb('discord_voice_bootstrap_started', { dev: import.meta.env.DEV })
installRendererCrashDiagnostics('discord-voice')

function applyOverlayAppearance(settings: GlobalSettings | null): void {
  applyDocumentTheme(settings?.theme ?? 'system', { disableTransitions: false })
  document.documentElement.style.setProperty(
    '--app-font-family',
    buildAppFontFamily(settings?.appFontFamily)
  )
}

let startupSettings: GlobalSettings | null = null
try {
  startupSettings = window.api.settings.getSync()
} catch {}
if (startupSettings) {
  useAppStore.setState({ settings: startupSettings })
}
applyOverlayAppearance(startupSettings)

const rootElement = document.getElementById('root')
if (!rootElement) {
  recordRendererCrashBreadcrumb('discord_voice_root_missing')
  throw new Error('Discord call overlay root element not found.')
}

function OverlaySettingsSync(): null {
  const settings = useAppStore((state) => state.settings)

  useEffect(() => {
    let disposed = false
    const setSettings = (next: GlobalSettings): void => {
      if (!disposed) {
        useAppStore.setState({ settings: next })
      }
    }
    const offChanged = window.api.settings.onChanged((updates) => {
      const current = useAppStore.getState().settings
      if (current) {
        setSettings({ ...current, ...updates })
      }
    })
    void window.api.settings
      .get()
      .then(setSettings)
      .catch(() => undefined)
    return () => {
      disposed = true
      offChanged()
    }
  }, [])

  useEffect(() => {
    applyOverlayAppearance(settings)
    if (settings?.theme !== 'system') {
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (): void => applyDocumentTheme('system')
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [settings])

  return null
}

function OverlayRoot(): React.JSX.Element {
  useTranslation()
  return (
    <RecoverableRenderErrorBoundary
      boundaryId="discord-voice.root"
      surface="overlay"
      title={translate('discordVoice.recoverableError.title', 'The call overlay hit an error.')}
      description={translate(
        'discordVoice.recoverableError.description',
        'The overlay could not finish rendering. Retry to remount it, or reopen it.'
      )}
    >
      <DiscordVoiceOverlayRoot />
    </RecoverableRenderErrorBoundary>
  )
}

getOrCreateRendererRoot(rootElement, import.meta.hot?.data).render(
  <StrictMode>
    <I18nProvider>
      <OverlaySettingsSync />
      <OverlayRoot />
    </I18nProvider>
  </StrictMode>
)
recordRendererCrashBreadcrumb('discord_voice_bootstrap_rendered')
