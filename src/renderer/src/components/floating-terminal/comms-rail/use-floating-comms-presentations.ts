import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type {
  FloatingCommsAction,
  FloatingCommsSessionState,
  FloatingCommsSurfaceChanged,
  FloatingCommsSurfaceIdentity
} from '../../../../../shared/floating-comms-surface'
import type {
  FloatingWorkspaceApp,
  FloatingWorkspaceAppId
} from '../../../../../shared/floating-workspace-apps'
import type { CommunicationsDockAction } from '../../../../../shared/communications-dock'
import { useAppStore } from '@/store'
import { getCommunicationSettingsTarget } from './communication-managers'

type CurrentRef<T> = { current: T }
type FloatingCommsPresentationAction = FloatingCommsAction | CommunicationsDockAction

export function reportFloatingCommsError(operation: string, error: unknown): void {
  console.error(`[floating-comms] ${operation} failed:`, error)
}

export function sameFloatingCommsIdentity(
  left: FloatingCommsSurfaceIdentity | null | undefined,
  right: FloatingCommsSurfaceIdentity | null | undefined
): boolean {
  return Boolean(
    left &&
    right &&
    left.appId === right.appId &&
    left.requestId === right.requestId &&
    left.surfaceId === right.surfaceId &&
    left.mode === right.mode
  )
}

function nextPresentations(
  current: ReadonlyMap<FloatingWorkspaceAppId, FloatingCommsSurfaceIdentity>,
  event: FloatingCommsSurfaceChanged
): ReadonlyMap<FloatingWorkspaceAppId, FloatingCommsSurfaceIdentity> {
  const existing = current.get(event.appId)
  if (existing && event.previous && !sameFloatingCommsIdentity(existing, event.previous)) {
    return current
  }
  if (
    existing &&
    !event.previous &&
    event.current &&
    !sameFloatingCommsIdentity(existing, event.current)
  ) {
    return current
  }
  const next = new Map(current)
  if (event.current) {
    next.set(event.appId, event.current)
  } else {
    next.delete(event.appId)
  }
  return next
}

export function useFloatingCommsPresentations({
  entries,
  onOpenApp,
  onOpenAppIdChange,
  attachedIdentityRef,
  openAppIdRef,
  pendingAppIdRef,
  setAttachedIdentity,
  releaseAttached
}: {
  entries: readonly { app: FloatingWorkspaceApp }[]
  onOpenApp: (app: FloatingWorkspaceApp) => void
  onOpenAppIdChange: (appId: FloatingWorkspaceAppId | null) => void
  attachedIdentityRef: CurrentRef<FloatingCommsSurfaceIdentity | null>
  openAppIdRef: CurrentRef<FloatingWorkspaceAppId | null>
  pendingAppIdRef: CurrentRef<FloatingWorkspaceAppId | null>
  setAttachedIdentity: Dispatch<SetStateAction<FloatingCommsSurfaceIdentity | null>>
  releaseAttached: (identity?: FloatingCommsSurfaceIdentity) => void
}): {
  presentations: ReadonlyMap<FloatingWorkspaceAppId, FloatingCommsSurfaceIdentity>
  pendingSessions: Map<FloatingWorkspaceAppId, FloatingCommsSessionState>
  recordPresentation: (identity: FloatingCommsSurfaceIdentity) => void
} {
  const [presentations, setPresentations] = useState<
    ReadonlyMap<FloatingWorkspaceAppId, FloatingCommsSurfaceIdentity>
  >(new Map())
  const entriesRef = useRef(entries)
  const onOpenAppRef = useRef(onOpenApp)
  const presentationsRef = useRef(presentations)
  const surfaceEventSequenceRef = useRef(0)
  const pendingSessionRef = useRef(new Map<FloatingWorkspaceAppId, FloatingCommsSessionState>())
  entriesRef.current = entries
  onOpenAppRef.current = onOpenApp
  presentationsRef.current = presentations

  const recordPresentation = useCallback((identity: FloatingCommsSurfaceIdentity): void => {
    setPresentations((current) => {
      const next = new Map(current)
      next.set(identity.appId, identity)
      presentationsRef.current = next
      return next
    })
  }, [])

  const applySurfaceChanged = useCallback(
    (event: FloatingCommsSurfaceChanged): void => {
      const existing = presentationsRef.current.get(event.appId)
      if (event.previous && (!existing || !sameFloatingCommsIdentity(existing, event.previous))) {
        return
      }
      if (
        existing &&
        !event.previous &&
        event.current &&
        !sameFloatingCommsIdentity(existing, event.current)
      ) {
        return
      }
      surfaceEventSequenceRef.current += 1
      setPresentations((current) => {
        const next = nextPresentations(current, event)
        presentationsRef.current = next
        return next
      })
      if (event.sessionState) {
        pendingSessionRef.current.set(event.appId, event.sessionState)
      }
      const currentAttached = attachedIdentityRef.current
      if (event.current?.mode === 'attached-dom' || event.current?.mode === 'attached-native') {
        if (
          !currentAttached ||
          !event.previous ||
          sameFloatingCommsIdentity(currentAttached, event.previous)
        ) {
          attachedIdentityRef.current = event.current
          openAppIdRef.current = event.current.appId
          pendingAppIdRef.current = null
          setAttachedIdentity(event.current)
          onOpenAppIdChange(event.current.appId)
        }
      } else if (
        currentAttached &&
        event.previous &&
        sameFloatingCommsIdentity(currentAttached, event.previous)
      ) {
        releaseAttached(currentAttached)
      }
      if (event.reason === 'closed' || event.reason === 'disabled') {
        pendingSessionRef.current.delete(event.appId)
      }
    },
    [
      attachedIdentityRef,
      onOpenAppIdChange,
      openAppIdRef,
      pendingAppIdRef,
      releaseAttached,
      setAttachedIdentity
    ]
  )

  useEffect(() => {
    let disposed = false
    const surface = window.api.floatingComms
    const sequence = surfaceEventSequenceRef.current
    void surface
      .listPresentations()
      .then((snapshot) => {
        if (disposed || sequence !== surfaceEventSequenceRef.current) {
          return
        }
        const next = new Map(snapshot.map((presentation) => [presentation.appId, presentation]))
        presentationsRef.current = next
        setPresentations(next)
        for (const presentation of snapshot) {
          pendingSessionRef.current.set(presentation.appId, presentation.sessionState)
        }
      })
      .catch((error: unknown) => reportFloatingCommsError('list presentations', error))
    const offChanged = surface.onSurfaceChanged(applySurfaceChanged)
    const dispatchAction = (action: FloatingCommsPresentationAction): void => {
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
    }
    const offAction = surface.onAction((action) => {
      const current = presentationsRef.current.get(action.appId)
      if (!current || !sameFloatingCommsIdentity(current, action)) {
        return
      }
      dispatchAction(action)
    })
    const offDockAction = window.api.floatingCommsDock.onAction(dispatchAction)
    return () => {
      disposed = true
      offChanged()
      offAction()
      offDockAction()
    }
  }, [applySurfaceChanged])

  return { presentations, pendingSessions: pendingSessionRef.current, recordPresentation }
}
