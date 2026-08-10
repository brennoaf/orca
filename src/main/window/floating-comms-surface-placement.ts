import type { Rectangle } from 'electron'
import {
  FLOATING_COMMS_SURFACE_MAX_HEIGHT,
  type FloatingCommsAnchorRect
} from '../../shared/floating-comms-surface'

export const FLOATING_COMMS_SURFACE_WIDTH = 320
export const FLOATING_COMMS_SURFACE_GAP = 8

export function placeFloatingCommsSurface(args: {
  contentBounds: Rectangle
  workAreas: readonly Rectangle[]
  anchor: FloatingCommsAnchorRect
  workspace: FloatingCommsAnchorRect
  zoomFactor: number
  measuredHeight: number
}): Rectangle | null {
  const zoom = Number.isFinite(args.zoomFactor) && args.zoomFactor > 0 ? args.zoomFactor : 1
  const width = FLOATING_COMMS_SURFACE_WIDTH
  const height = Math.min(
    Math.max(1, Math.round(args.measuredHeight)),
    FLOATING_COMMS_SURFACE_MAX_HEIGHT
  )
  const anchorRight = args.anchor.x + args.anchor.width
  const anchorBottom = args.anchor.y + args.anchor.height
  const workspaceRight = args.workspace.x + args.workspace.width
  const workspaceBottom = args.workspace.y + args.workspace.height
  if (
    args.anchor.x < args.workspace.x ||
    args.anchor.y < args.workspace.y ||
    anchorRight > workspaceRight ||
    anchorBottom > workspaceBottom
  ) {
    return null
  }
  const workspaceX = args.contentBounds.x + args.workspace.x * zoom
  const workspaceY = args.contentBounds.y + args.workspace.y * zoom
  const workspaceWidth = args.workspace.width * zoom
  const workspaceHeight = args.workspace.height * zoom
  const anchorY = args.contentBounds.y + args.anchor.y * zoom
  const anchorBottomY = anchorY + args.anchor.height * zoom
  const gap = FLOATING_COMMS_SURFACE_GAP
  const candidates = [
    Math.floor(workspaceX - gap - width),
    Math.ceil(workspaceX + workspaceWidth + gap)
  ]
  const contentRight = args.contentBounds.x + args.contentBounds.width
  const contentBottom = args.contentBounds.y + args.contentBounds.height
  if (
    workspaceX < args.contentBounds.x ||
    workspaceY < args.contentBounds.y ||
    workspaceX + workspaceWidth > contentRight ||
    workspaceY + workspaceHeight > contentBottom
  ) {
    return null
  }
  const orderedWorkAreas = args.workAreas
    .filter((workArea) => {
      const bottom = workArea.y + workArea.height
      return (
        (anchorY < bottom && anchorBottomY > workArea.y) ||
        (workspaceY < bottom && workspaceY + workspaceHeight > workArea.y)
      )
    })
    .map((workArea) => ({
      workArea,
      containsAnchor: anchorY >= workArea.y && anchorY < workArea.y + workArea.height,
      workspaceOverlap: Math.max(
        0,
        Math.min(workspaceY + workspaceHeight, workArea.y + workArea.height) -
          Math.max(workspaceY, workArea.y)
      )
    }))
    .sort(
      (left, right) =>
        Number(right.containsAnchor) - Number(left.containsAnchor) ||
        right.workspaceOverlap - left.workspaceOverlap ||
        left.workArea.y - right.workArea.y ||
        left.workArea.x - right.workArea.x
    )
  for (const x of candidates) {
    if (x < args.contentBounds.x || x + width > contentRight) {
      continue
    }
    for (const { workArea } of orderedWorkAreas) {
      const workAreaRight = workArea.x + workArea.width
      if (x < workArea.x || x + width > workAreaRight) {
        continue
      }
      const safeTop = Math.max(args.contentBounds.y, workArea.y)
      const safeBottom = Math.min(contentBottom, workArea.y + workArea.height)
      if (safeBottom - safeTop < height) {
        continue
      }
      const y = Math.round(Math.min(Math.max(anchorY, safeTop), safeBottom - height))
      return { x, y, width, height }
    }
  }
  return null
}
