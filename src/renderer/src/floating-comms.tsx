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
import { FLOATING_COMMS_SURFACE_DEFAULT_HEIGHT } from '../../shared/floating-comms-surface'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { TooltipProvider } from './components/ui/tooltip'
import { FloatingCommsEntry } from './components/communications-dock/FloatingCommsEntry'
import {
  CommunicationManagerRuntimeProvider,
  type CommunicationManagerRuntime
} from './components/floating-terminal/comms-rail/communication-managers'
import { FloatingCommsSurfaceShell } from './floating-comms-surface-shell'
import {
  initializeNativeDocumentTheme,
  subscribeNativeDocumentTheme
} from './lib/native-document-theme'
import { applyDocumentInterfaceTheme } from './lib/document-theme'
import { isReopenedAttachedSurface } from './lib/floating-comms-surface-identity'
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
  applyDocumentInterfaceTheme(settings?.interfaceTheme, settings?.appFontFamily)
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
    return subscribeNativeDocumentTheme(settings?.theme ?? 'system', {
      disableTransitions: false,
      reportError: (error) => reportSurfaceError('native theme', error)
    })
  }, [settings])
  return null
}

function FloatingCommsRoot(): React.JSX.Element {
  const [state, setState] = useState<FloatingCommsSurfacePresentation | null>(null)
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
      if (
        !disposed &&
        (!current ||
          sameSurfaceIdentity(current, identity) ||
          isReopenedAttachedSurface(current, identity))
      ) {
        run(identity)
      }
    })
    const offVisibilityChanged = window.api.floatingComms.onVisibilityChanged((visibility) => {
      if (disposed || !sameSurfaceIdentity(latestIdentityRef.current, visibility)) {
        return
      }
      if (!visibility.visible && latestIdentityRef.current?.mode === 'attached-native') {
        refreshSequenceRef.current += 1
        latestIdentityRef.current = null
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
      off()
      offStateChanged()
      offVisibilityChanged()
    }
  }, [refresh])
  const surfaceIdentity = state ? surfaceIdentityOf(state) : null
  useLayoutEffect(() => {
    if (!surfaceIdentity || !state) {
      return
    }
    void window.api.floatingComms
      .measure({
        ...surfaceIdentity,
        height: state.height ?? FLOATING_COMMS_SURFACE_DEFAULT_HEIGHT
      })
      .catch((error: unknown) => reportSurfaceError('measure', error))
  }, [state, surfaceIdentity])
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
      }
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
  return (
    <CommunicationManagerRuntimeProvider runtime={runtime}>
      <FloatingCommsSurfaceShell
        app={app}
        latestSessionRef={latestSessionRef}
        reportError={reportSurfaceError}
        state={state}
        surfaceIdentityOf={surfaceIdentityOf}
      />
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
void initializeNativeDocumentTheme(startupSettings?.theme ?? 'system', {
  disableTransitions: false,
  reportError: (error) => reportSurfaceError('initialize native theme', error)
}).then(() =>
  createRoot(root).render(
    <StrictMode>
      <I18nProvider>
        <TooltipProvider>
          <FloatingCommsAppearanceSync />
          <FloatingCommsEntry reportError={reportSurfaceError} surface={<FloatingCommsRoot />} />
        </TooltipProvider>
      </I18nProvider>
    </StrictMode>
  )
)
