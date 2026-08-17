import './assets/main.css'

import { StrictMode } from 'react'
import { useTranslation } from 'react-i18next'
import type { InterfaceTheme } from '../../shared/interface-theme'
import type { GlobalSettings } from '../../shared/global-settings-types'
import App from './App'
import { RecoverableRenderErrorBoundary } from './components/error-boundaries/RecoverableRenderErrorBoundary'
import {
  installRendererCrashDiagnostics,
  recordRendererCrashBreadcrumb
} from './lib/crash-diagnostics'
import { initializeNativeDocumentTheme } from './lib/native-document-theme'
import { applyDocumentInterfaceTheme } from './lib/document-theme'
import { normalizeInterfaceTheme } from '../../shared/interface-theme'
import { installTypingLatencyDiagnostic } from './lib/typing-latency-diagnostic'
import { shouldEnableReactGrab } from './lib/react-grab-dev-gate'
import { I18nProvider } from './i18n/I18nProvider'
import { translate } from './i18n/i18n'
import { getOrCreateRendererRoot } from './lib/react-renderer-root'
import { SkillWarningPreviewLauncher } from './components/skills/SkillWarningPreviewLauncher'

recordRendererCrashBreadcrumb('renderer_bootstrap_started', { dev: import.meta.env.DEV })
installRendererCrashDiagnostics()
installTypingLatencyDiagnostic()

if (
  import.meta.env.DEV &&
  shouldEnableReactGrab({
    dev: import.meta.env.DEV,
    enableFlag: import.meta.env.VITE_ENABLE_REACT_GRAB
  })
) {
  void import('react-grab').then(({ init }) => init())
  void import('react-grab/styles.css')
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  recordRendererCrashBreadcrumb('renderer_root_missing')
  throw new Error('Renderer root element not found.')
}

function RendererRoot(): React.JSX.Element {
  useTranslation()
  return (
    <RecoverableRenderErrorBoundary
      boundaryId="app.root"
      surface="app-root"
      title={translate('app.recoverableError.rootTitle', 'Orca hit a renderer error.')}
      description={translate(
        'app.recoverableError.rootDescription',
        'The app shell could not finish rendering. Retry to remount it, or relaunch Orca if the error persists.'
      )}
    >
      <App />
      <SkillWarningPreviewLauncher />
    </RecoverableRenderErrorBoundary>
  )
}

let startupTheme: 'system' | 'light' | 'dark' = 'system'
let startupInterfaceTheme: InterfaceTheme | undefined
let startupAppFontFamily: GlobalSettings['appFontFamily'] | undefined = undefined
try {
  const startupSettings = window.api.settings.getSync()
  startupTheme = startupSettings?.theme ?? 'system'
  startupInterfaceTheme = normalizeInterfaceTheme(startupSettings?.interfaceTheme)
  startupAppFontFamily = startupSettings?.appFontFamily
} catch (error) {
  console.error('[appearance] startup settings unavailable:', error)
}
applyDocumentInterfaceTheme(startupInterfaceTheme, startupAppFontFamily)
void initializeNativeDocumentTheme(startupTheme, { disableTransitions: false }).then(() => {
  getOrCreateRendererRoot(rootElement, import.meta.hot?.data).render(
    <StrictMode>
      <I18nProvider>
        <RendererRoot />
      </I18nProvider>
    </StrictMode>
  )
  recordRendererCrashBreadcrumb('renderer_bootstrap_rendered')
})
