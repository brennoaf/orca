import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject
} from 'react'
import type { FloatingCommsSurfaceIdentity } from '../../../../../shared/floating-comms-surface'
import type {
  FloatingWorkspaceApp,
  FloatingWorkspaceAppId
} from '../../../../../shared/floating-workspace-apps'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FLOATING_WORKSPACE_APP_ICONS } from '@/lib/floating-workspace-app-icons'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { CommunicationManagerSurfaceContent } from './CommunicationManagerSurfaceContent'
import {
  getCommunicationSettingsTarget,
  listEnabledCommunicationManagers,
  type CommunicationManager
} from './communication-managers'
import {
  createFloatingCommsOpenRequest,
  useFloatingCommsGeometry
} from './use-floating-comms-geometry'

type FloatingCommsRailProps = {
  panelRef: RefObject<HTMLDivElement | null>
  workspaceBounds: { left: number; top: number; width: number; height: number }
  openAppId: FloatingWorkspaceAppId | null
  onOpenAppIdChange: (appId: FloatingWorkspaceAppId | null) => void
  onOpenApp: (app: FloatingWorkspaceApp) => void
}

function reportFloatingCommsError(operation: string, error: unknown): void {
  console.error(`[floating-comms] ${operation} failed:`, error)
}

function RailItem({
  app,
  manager,
  selected,
  domFallback,
  onSelect,
  onOpenApp,
  buttonRef,
  portalContainer
}: {
  app: FloatingWorkspaceApp
  manager: CommunicationManager
  selected: boolean
  domFallback: boolean
  onSelect: () => void
  onOpenApp: () => void
  buttonRef: (element: HTMLButtonElement | null) => void
  portalContainer: HTMLDivElement | null
}): React.JSX.Element {
  const Icon = FLOATING_WORKSPACE_APP_ICONS[app.id]
  return (
    <manager.Presentation isPopoverOpen={selected}>
      {(presentation) => {
        const button = (
          <button
            ref={buttonRef}
            type="button"
            className={cn(
              'relative flex size-10 items-center justify-center outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
              presentation.status.kind === 'unavailable'
                ? 'text-muted-foreground/40'
                : 'text-muted-foreground hover:text-foreground'
            )}
            aria-label={presentation.tooltip}
            onClick={onSelect}
          >
            <Icon size={18} />
            {presentation.status.kind === 'active' ? (
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-status-success" />
            ) : null}
            {selected ? (
              <span className="absolute right-0 top-[25%] bottom-[25%] w-[2px] rounded-l bg-foreground" />
            ) : null}
          </button>
        )
        return (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                {selected && domFallback ? <PopoverAnchor asChild>{button}</PopoverAnchor> : button}
              </TooltipTrigger>
              <TooltipContent side="left">{presentation.tooltip}</TooltipContent>
            </Tooltip>
            {selected && domFallback ? (
              <PopoverContent
                portalContainer={portalContainer}
                collisionBoundary={portalContainer}
                side="left"
                align="start"
                sideOffset={8}
                collisionPadding={8}
                className="popover-scroll-content scrollbar-sleek max-h-[min(420px,var(--radix-popover-content-available-height))] w-80 overflow-y-auto p-0"
              >
                <CommunicationManagerSurfaceContent
                  app={app}
                  content={presentation.content}
                  onOpenApp={onOpenApp}
                />
              </PopoverContent>
            ) : null}
          </>
        )
      }}
    </manager.Presentation>
  )
}

