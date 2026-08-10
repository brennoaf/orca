import type { BrowserWindow } from 'electron'
import type {
  FloatingCommsOpenRequest,
  FloatingCommsSurfaceIdentity
} from '../../shared/floating-comms-surface'
import { getTrustedUIRendererWindow } from '../ipc/ui'
import {
  bindFloatingCommsGeometryListeners,
  floatingCommsWorkspaceIntersectsBounds,
  getFloatingCommsSurfacePlacement
} from './floating-comms-surface-geometry'

export type FloatingCommsAttachedOpenHost = {
  createWindow: (owner: BrowserWindow) => BrowserWindow
  currentRequest: () => FloatingCommsOpenRequest | null
  destroy: () => void
  loaded: () => boolean
  owner: () => BrowserWindow | null
  reposition: (owner: BrowserWindow) => void
  requestRefresh: (owner: BrowserWindow) => void
  resetGeometry: () => void
  setCurrent: (
    owner: BrowserWindow,
    request: FloatingCommsOpenRequest,
    identity: FloatingCommsSurfaceIdentity
  ) => void
  setReleaseListeners: (release: () => void) => void
  setWindow: (window: BrowserWindow) => void
  window: () => BrowserWindow | null
  windowIsCurrent: (window: BrowserWindow) => boolean
}

export function openFloatingCommsAttachedSurface(
  owner: BrowserWindow,
  request: FloatingCommsOpenRequest,
  identity: FloatingCommsSurfaceIdentity,
  reusableWindow: BrowserWindow | undefined,
  host: FloatingCommsAttachedOpenHost
): boolean {
  if (owner.isDestroyed() || getTrustedUIRendererWindow() !== owner) {
    throw new Error('floating_comms_parent_unavailable')
  }
  if (host.owner() && host.owner() !== owner) {
    host.destroy()
  }
  const placement = getFloatingCommsSurfacePlacement(owner, request)
  if (!placement) {
    host.destroy()
    return false
  }
  host.setCurrent(owner, request, identity)
  host.resetGeometry()
  let window = host.window()
  if (reusableWindow) {
    if (window && window !== reusableWindow && !window.isDestroyed()) {
      window.destroy()
    }
    host.setWindow(reusableWindow)
    window = reusableWindow
    window.setParentWindow(owner)
    window.setResizable(false)
    window.setMinimizable(false)
    window.setMaximizable(false)
    window.setAlwaysOnTop(false)
  }
  if (!window || window.isDestroyed()) {
    window = host.createWindow(owner)
    host.setWindow(window)
  }
  host.setReleaseListeners(
    bindFloatingCommsGeometryListeners({
      owner,
      window,
      isCurrentWindow: () => host.windowIsCurrent(window),
      isDisplayRelevant: (bounds) =>
        floatingCommsWorkspaceIntersectsBounds(owner, host.currentRequest(), bounds),
      reposition: () => host.reposition(owner),
      requestRefresh: () => host.requestRefresh(owner)
    })
  )
  window.setBounds(placement, false)
  if (host.loaded()) {
    window.webContents.send('floatingComms:stateChanged', identity)
  }
  return true
}
