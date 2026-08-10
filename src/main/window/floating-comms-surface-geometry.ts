import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import type {
  FloatingCommsGeometryRequest,
  FloatingCommsOpenRequest,
  FloatingCommsSurfaceIdentity
} from '../../shared/floating-comms-surface'
import { placeFloatingCommsSurface } from './floating-comms-surface-placement'

const GEOMETRY_DEBOUNCE_MS = 80
const GEOMETRY_TIMEOUT_MS = 500

type GeometryCompletion = {
  suspendedRequest: FloatingCommsSurfaceIdentity | null
  shouldFocus: boolean
}

export function getFloatingCommsSurfacePlacement(
  owner: BrowserWindow,
  request: FloatingCommsOpenRequest
): Rectangle | null {
  const contentBounds = owner.getContentBounds()
  return placeFloatingCommsSurface({
    contentBounds,
    workAreas: screen.getAllDisplays().map((display) => display.workArea),
    anchor: request.anchor,
    workspace: request.workspace,
    zoomFactor: owner.webContents.getZoomFactor(),
    measuredHeight: request.height
  })
}

export function floatingCommsWorkspaceIntersectsBounds(
  owner: BrowserWindow,
  request: FloatingCommsOpenRequest | null,
  bounds: Rectangle
): boolean {
  if (!request) {
    return false
  }
  const contentBounds = owner.getContentBounds()
  const zoomFactor = owner.webContents.getZoomFactor()
  const zoom = Number.isFinite(zoomFactor) && zoomFactor > 0 ? zoomFactor : 1
  const workspace = {
    x: contentBounds.x + request.workspace.x * zoom,
    y: contentBounds.y + request.workspace.y * zoom,
    width: request.workspace.width * zoom,
    height: request.workspace.height * zoom
  }
  return (
    workspace.x < bounds.x + bounds.width &&
    workspace.x + workspace.width > bounds.x &&
    workspace.y < bounds.y + bounds.height &&
    workspace.y + workspace.height > bounds.y
  )
}

export function createFloatingCommsGeometryCoordinator({
  isCurrent,
  onTimeout
}: {
  isCurrent: (owner: BrowserWindow, identity: FloatingCommsSurfaceIdentity) => boolean
  onTimeout: (identity: FloatingCommsSurfaceIdentity) => void
}): {
  accept: (geometryRequestId: number | null) => boolean
  begin: (
    owner: BrowserWindow,
    identity: FloatingCommsSurfaceIdentity,
    window: BrowserWindow,
    visibleRequest: FloatingCommsSurfaceIdentity | null
  ) => void
  complete: () => GeometryCompletion
  isAwaiting: () => boolean
  recordFirstMeasurement: (identity: FloatingCommsSurfaceIdentity) => void
  reset: () => void
} {
  let awaiting = false
  let focusAfterRefresh = false
  let suspendedRequest: FloatingCommsSurfaceIdentity | null = null
  let sequence = 0
  let pendingRequestId: number | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null

  const clearTimers = (): void => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (timeoutTimer) {
      clearTimeout(timeoutTimer)
      timeoutTimer = null
    }
  }

  const clearRequest = (): void => {
    clearTimers()
    pendingRequestId = null
  }

  return {
    accept: (geometryRequestId) => {
      if (awaiting) {
        if (geometryRequestId === null || geometryRequestId !== pendingRequestId) {
          return false
        }
        clearRequest()
        return true
      }
      return geometryRequestId === null
    },
    begin: (owner, identity, window, visibleRequest) => {
      awaiting = true
      if (visibleRequest && window.isVisible()) {
        suspendedRequest = visibleRequest
        focusAfterRefresh = false
        window.hide()
      }
      clearTimers()
      const geometryRequestId = ++sequence
      pendingRequestId = geometryRequestId
      debounceTimer = setTimeout(() => {
        debounceTimer = null
        if (pendingRequestId !== geometryRequestId || !isCurrent(owner, identity)) {
          return
        }
        const request: FloatingCommsGeometryRequest = { ...identity, geometryRequestId }
        owner.webContents.send('floatingComms:geometryRequested', request)
        timeoutTimer = setTimeout(() => {
          timeoutTimer = null
          if (pendingRequestId !== geometryRequestId || !isCurrent(owner, identity)) {
            return
          }
          onTimeout(identity)
        }, GEOMETRY_TIMEOUT_MS)
      }, GEOMETRY_DEBOUNCE_MS)
    },
    complete: () => {
      const completion = {
        suspendedRequest,
        shouldFocus: focusAfterRefresh
      }
      awaiting = false
      suspendedRequest = null
      focusAfterRefresh = false
      return completion
    },
    isAwaiting: () => awaiting,
    recordFirstMeasurement: (identity) => {
      if (awaiting) {
        suspendedRequest = identity
        focusAfterRefresh = true
      }
    },
    reset: () => {
      clearRequest()
      awaiting = false
      suspendedRequest = null
      focusAfterRefresh = false
    }
  }
}

export function bindFloatingCommsGeometryListeners({
  owner,
  window,
  isCurrentWindow,
  isDisplayRelevant,
  reposition,
  requestRefresh
}: {
  owner: BrowserWindow
  window: BrowserWindow
  isCurrentWindow: () => boolean
  isDisplayRelevant: (bounds: Rectangle) => boolean
  reposition: () => void
  requestRefresh: () => void
}): () => void {
  const move = (): void => {
    if (isCurrentWindow()) {
      reposition()
    }
  }
  const refresh = (): void => {
    if (isCurrentWindow()) {
      requestRefresh()
    }
  }
  const updateDisplayMetrics = (
    _event: Electron.Event,
    display: Electron.Display,
    changedMetrics: string[]
  ): void => {
    if (changedMetrics.includes('scaleFactor')) {
      if (isDisplayRelevant(display.bounds)) {
        refresh()
      }
    } else {
      move()
    }
  }
  const destroy = (): void => {
    if (isCurrentWindow()) {
      window.destroy()
    }
  }
  owner.on('move', move)
  owner.on('resize', refresh)
  owner.on('maximize', refresh)
  owner.on('unmaximize', refresh)
  owner.webContents.on('zoom-changed', refresh)
  screen.on('display-added', move)
  screen.on('display-removed', move)
  screen.on('display-metrics-changed', updateDisplayMetrics)
  owner.once('closed', destroy)
  app.once('before-quit', destroy)
  return () => {
    owner.removeListener('move', move)
    owner.removeListener('resize', refresh)
    owner.removeListener('maximize', refresh)
    owner.removeListener('unmaximize', refresh)
    owner.webContents.removeListener('zoom-changed', refresh)
    owner.removeListener('closed', destroy)
    app.removeListener('before-quit', destroy)
    screen.removeListener('display-added', move)
    screen.removeListener('display-removed', move)
    screen.removeListener('display-metrics-changed', updateDisplayMetrics)
  }
}
