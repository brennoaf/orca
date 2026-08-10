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
  FloatingCommsSurfaceIdentity,
  FloatingCommsSurfaceState
} from '../../shared/floating-comms-surface'
import { clampFloatingCommsSurfaceHeight } from '../../shared/floating-comms-surface'
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

function sameSurfaceIdentity(
  left: FloatingCommsSurfaceIdentity | null,
  right: FloatingCommsSurfaceIdentity
): boolean {
  return left?.appId === right.appId && left.requestId === right.requestId
}

function toDiscordCommand(
  method: string,
  requestId: number,
  params?: unknown
): FloatingCommsDiscordCommand | null {
  const identity = { appId: 'discord' as const, requestId }
  if (method === 'discordVoice.getState') {
    return null
  }
  if (method === 'discordVoice.setSelfMute') {
    return { ...identity, method: 'set-self-mute', muted: readBooleanParam(params, 'muted') }
  }
  if (method === 'discordVoice.setSelfDeaf') {
    return { ...identity, method: 'set-self-deaf', deafened: readBooleanParam(params, 'deafened') }
  }
  if (method === 'discordVoice.leaveCall') {
    return { ...identity, method: 'leave-call' }
  }
  if (method === 'discordVoice.reconnect') {
    return { ...identity, method: 'reconnect' }
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
  const refreshSequenceRef = useRef(0)
  const latestIdentityRef = useRef<FloatingCommsSurfaceIdentity | null>(null)
  const mountedRef = useRef(false)
  const refresh = useCallback(
    async (expectedIdentity?: FloatingCommsSurfaceIdentity): Promise<FloatingCommsSurfaceState> => {
      const sequence = ++refreshSequenceRef.current
      if (expectedIdentity) {
        latestIdentityRef.current = expectedIdentity
      }
      const next = await window.api.floatingComms.getState()
      if (
        mountedRef.current &&
        refreshSequenceRef.current === sequence &&
        (!expectedIdentity || sameSurfaceIdentity(next, expectedIdentity))
      ) {
        latestIdentityRef.current = next
        setState(next)
      }
      return next
    },
    []
  )
  useEffect(() => {
    let disposed = false
    mountedRef.current = true
    const run = (identity?: FloatingCommsSurfaceIdentity): void => {
      void refresh(identity).catch((error: unknown) => reportSurfaceError('refresh', error))
    }
    const off = window.api.floatingComms.onStateChanged((identity) => {
      if (!disposed) {
        run(identity)
      }
    })
    const offVisibilityChanged = window.api.floatingComms.onVisibilityChanged((visibility) => {
      if (!disposed) {
        if (
          !visibility.visible &&
          (!latestIdentityRef.current || sameSurfaceIdentity(latestIdentityRef.current, visibility))
        ) {
          refreshSequenceRef.current += 1
          latestIdentityRef.current = null
        }
        setState((current) =>
          current &&
          current.appId === visibility.appId &&
          current.requestId === visibility.requestId
            ? { ...current, visible: visibility.visible }
            : current
        )
      }
    })
    run()
    return () => {
      disposed = true
      mountedRef.current = false
      refreshSequenceRef.current += 1
      latestIdentityRef.current = null
      off()
      offVisibilityChanged()
    }
  }, [refresh])
  const surfaceRequestId = state?.requestId
  useLayoutEffect(() => {
    const element = surfaceRef.current
    if (!element || surfaceRequestId === undefined) {
      return
    }
    const measure = (): void => {
      const height = clampFloatingCommsSurfaceHeight(element.getBoundingClientRect().height)
      void window.api.floatingComms
        .measure({ requestId: surfaceRequestId, height })
        .catch((error: unknown) => reportSurfaceError('measure', error))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [surfaceRequestId])
  const discordRequestId = state?.appId === 'discord' ? state.requestId : null
  const runtime = useMemo<CommunicationManagerRuntime>(
    () => ({
      commandDiscord: async (method: string, params?: unknown) => {
        if (discordRequestId === null) {
          throw new Error('floating_comms_discord_surface_inactive')
        }
        const command = toDiscordCommand(method, discordRequestId, params)
        const identity = { appId: 'discord' as const, requestId: discordRequestId }
        if (!command) {
          return (await refresh(identity)).discord
        }
        const discord = await window.api.floatingComms.discordCommand(command)
        if (sameSurfaceIdentity(latestIdentityRef.current, identity)) {
          setState((current) =>
            current && sameSurfaceIdentity(current, identity) ? { ...current, discord } : current
          )
        }
        return discord
      },
      loadIntegrationStatuses: () => window.api.floatingComms.getIntegrationStatuses(),
      openSettings: (provider: CommunicationProviderId) => {
        if (!state?.appId || state.requestId === undefined) {
          return
        }
        void window.api.floatingComms
          .action({
            type: 'open-settings',
            provider,
            appId: state.appId,
            requestId: state.requestId
          })
          .catch((error: unknown) => reportSurfaceError('open settings', error))
      },
      overlayOpen: state?.overlayOpen ?? false,
      setOverlayOpen: (open: boolean) => {
        if (discordRequestId === null) {
          return
        }
        const identity = { appId: 'discord' as const, requestId: discordRequestId }
        void window.api.floatingComms
          .discordCommand({ ...identity, method: 'set-overlay-open', open })
          .then(async () => {
            if (sameSurfaceIdentity(latestIdentityRef.current, identity)) {
              await refresh(identity)
            }
          })
          .catch((error: unknown) => reportSurfaceError('set overlay state', error))
      },
      zApi: LOCAL_Z_API_COMMUNICATION_MANAGER_CLIENT
    }),
    [discordRequestId, refresh, state?.appId, state?.overlayOpen, state?.requestId]
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
                    .action({ type: 'open-app', appId: state.appId, requestId: state.requestId })
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
