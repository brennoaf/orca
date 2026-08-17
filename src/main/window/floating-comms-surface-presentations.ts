import type { WebContents } from 'electron'
import type { FloatingCommsSurfacePresentation } from '../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'
import type { FloatingCommsAttachedRecord } from './floating-comms-attached-record'
import { createFloatingCommsPresentation } from './floating-comms-surface-presentation'
import {
  isFloatingCommsSurfaceRenderer,
  isFloatingCommsSurfaceVisible
} from './floating-comms-surface-window'

export function listFloatingCommsSurfacePresentations(
  attached: FloatingCommsAttachedRecord | null
): FloatingCommsSurfacePresentation[] {
  if (!attached) {
    return []
  }
  return [
    createFloatingCommsPresentation(
      attached.identity,
      attached.sessionState,
      attached.identity.mode === 'attached-dom' || isFloatingCommsSurfaceVisible(),
      attached.request.height
    )
  ]
}

export function getFloatingCommsSurfacePresentation(
  attached: FloatingCommsAttachedRecord | null,
  appId: FloatingWorkspaceAppId
): FloatingCommsSurfacePresentation | null {
  return (
    listFloatingCommsSurfacePresentations(attached).find(
      (presentation) => presentation.appId === appId
    ) ?? null
  )
}

export function getFloatingCommsSurfaceStateForSender(
  attached: FloatingCommsAttachedRecord | null,
  sender: WebContents
): FloatingCommsSurfacePresentation | null {
  if (attached?.identity.mode === 'attached-native' && isFloatingCommsSurfaceRenderer(sender)) {
    return createFloatingCommsPresentation(
      attached.identity,
      attached.sessionState,
      isFloatingCommsSurfaceVisible(),
      attached.request.height
    )
  }
  return null
}
