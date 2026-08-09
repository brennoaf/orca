import { describe, expect, it } from 'vitest'
import { placeFloatingCommsSurface } from './floating-comms-surface-placement'

const contentBounds = { x: 100, y: 50, width: 1_000, height: 700 }
const parentBounds = { x: 90, y: 40, width: 1_020, height: 720 }
const anchor = { x: 200, y: 100, width: 40, height: 40 }

describe('placeFloatingCommsSurface', () => {
  it('places the surface outside to the left when workArea has room', () => {
    expect(
      placeFloatingCommsSurface({
        parentBounds,
        contentBounds,
        workArea: { x: -500, y: 0, width: 2_000, height: 900 },
        anchor,
        zoomFactor: 1,
        measuredHeight: 300
      })
    ).toEqual({ x: -238, y: 150, width: 320, height: 300 })
  })

  it('places the surface outside to the right when the left side does not fit', () => {
    expect(
      placeFloatingCommsSurface({
        parentBounds: { ...parentBounds, x: 0 },
        contentBounds,
        workArea: { x: 0, y: 0, width: 1_600, height: 600 },
        anchor: { ...anchor, x: 20 },
        zoomFactor: 1,
        measuredHeight: 300
      })
    ).toEqual({ x: 1_028, y: 150, width: 320, height: 300 })
  })

  it('returns no external placement when neither side has room', () => {
    expect(
      placeFloatingCommsSurface({
        parentBounds: { x: 326, y: 0, width: 1_940, height: 900 },
        contentBounds,
        workArea: { x: 0, y: 0, width: 2_560, height: 1_440 },
        anchor,
        zoomFactor: 1,
        measuredHeight: 300
      })
    ).toBeNull()
  })

  it('clamps vertically and supports negative monitor coordinates', () => {
    expect(
      placeFloatingCommsSurface({
        parentBounds: { x: -1_600, y: -220, width: 900, height: 940 },
        contentBounds: { x: -1_800, y: -200, width: 1_200, height: 900 },
        workArea: { x: -2_400, y: -300, width: 1_760, height: 720 },
        anchor: { x: 900, y: 800, width: 40, height: 40 },
        zoomFactor: 1,
        measuredHeight: 420
      })?.y
    ).toBe(0)
  })

  it('scales only parent-renderer coordinates by zoom', () => {
    expect(
      placeFloatingCommsSurface({
        parentBounds: { x: 400, y: 40, width: 1_020, height: 720 },
        contentBounds,
        workArea: { x: -1_000, y: 0, width: 2_000, height: 1_000 },
        anchor,
        zoomFactor: 1.5,
        measuredHeight: 200
      })
    ).toEqual({ x: 72, y: 200, width: 320, height: 200 })
  })

  it('does not shrink the external window into a gap beside an offscreen parent', () => {
    expect(
      placeFloatingCommsSurface({
        parentBounds: { x: 326, y: 204, width: 1_936, height: 1_208 },
        contentBounds,
        workArea: { x: 0, y: 0, width: 1_920, height: 1_200 },
        anchor,
        zoomFactor: 2 / 3,
        measuredHeight: 262
      })
    ).toBeNull()
  })

  it('rounds fractional zoom placement away from the parent bounds', () => {
    const placement = placeFloatingCommsSurface({
      parentBounds: { x: 400, y: 40, width: 900, height: 720 },
      contentBounds,
      workArea: { x: -1_000, y: 0, width: 2_500, height: 1_000 },
      anchor,
      zoomFactor: 1.1,
      measuredHeight: 200
    })
    expect(placement).not.toBeNull()
    expect((placement?.x ?? 0) + (placement?.width ?? 0)).toBeLessThanOrEqual(392)
  })

  it('limits the surface to a narrow display height', () => {
    expect(
      placeFloatingCommsSurface({
        parentBounds: { x: 330, y: 40, width: 1_020, height: 720 },
        contentBounds,
        workArea: { x: 0, y: 0, width: 1_800, height: 240 },
        anchor,
        zoomFactor: 1,
        measuredHeight: 420
      })?.height
    ).toBe(240)
  })

  it('uses the DOM fallback on a display narrower than its preferred width', () => {
    expect(
      placeFloatingCommsSurface({
        parentBounds: { x: -180, y: 0, width: 200, height: 600 },
        contentBounds,
        workArea: { x: -200, y: 0, width: 240, height: 600 },
        anchor: { ...anchor, x: 20 },
        zoomFactor: 1,
        measuredHeight: 300
      })
    ).toBeNull()
  })
})
