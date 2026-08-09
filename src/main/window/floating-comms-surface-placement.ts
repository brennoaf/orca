import type { Rectangle } from 'electron'
import type { FloatingCommsAnchorRect } from '../../shared/floating-comms-surface'

export const FLOATING_COMMS_SURFACE_WIDTH = 320
export const FLOATING_COMMS_SURFACE_MAX_HEIGHT = 420
export const FLOATING_COMMS_SURFACE_GAP = 8

export function placeFloatingCommsSurface(args: {
  parentBounds: Rectangle
  contentBounds: Rectangle
  workArea: Rectangle
  anchor: FloatingCommsAnchorRect
  zoomFactor: number
  measuredHeight: number
}): Rectangle | null {
  const zoom = Number.isFinite(args.zoomFactor) && args.zoomFactor > 0 ? args.zoomFactor : 1
  const width = Math.min(FLOATING_COMMS_SURFACE_WIDTH, args.workArea.width)
  const height = Math.min(
    Math.max(1, Math.round(args.measuredHeight)),
    FLOATING_COMMS_SURFACE_MAX_HEIGHT,
    args.workArea.height
  )
  const anchorY = args.contentBounds.y + args.anchor.y * zoom
  const gap = FLOATING_COMMS_SURFACE_GAP
  const left = Math.floor(args.parentBounds.x - gap - width)
  const right = Math.ceil(args.parentBounds.x + args.parentBounds.width + gap)
  const workAreaRight = args.workArea.x + args.workArea.width
  const leftFits = left >= args.workArea.x && left + width <= workAreaRight
  const rightFits = right >= args.workArea.x && right + width <= workAreaRight
  if (!leftFits && !rightFits) {
    return null
  }
  const x = leftFits ? left : right
  const maxY = args.workArea.y + args.workArea.height - height
  const y = Math.round(Math.min(Math.max(anchorY, args.workArea.y), maxY))
  return { x, y, width, height }
}
