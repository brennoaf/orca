import './assets/main.css'

import {
  StrictMode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { createRoot } from 'react-dom/client'
import type { CommunicationProviderId } from '../../shared/communication-integrations'
import { FLOATING_WORKSPACE_APPS } from '../../shared/floating-workspace-apps'
import type {
  FloatingCommsDiscordCommand,
  FloatingCommsSurfaceState
} from '../../shared/floating-comms-surface'
import type { GlobalSettings } from '../../shared/types'
import { TooltipProvider } from './components/ui/tooltip'
import { CommunicationManagerSurfaceContent } from './components/floating-terminal/comms-rail/CommunicationManagerSurfaceContent'
import {
  COMMUNICATION_MANAGER_REGISTRY,
  CommunicationManagerRuntimeProvider,
  LOCAL_Z_API_COMMUNICATION_MANAGER_CLIENT,
  type CommunicationManagerRuntime
} from './components/floating-terminal/comms-rail/communication-managers'
import { applyDocumentTheme } from './lib/document-theme'
import { buildAppFontFamily } from './lib/app-font-family'
import { I18nProvider } from './i18n/I18nProvider'

let startupSettings: GlobalSettings | null = null

function reportSurfaceError(operation: string, error: unknown): void {
  console.error(`[floating-comms] ${operation} failed:`, error)
}

function readBooleanParam(params: unknown, key: 'muted' | 'deafened'): boolean {
  if (params && typeof params === 'object' && key in params) {
    const value = params[key]
    if (typeof value === 'boolean') {
      return value
    }
  }
  throw new Error(`floating_comms_invalid_${key}`)
}

function toDiscordCommand(method: string, params?: unknown): FloatingCommsDiscordCommand | null {
  if (method === 'discordVoice.getState') {
    return null
  }
  if (method === 'discordVoice.setSelfMute') {
    return { method: 'set-self-mute', muted: readBooleanParam(params, 'muted') }
  }
  if (method === 'discordVoice.setSelfDeaf') {
    return { method: 'set-self-deaf', deafened: readBooleanParam(params, 'deafened') }
  }
  if (method === 'discordVoice.leaveCall') {
    return { method: 'leave-call' }
  }
  if (method === 'discordVoice.reconnect') {
    return { method: 'reconnect' }
  }
  throw new Error(`floating_comms_unknown_discord_command:${method}`)
}

function applyFloatingCommsAppearance(settings: GlobalSettings | null): void {
  applyDocumentTheme(settings?.theme ?? 'system', { disableTransitions: false })
  document.documentElement.style.setProperty(
    '--app-font-family',
    buildAppFontFamily(settings?.appFontFamily)
  )
}

function FloatingCommsAppearanceSync(): null {
  const [settings, setSettings] = useState(startupSettings)
  useEffect(() => {
    let disposed = false
    const applySettings = (next: GlobalSettings): void => {
      if (!disposed) {
        setSettings(next)
      }
    }
    const offChanged = window.api.settings.onChanged((updates) => {
      setSettings((current) => (current ? { ...current, ...updates } : current))
    })
    void window.api.settings
      .get()
      .then(applySettings)
      .catch((error: unknown) => reportSurfaceError('refresh settings', error))
    return () => {
      disposed = true
      offChanged()
    }
  }, [])
  useEffect(() => {
    applyFloatingCommsAppearance(settings)
    if (settings?.theme !== 'system') {
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const applySystemTheme = (): void => applyDocumentTheme('system')
    media.addEventListener('change', applySystemTheme)
    return () => media.removeEventListener('change', applySystemTheme)
  }, [settings])
  return null
}

function FloatingCommsRoot(): React.JSX.Element {
  const [state, setState] = useState<FloatingCommsSurfaceState | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const refresh = useCallback(async (): Promise<FloatingCommsSurfaceState> => {
    const next = await window.api.floatingComms.getState()
    setState(next)
    return next
  }, [])
  useEffect(() => {
    let disposed = false
    const run = (): void => {
      void refresh().catch((error: unknown) => reportSurfaceError('refresh', error))
    }
    run()
    const off = window.api.floatingComms.onStateChanged(() => {
      if (!disposed) {
        run()
      }
    })
    const offVisibilityChanged = window.api.floatingComms.onVisibilityChanged((visible) => {
      if (!disposed) {
        setState((current) => (current ? { ...current, visible } : current))
      }
    })
    return () => {
      disposed = true
      off()
      offVisibilityChanged()
    }
  }, [refresh])
  useLayoutEffect(() => {
    const element = surfaceRef.current
    if (!element) {
      return
    }
    const measure = (): void => {
      void window.api.floatingComms
        .measure(element.scrollHeight)
        .catch((error: unknown) => reportSurfaceError('measure', error))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [state])
  const runtime = useMemo<CommunicationManagerRuntime>(
    () => ({
      commandDiscord: async (method: string, params?: unknown) => {
        const command = toDiscordCommand(method, params)
        if (!command) {
          return (await refresh()).discord
        }
        const discord = await window.api.floatingComms.discordCommand(command)
        setState((current) => (current ? { ...current, discord } : current))
        return discord
      },
      loadIntegrationStatuses: async () => (await refresh()).integrations,
      openSettings: (provider: CommunicationProviderId) => {
        void window.api.floatingComms
          .action({ type: 'open-settings', provider })
          .catch((error: unknown) => reportSurfaceError('open settings', error))
      },
      overlayOpen: state?.overlayOpen ?? false,
      setOverlayOpen: (open: boolean) => {
        void window.api.floatingComms
          .discordCommand({ method: 'set-overlay-open', open })
          .then(() => refresh())
          .catch((error: unknown) => reportSurfaceError('set overlay state', error))
      },
      zApi: LOCAL_Z_API_COMMUNICATION_MANAGER_CLIENT
    }),
    [refresh, state?.overlayOpen]
  )
  if (!state) {
    return <div className="h-screen rounded-md border border-border bg-popover" />
  }
  const app = FLOATING_WORKSPACE_APPS.find((entry) => entry.id === state.appId)
  if (!app) {
    throw new Error('Floating communications app is invalid')
  }
  const Manager = COMMUNICATION_MANAGER_REGISTRY[state.appId].Presentation
  return (
    <CommunicationManagerRuntimeProvider runtime={runtime}>
      <TooltipProvider>
        <Manager isPopoverOpen={state.visible}>
          {(presentation) => (
            <div
              ref={surfaceRef}
              className="scrollbar-sleek max-h-[420px] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
            >
              <CommunicationManagerSurfaceContent
                app={app}
                content={presentation.content}
                onOpenApp={() => {
                  void window.api.floatingComms
                    .action({ type: 'open-app', appId: state.appId })
                    .catch((error: unknown) => reportSurfaceError('open app', error))
                }}
              />
            </div>
          )}
        </Manager>
      </TooltipProvider>
    </CommunicationManagerRuntimeProvider>
  )
}

try {
  startupSettings = window.api.settings.getSync()
} catch (error) {
  reportSurfaceError('read startup settings', error)
}
applyFloatingCommsAppearance(startupSettings)
document.documentElement.style.background = 'transparent'
document.body.style.background = 'transparent'
const root = document.getElementById('root')
if (!root) {
  throw new Error('Floating communications root not found')
}
createRoot(root).render(
  <StrictMode>
    <I18nProvider>
      <FloatingCommsAppearanceSync />
      <FloatingCommsRoot />
    </I18nProvider>
  </StrictMode>
)
