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
import { Popover } from '@/components/ui/popover'
import { useAppStore } from '@/store'
import {
  createCommunicationManagerSessionState,
  listEnabledCommunicationManagers
} from './communication-managers'
import { FloatingCommsRailItem } from './FloatingCommsRailItem'
import {
  createFloatingCommsOpenRequest,
  useFloatingCommsGeometry
} from './use-floating-comms-geometry'
import {
  reportFloatingCommsError,
  sameFloatingCommsIdentity,
  useFloatingCommsPresentations
} from './use-floating-comms-presentations'

type FloatingCommsRailProps = {
  panelRef: RefObject<HTMLDivElement | null>
  panelVisible: boolean
  workspaceBounds: { left: number; top: number; width: number; height: number }
  openAppId: FloatingWorkspaceAppId | null
  onOpenAppIdChange: (appId: FloatingWorkspaceAppId | null) => void
  onOpenApp: (app: FloatingWorkspaceApp) => void
}

export function FloatingCommsRail({
  panelRef,
  panelVisible,
  workspaceBounds,
  openAppId,
  onOpenAppIdChange,
  onOpenApp
}: FloatingCommsRailProps): React.JSX.Element | null {
  const preferences = useAppStore((state) => state.floatingWorkspaceApps)
  const entries = useMemo(() => listEnabledCommunicationManagers(preferences), [preferences])
  const [attachedIdentity, setAttachedIdentity] = useState<FloatingCommsSurfaceIdentity | null>(
    null
  )
  const buttonRefs = useRef(new Map<FloatingWorkspaceAppId, HTMLButtonElement>())
  const attachedIdentityRef = useRef<FloatingCommsSurfaceIdentity | null>(null)
  const openAppIdRef = useRef(openAppId)
  const pendingAppIdRef = useRef<FloatingWorkspaceAppId | null>(null)
  const requestSequenceRef = useRef(0)
  attachedIdentityRef.current = attachedIdentity
  openAppIdRef.current = openAppId

  const releaseAttached = useCallback(
    (identity?: FloatingCommsSurfaceIdentity) => {
      if (identity && !sameFloatingCommsIdentity(attachedIdentityRef.current, identity)) {
        return
      }
      requestSequenceRef.current += 1
      attachedIdentityRef.current = null
      openAppIdRef.current = null
      pendingAppIdRef.current = null
      setAttachedIdentity(null)
      onOpenAppIdChange(null)
    },
    [onOpenAppIdChange]
  )

  const { presentations, pendingSessions, recordPresentation } = useFloatingCommsPresentations({
    entries,
    onOpenApp,
    onOpenAppIdChange,
    attachedIdentityRef,
    openAppIdRef,
    pendingAppIdRef,
    setAttachedIdentity,
    releaseAttached
  })

  const closeAttached = useCallback(() => {
    const identity = attachedIdentityRef.current
    if (identity) {
      pendingSessions.delete(identity.appId)
    }
    releaseAttached(identity ?? undefined)
    if (identity) {
      void window.api.floatingComms
        .closeAttached(identity)
        .catch((error: unknown) => reportFloatingCommsError('close attached', error))
    }
  }, [pendingSessions, releaseAttached])

  useLayoutEffect(() => {
    if (openAppId !== null && !entries.some(({ app }) => app.id === openAppId)) {
      closeAttached()
    }
    for (const [appId] of presentations) {
      if (!entries.some(({ app }) => app.id === appId)) {
        pendingSessions.delete(appId)
        void window.api.floatingComms
          .disable({ appId })
          .catch((error: unknown) => reportFloatingCommsError('disable', error))
      }
    }
  }, [closeAttached, entries, openAppId, pendingSessions, presentations])

  useEffect(() => {
    if (!panelVisible && attachedIdentityRef.current) {
      closeAttached()
    }
  }, [closeAttached, panelVisible])

  useEffect(() => {
    if (openAppId === null && attachedIdentityRef.current) {
      closeAttached()
    }
  }, [closeAttached, openAppId])

  useFloatingCommsGeometry({
    panelRef,
    buttonRefs,
    attachedIdentityRef,
    close: closeAttached
  })

  useLayoutEffect(() => {
    if (!attachedIdentity || attachedIdentity.mode === 'attached-dom') {
      return
    }
    const button = buttonRefs.current.get(attachedIdentity.appId)
    const workspaceElement = panelRef.current
    if (!button || !workspaceElement) {
      return
    }
    const update = (): void => {
      const identity = attachedIdentityRef.current
      if (!identity || !sameFloatingCommsIdentity(identity, attachedIdentity)) {
        return
      }
      void window.api.floatingComms
        .update({
          ...createFloatingCommsOpenRequest(
            identity.appId,
            button,
            workspaceElement,
            identity.requestId
          ),
          surfaceId: identity.surfaceId,
          mode: identity.mode,
          geometryRequestId: null
        })
        .then((result) => {
          if (
            sameFloatingCommsIdentity(attachedIdentityRef.current, identity) &&
            !sameFloatingCommsIdentity(identity, result.identity)
          ) {
            attachedIdentityRef.current = result.identity
            setAttachedIdentity(result.identity)
            recordPresentation(result.identity)
          }
        })
        .catch((error: unknown) => {
          reportFloatingCommsError('update', error)
          if (sameFloatingCommsIdentity(attachedIdentityRef.current, identity)) {
            closeAttached()
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
  }, [attachedIdentity, closeAttached, panelRef, recordPresentation, workspaceBounds])

  if (entries.length === 0) {
    return null
  }

  return (
    <Popover
      modal={false}
      open={attachedIdentity?.mode === 'attached-dom'}
      onOpenChange={(open) => {
        if (!open) {
          closeAttached()
        }
      }}
    >
      <div className="flex w-10 shrink-0 flex-col border-r bg-background/95">
        {entries.map(({ app, manager }) => {
          const presentation = presentations.get(app.id)
          const detached = presentation?.mode === 'detached'
          const attached = attachedIdentity?.appId === app.id
          const domAttached = attached && attachedIdentity.mode === 'attached-dom'
          return (
            <FloatingCommsRailItem
              key={app.id}
              app={app}
              manager={manager}
              attached={attached}
              domAttached={domAttached}
              detached={detached}
              initialSessionState={
                pendingSessions.get(app.id) ?? createCommunicationManagerSessionState(app.id)
              }
              portalContainer={panelRef.current}
              buttonRef={(element) => {
                if (element) {
                  buttonRefs.current.set(app.id, element)
                } else {
                  buttonRefs.current.delete(app.id)
                }
              }}
              onSessionStateChange={(sessionState) => {
                pendingSessions.set(app.id, sessionState)
              }}
              onSelect={() => {
                if (detached) {
                  void window.api.floatingComms
                    .focusDetached({ appId: app.id })
                    .catch((error: unknown) => reportFloatingCommsError('focus detached', error))
                  return
                }
                if (attachedIdentity?.appId === app.id) {
                  closeAttached()
                  return
                }
                if (attachedIdentityRef.current) {
                  closeAttached()
                }
                const button = buttonRefs.current.get(app.id)
                const workspaceElement = panelRef.current
                if (!button || !workspaceElement) {
                  return
                }
                const requestId = requestSequenceRef.current + 1
                requestSequenceRef.current = requestId
                pendingAppIdRef.current = app.id
                void window.api.floatingComms
                  .open(createFloatingCommsOpenRequest(app.id, button, workspaceElement, requestId))
                  .then((result) => {
                    if (
                      requestSequenceRef.current === requestId &&
                      (pendingAppIdRef.current === app.id || openAppIdRef.current === app.id)
                    ) {
                      pendingAppIdRef.current = null
                      openAppIdRef.current = app.id
                      attachedIdentityRef.current = result.identity
                      setAttachedIdentity(result.identity)
                      recordPresentation(result.identity)
                      onOpenAppIdChange(app.id)
                    }
                  })
                  .catch((error: unknown) => {
                    reportFloatingCommsError('open', error)
                    if (
                      requestSequenceRef.current === requestId &&
                      pendingAppIdRef.current === app.id
                    ) {
                      releaseAttached()
                    }
                  })
              }}
              onDetach={(sessionState) => {
                if (!attachedIdentity || attachedIdentity.mode !== 'attached-dom') {
                  return
                }
                pendingSessions.set(app.id, sessionState)
                void window.api.floatingComms
                  .detach({ ...attachedIdentity, sessionState })
                  .catch((error: unknown) => reportFloatingCommsError('detach', error))
              }}
              onOpenApp={() => {
                closeAttached()
                onOpenApp(app)
              }}
            />
          )
        })}
      </div>
    </Popover>
  )
}