export function FloatingCommsRail({
  panelRef,
  workspaceBounds,
  openAppId,
  onOpenAppIdChange,
  onOpenApp
}: FloatingCommsRailProps): React.JSX.Element | null {
  const preferences = useAppStore((state) => state.floatingWorkspaceApps)
  const entries = useMemo(() => listEnabledCommunicationManagers(preferences), [preferences])
  const [domFallback, setDomFallback] = useState(false)
  const buttonRefs = useRef(new Map<FloatingWorkspaceAppId, HTMLButtonElement>())
  const openAppIdRef = useRef(openAppId)
  const requestSequenceRef = useRef(0)
  const entriesRef = useRef(entries)
  const onOpenAppRef = useRef(onOpenApp)
  entriesRef.current = entries
  onOpenAppRef.current = onOpenApp
  openAppIdRef.current = openAppId
  const releaseLocal = useCallback(
    (identity?: FloatingCommsSurfaceIdentity) => {
      if (
        identity &&
        (openAppIdRef.current !== identity.appId ||
          requestSequenceRef.current !== identity.requestId)
      ) {
        return
      }
      requestSequenceRef.current += 1
      openAppIdRef.current = null
      setDomFallback(false)
      onOpenAppIdChange(null)
    },
    [onOpenAppIdChange]
  )
  const close = useCallback(() => {
    const appId = openAppIdRef.current
    const requestId = requestSequenceRef.current
    releaseLocal()
    const surface = window.api.floatingComms
    if (surface && appId) {
      void surface
        .close({ requestId })
        .catch((error: unknown) => reportFloatingCommsError('close', error))
    }
  }, [releaseLocal])

  useLayoutEffect(() => {
    if (openAppId !== null && !entries.some(({ app }) => app.id === openAppId)) {
      close()
    }
  }, [close, entries, openAppId])

  useEffect(() => {
    const surface = window.api.floatingComms
    return surface ? surface.onClosed(releaseLocal) : undefined
  }, [releaseLocal])

  useFloatingCommsGeometry({
    panelRef,
    buttonRefs,
    openAppIdRef,
    requestSequenceRef,
    close,
    setDomFallback
  })

  useEffect(() => {
    const surface = window.api.floatingComms
    return surface
      ? surface.onFallback((identity) => {
          if (
            openAppIdRef.current === identity.appId &&
            requestSequenceRef.current === identity.requestId
          ) {
            setDomFallback(true)
          }
        })
      : undefined
  }, [])

  useEffect(() => {
    const surface = window.api.floatingComms
    return surface?.onAction((action) => {
      if (
        openAppIdRef.current !== action.appId ||
        requestSequenceRef.current !== action.requestId
      ) {
        return
      }
      if (action.type === 'open-app') {
        const app = entriesRef.current.find((entry) => entry.app.id === action.appId)?.app
        if (app) {
          onOpenAppRef.current(app)
        }
      } else {
        const store = useAppStore.getState()
        store.openSettingsTarget(getCommunicationSettingsTarget(action.provider))
        store.openSettingsPage()
      }
      releaseLocal(action)
    })
  }, [releaseLocal])

  useLayoutEffect(() => {
    if (!openAppId || domFallback) {
      return
    }
    const button = buttonRefs.current.get(openAppId)
    const workspaceElement = panelRef.current
    if (!button || !workspaceElement) {
      return
    }
    const update = (): void => {
      const surface = window.api.floatingComms
      if (!surface) {
        setDomFallback(true)
        return
      }
      const sequence = requestSequenceRef.current
      void surface
        .update({
          ...createFloatingCommsOpenRequest(openAppId, button, workspaceElement, sequence),
          geometryRequestId: null
        })
        .then((result) => {
          if (
            result?.mode === 'dom' &&
            requestSequenceRef.current === sequence &&
            openAppIdRef.current === openAppId
          ) {
            setDomFallback(true)
          }
        })
        .catch((error: unknown) => {
          reportFloatingCommsError('update', error)
          if (requestSequenceRef.current === sequence && openAppIdRef.current === openAppId) {
            close()
          }
        })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(button)
    observer.observe(workspaceElement)
    let resizeFrame: number | null = null
    const scheduleUpdate = (): void => {
      if (resizeFrame !== null) {
        cancelAnimationFrame(resizeFrame)
      }
      resizeFrame = requestAnimationFrame(update)
    }
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('scroll', update, true)
    return () => {
      observer.disconnect()
      if (resizeFrame !== null) {
        cancelAnimationFrame(resizeFrame)
      }
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('scroll', update, true)
    }
  }, [close, domFallback, openAppId, panelRef, workspaceBounds])

  if (entries.length === 0) {
    return null
  }

  return (
    <Popover
      modal={false}
      open={openAppId !== null && domFallback}
      onOpenChange={(open) => {
        if (!open) {
          close()
        }
      }}
    >
      <div className="flex w-10 shrink-0 flex-col border-r bg-background/95">
        {entries.map(({ app, manager }) => (
          <RailItem
            key={app.id}
            app={app}
            manager={manager}
            selected={openAppId === app.id}
            domFallback={domFallback}
            portalContainer={panelRef.current}
            buttonRef={(element) => {
              if (element) {
                buttonRefs.current.set(app.id, element)
              } else {
                buttonRefs.current.delete(app.id)
              }
            }}
            onSelect={() => {
              if (openAppId === app.id) {
                close()
                return
              }
              const button = buttonRefs.current.get(app.id)
              const workspaceElement = panelRef.current
              if (!button || !workspaceElement) {
                return
              }
              const sequence = requestSequenceRef.current + 1
              requestSequenceRef.current = sequence
              openAppIdRef.current = app.id
              onOpenAppIdChange(app.id)
              const surface = window.api.floatingComms
              if (!surface) {
                setDomFallback(true)
                return
              }
              void surface
                .open(createFloatingCommsOpenRequest(app.id, button, workspaceElement, sequence))
                .then((result) => {
                  if (requestSequenceRef.current === sequence && openAppIdRef.current === app.id) {
                    setDomFallback(result.mode === 'dom')
                  }
                })
                .catch((error: unknown) => {
                  reportFloatingCommsError('open', error)
                  if (requestSequenceRef.current === sequence && openAppIdRef.current === app.id) {
                    close()
                  }
                })
            }}
            onOpenApp={() => {
              close()
              onOpenApp(app)
            }}
          />
        ))}
      </div>
    </Popover>
  )
}
