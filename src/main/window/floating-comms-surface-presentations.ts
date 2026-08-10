import type { WebContents } from 'electron'
import type { FloatingCommsSurfacePresentation } from '../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'
import type {
  FloatingCommsAttachedRecord,
  FloatingCommsDetachedSurfaceController
} from './floating-comms-detached-surface-controller'
import { createFloatingCommsPresentation } from './floating-comms-surface-presentation'
import {
  isFloatingCommsSurfaceRenderer,
  isFloatingCommsSurfaceVisible
} from './floating-comms-surface-window'

export function listFloatingCommsSurfacePresentations(
  detached: FloatingCommsDetachedSurfaceController,
  attached: FloatingCommsAttachedRecord | null
): FloatingCommsSurfacePresentation[] {
  const presentations = detached.listPresentations()
  if (attached) {
    presentations.unshift(
      createFloatingCommsPresentation(
        attached.identity,
        attached.sessionState,
        attached.identity.mode === 'attached-dom' || isFloatingCommsSurfaceVisible()
      )
    )
  }
  return presentations
}

export function getFloatingCommsSurfacePresentation(
  detached: FloatingCommsDetachedSurfaceController,
  attached: FloatingCommsAttachedRecord | null,
  appId: FloatingWorkspaceAppId
): FloatingCommsSurfacePresentation | null {
  return (
    listFloatingCommsSurfacePresentations(detached, attached).find(
      (presentation) => presentation.appId === appId
    ) ?? null
  )
}

export function getFloatingCommsSurfaceStateForSender(
  detached: FloatingCommsDetachedSurfaceController,
  attached: FloatingCommsAttachedRecord | null,
  sender: WebContents
): FloatingCommsSurfacePresentation | null {
  if (attached?.identity.mode === 'attached-native' && isFloatingCommsSurfaceRenderer(sender)) {
    return createFloatingCommsPresentation(
      attached.identity,
      attached.sessionState,
      isFloatingCommsSurfaceVisible()
    )
  }
  return detached.getStateForSender(sender)
}
