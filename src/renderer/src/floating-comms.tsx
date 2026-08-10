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
  FloatingCommsSessionState,
  FloatingCommsSurfaceIdentity,
  FloatingCommsSurfacePresentation
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
  return (
    left?.appId === right.appId &&
    left.requestId === right.requestId &&
    left.surfaceId === right.surfaceId &&
    left.mode === right.mode
  )
}

function surfaceIdentityOf(identity: FloatingCommsSurfaceIdentity): FloatingCommsSurfaceIdentity {
  const { appId, requestId, surfaceId, mode } = identity
  return { appId, requestId, surfaceId, mode }
}

function discordIdentityOf(
  identity: FloatingCommsSurfaceIdentity
): Omit<FloatingCommsSurfaceIdentity, 'appId'> & { appId: 'discord' } {
  const { requestId, surfaceId, mode } = identity
  return { appId: 'discord', requestId, surfaceId, mode }
}

function toDiscordCommand(
  method: string,
  identity: Omit<FloatingCommsSurfaceIdentity, 'appId'> & { appId: 'discord' },
  params?: unknown
): FloatingCommsDiscordCommand | null {
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
  const [state, setState] = useState<FloatingCommsSurfacePresentation | null>(null)
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const latestSessionRef = useRef<FloatingCommsSessionState | null>(null)
  const refreshSequenceRef = useRef(0)
  const latestIdentityRef = useRef<FloatingCommsSurfaceIdentity | null>(null)
  const mountedRef = useRef(false)
  const refresh = useCallback(
    async (
      expectedIdentity?: FloatingCommsSurfaceIdentity
    ): Promise<FloatingCommsSurfacePresentation | null> => {
      const sequence = ++refreshSequenceRef.current
      if (expectedIdentity) {
        latestIdentityRef.current = expectedIdentity
      }
      const next = await window.api.floatingComms.getState()
      if (
        mountedRef.current &&
        refreshSequenceRef.current === sequence &&
        (!expectedIdentity || (next && sameSurfaceIdentity(next, expectedIdentity)))
      ) {
        latestIdentityRef.current = next
        latestSessionRef.current = next?.sessionState ?? null
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
    const off = window.api.floatingComms.onSurfaceChanged((event) => {
      if (disposed) {
        return
      }
      const current = latestIdentityRef.current
      if (
        event.current &&
        event.current.appId === event.appId &&
        ((!current && !event.previous) ||
          (current?.appId === event.appId &&
            event.previous &&
            sameSurfaceIdentity(current, event.previous)))
      ) {
        run(event.current)
      } else if (
        !event.current &&
        current &&
        event.previous &&
        sameSurfaceIdentity(current, event.previous)
      ) {
        refreshSequenceRef.current += 1
        latestIdentityRef.current = null
        latestSessionRef.current = null
        setState(null)
      }
    })
    const offStateChanged = window.api.floatingComms.onStateChanged((identity) => {
      const current = latestIdentityRef.current
      if (!disposed && current && sameSurfaceIdentity(current, identity)) {
        run(identity)
      }
    })
    const offVisibilityChanged = window.api.floatingComms.onVisibilityChanged((visibility) => {
      if (disposed || !sameSurfaceIdentity(latestIdentityRef.current, visibility)) {
        return
      }
      setState((current) =>
        current && sameSurfaceIdentity(current, visibility)
          ? { ...current, visible: visibility.visible }
          : current
      )
    })
    run()
    return () => {
      disposed = true
      mountedRef.current = false
      refreshSequenceRef.current += 1
      latestIdentityRef.current = null
      latestSessionRef.current = null
      off()
      offStateChanged()
      offVisibilityChanged()
    }
  }, [refresh])
  const surfaceIdentity = state ? surfaceIdentityOf(state) : null
  useLayoutEffect(() => {
    const element = surfaceRef.current
    if (!element || !surfaceIdentity || surfaceIdentity.mode === 'detached') {
      return
    }
    const measure = (): void => {
      const height = clampFloatingCommsSurfaceHeight(element.getBoundingClientRect().height)
      void window.api.floatingComms
        .measure({ ...surfaceIdentity, height })
        .catch((error: unknown) => reportSurfaceError('measure', error))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [surfaceIdentity])
  const discordIdentity = state?.appId === 'discord' ? state : null
  const runtime = useMemo<CommunicationManagerRuntime>(
    () => ({
      commandDiscord: async (method: string, params?: unknown) => {
        if (!discordIdentity) {
          throw new Error('floating_comms_discord_surface_inactive')
        }
        const identity = discordIdentityOf(discordIdentity)
        const command = toDiscordCommand(method, identity, params)
        if (!command) {
          const next = await refresh(identity)
          if (!next) {
            throw new Error('floating_comms_discord_surface_inactive')
          }
          return next.discord
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
        if (!state) {
          return
        }
        void window.api.floatingComms
          .action({
            type: 'open-settings',
            provider,
            ...surfaceIdentityOf(state)
          })
          .catch((error: unknown) => reportSurfaceError('open settings', error))
      },
      overlayOpen: state?.overlayOpen ?? false,
      setOverlayOpen: (open: boolean) => {
        if (!discordIdentity) {
          return
        }
        const identity = discordIdentityOf(discordIdentity)
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
    [discordIdentity, refresh, state]
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
        <Manager
          isPopoverOpen={state.visible}
          initialSessionState={state.sessionState}
          onSessionStateChange={(sessionState) => {
            latestSessionRef.current = sessionState
          }}
        >
          {(presentation) => (
            <div
              ref={surfaceRef}
              className="scrollbar-sleek max-h-[420px] overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
            >
              <CommunicationManagerSurfaceContent
                app={app}
                content={presentation.content}
                detached={state.mode === 'detached'}
                onOpenApp={() => {
                  void window.api.floatingComms
                    .action({ type: 'open-app', ...surfaceIdentityOf(state) })
                    .catch((error: unknown) => reportSurfaceError('open app', error))
                }}
                onToggleDetached={() => {
                  const sessionState = latestSessionRef.current ?? presentation.sessionState
                  const operation =
                    state.mode === 'detached'
                      ? window.api.floatingComms.minimizeDetached
                      : window.api.floatingComms.detach
                  void operation({ ...surfaceIdentityOf(state), sessionState }).catch(
                    (error: unknown) =>
                      reportSurfaceError(
                        state.mode === 'detached' ? 'return to panel' : 'detach',
                        error
                      )
                  )
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
