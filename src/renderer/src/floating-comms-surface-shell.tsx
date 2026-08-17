import { useRef, useState, type MutableRefObject } from 'react'
import type { FloatingWorkspaceApp } from '../../shared/floating-workspace-apps'
import {
  clampFloatingCommsSurfaceHeight,
  FLOATING_COMMS_SURFACE_DEFAULT_HEIGHT
} from '../../shared/floating-comms-surface'
import type {
  FloatingCommsSessionState,
  FloatingCommsSurfaceIdentity,
  FloatingCommsSurfacePresentation
} from '../../shared/floating-comms-surface'
import { CommunicationManagerSurfaceContent } from './components/floating-terminal/comms-rail/CommunicationManagerSurfaceContent'
import { COMMUNICATION_MANAGER_REGISTRY } from './components/floating-terminal/comms-rail/communication-managers'
import { translate } from './i18n/i18n'

type FloatingCommsSurfaceShellProps = {
  app: FloatingWorkspaceApp
  latestSessionRef: MutableRefObject<FloatingCommsSessionState | null>
  reportError: (operation: string, error: unknown) => void
  state: FloatingCommsSurfacePresentation
  surfaceIdentityOf: (identity: FloatingCommsSurfaceIdentity) => FloatingCommsSurfaceIdentity
}

export function FloatingCommsSurfaceShell({
  app,
  latestSessionRef,
  reportError,
  state,
  surfaceIdentityOf
}: FloatingCommsSurfaceShellProps): React.JSX.Element {
  const dragHeightRef = useRef<number | null>(null)
  const dragStartRef = useRef<{ height: number; pointerId: number; y: number } | null>(null)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const Manager = COMMUNICATION_MANAGER_REGISTRY[state.appId].Presentation
  const height = dragHeight ?? state.height ?? FLOATING_COMMS_SURFACE_DEFAULT_HEIGHT
  const whatsappHost =
    state.appId === 'whatsapp-web' && state.mode === 'attached-native'
      ? {
          identity: {
            target: 'attached' as const,
            appId: 'whatsapp-web' as const,
            requestId: state.requestId,
            surfaceId: state.surfaceId,
            mode: state.mode
          },
          visible: state.visible
        }
      : undefined
  const slackHost =
    state.appId === 'slack' && state.mode === 'attached-native'
      ? {
          identity: {
            target: 'attached' as const,
            appId: 'slack' as const,
            requestId: state.requestId,
            surfaceId: state.surfaceId,
            mode: state.mode
          },
          visible: state.visible
        }
      : undefined
  const discordWebHost =
    state.appId === 'discord' && (state.mode === 'attached-native' || state.mode === 'attached-dom')
      ? {
          identity: {
            target: 'attached' as const,
            appId: 'discord' as const,
            requestId: state.requestId,
            surfaceId: state.surfaceId,
            mode: state.mode
          },
          visible: state.visible
        }
      : undefined
  return (
    <Manager
      isPopoverOpen={state.visible}
      initialSessionState={state.sessionState}
      whatsappHost={whatsappHost}
      slackHost={slackHost}
      discordWebHost={discordWebHost}
      onSessionStateChange={(sessionState) => {
        latestSessionRef.current = sessionState
      }}
    >
      {(presentation) => (
        <div
          style={{ height: presentation.minimal ? Math.max(height, 320) : height }}
          className="relative flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
        >
          <CommunicationManagerSurfaceContent
            app={app}
            content={presentation.content}
            minimal={presentation.minimal}
            onOpenApp={() => {
              const identity = surfaceIdentityOf(state)
              const hide = whatsappHost
                ? window.api.whatsappFastResponse.hide(whatsappHost.identity)
                : slackHost
                  ? window.api.slackFastResponse.hide(slackHost.identity)
                  : discordWebHost && window.api.discordWebFastResponse
                    ? window.api.discordWebFastResponse.hide(discordWebHost.identity)
                    : Promise.resolve()
              void hide
                .then(() => window.api.floatingComms.action({ type: 'open-app', ...identity }))
                .catch((error: unknown) => reportError('open app', error))
            }}
            onToggleDetached={() => {
              const sessionState = latestSessionRef.current ?? presentation.sessionState
              void (async () => {
                if (whatsappHost) {
                  await window.api.whatsappFastResponse.hide(whatsappHost.identity)
                }
                if (slackHost) {
                  await window.api.slackFastResponse.hide(slackHost.identity)
                }
                if (discordWebHost && window.api.discordWebFastResponse) {
                  await window.api.discordWebFastResponse.hide(discordWebHost.identity)
                }
                await window.api.floatingComms.detach({
                  ...surfaceIdentityOf(state),
                  sessionState
                })
              })().catch((error: unknown) => reportError('detach', error))
            }}
          />
          {state.appId === 'whatsapp-web' || state.appId === 'slack' ? (
            <div
              role="separator"
              aria-orientation="horizontal"
              aria-label={translate('communicationRail.resizeFastResponse', 'Resize fast response')}
              className="absolute inset-x-0 bottom-0 z-10 h-2 cursor-ns-resize touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onPointerDown={(event) => {
                const handle = event.currentTarget
                handle.setPointerCapture(event.pointerId)
                dragStartRef.current = { height, pointerId: event.pointerId, y: event.clientY }
              }}
              onPointerMove={(event) => {
                const start = dragStartRef.current
                if (!start || start.pointerId !== event.pointerId) {
                  return
                }
                const next = clampFloatingCommsSurfaceHeight(start.height + event.clientY - start.y)
                dragHeightRef.current = next
                setDragHeight(next)
              }}
              onPointerUp={(event) => {
                const start = dragStartRef.current
                if (!start || start.pointerId !== event.pointerId) {
                  return
                }
                const next = dragHeightRef.current
                dragStartRef.current = null
                dragHeightRef.current = null
                setDragHeight(null)
                if (next !== null) {
                  void window.api.floatingComms
                    .resize({ ...surfaceIdentityOf(state), height: next })
                    .catch((error: unknown) => reportError('resize', error))
                }
              }}
              onPointerCancel={() => {
                dragStartRef.current = null
                dragHeightRef.current = null
                setDragHeight(null)
              }}
            />
          ) : null}
        </div>
      )}
    </Manager>
  )
}
