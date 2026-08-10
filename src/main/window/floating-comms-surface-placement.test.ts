import { describe, expect, it } from 'vitest'
import { clampFloatingCommsSurfaceHeight } from '../../shared/floating-comms-surface'
import { placeFloatingCommsSurface } from './floating-comms-surface-placement'

const contentBounds = { x: 100, y: 50, width: 1_200, height: 800 }
const workAreas = [{ x: 0, y: 0, width: 1_920, height: 1_080 }]
const workspace = { x: 400, y: 100, width: 500, height: 500 }
const anchor = { x: 400, y: 140, width: 40, height: 40 }

describe('placeFloatingCommsSurface', () => {
  it('prefers a whole left placement inside the Orca content bounds', () => {
    expect(
      placeFloatingCommsSurface({
        contentBounds,
        workAreas,
        anchor,
        workspace,
        zoomFactor: 1,
        measuredHeight: 300
      })
    ).toEqual({ x: 172, y: 190, width: 320, height: 300 })
  })

  it('uses the whole right placement when the left side does not fit', () => {
    expect(
      placeFloatingCommsSurface({
        contentBounds,
        workAreas,
        anchor: { x: 20, y: 140, width: 40, height: 40 },
        workspace: { ...workspace, x: 20 },
        zoomFactor: 1,
        measuredHeight: 300
      })
    ).toEqual({ x: 628, y: 190, width: 320, height: 300 })
  })

  it('returns no placement when neither side fits despite available screen space', () => {
    expect(
      placeFloatingCommsSurface({
        contentBounds: { ...contentBounds, width: 1_000 },
        workAreas: [{ x: -2_000, y: -1_000, width: 5_000, height: 3_000 }],
        anchor: { x: 300, y: 140, width: 40, height: 40 },
        workspace: { ...workspace, x: 300, width: 600 },
        zoomFactor: 1,
        measuredHeight: 300
      })
    ).toBeNull()
  })

  it('keeps the surface inside one display work area', () => {
    expect(
      placeFloatingCommsSurface({
        contentBounds: { x: 0, y: 0, width: 1_000, height: 700 },
        workAreas: [
          { x: 0, y: 0, width: 300, height: 700 },
          { x: 300, y: 0, width: 300, height: 700 }
        ],
        anchor: { x: 500, y: 100, width: 40, height: 40 },
        workspace: { x: 500, y: 60, width: 40, height: 500 },
        zoomFactor: 1,
        measuredHeight: 300
      })
    ).toBeNull()
  })

  it('uses the vertically relevant work area for stacked displays', () => {
    expect(
      placeFloatingCommsSurface({
        contentBounds: { x: 0, y: 0, width: 1_200, height: 1_400 },
        workAreas: [
          { x: 0, y: 0, width: 1_200, height: 600 },
          { x: 0, y: 600, width: 1_200, height: 800 }
        ],
        anchor: { x: 400, y: 740, width: 40, height: 40 },
        workspace: { x: 400, y: 700, width: 500, height: 500 },
        zoomFactor: 1,
        measuredHeight: 300
      })
    ).toEqual({ x: 72, y: 740, width: 320, height: 300 })
  })

  it('supports negative display coordinates without leaving the Orca content bounds', () => {
    expect(
      placeFloatingCommsSurface({
        contentBounds: { x: -900, y: -200, width: 1_800, height: 900 },
        workAreas: [
          { x: -1_200, y: -300, width: 1_200, height: 1_000 },
          { x: 0, y: -300, width: 1_200, height: 1_000 }
        ],
        anchor: { x: 800, y: 100, width: 40, height: 40 },
        workspace: { x: 800, y: 80, width: 500, height: 600 },
        zoomFactor: 1,
        measuredHeight: 420
      })
    ).toEqual({ x: -428, y: -100, width: 320, height: 420 })
  })

  it.each([
    { zoomFactor: 2 / 3, expectedX: 508, expectedY: 143 },
    { zoomFactor: 1, expectedX: -28, expectedY: 190 },
    { zoomFactor: 1.5, expectedX: 172, expectedY: 260 }
  ])(
    'scales only renderer geometry at zoom $zoomFactor',
    ({ zoomFactor, expectedX, expectedY }) => {
      expect(
        placeFloatingCommsSurface({
          contentBounds: { ...contentBounds, x: -100, width: 2_000, height: 1_100 },
          workAreas: [{ x: -1_000, y: 0, width: 3_000, height: 1_200 }],
          anchor,
          workspace,
          zoomFactor,
          measuredHeight: 200
        })
      ).toEqual({ x: expectedX, y: expectedY, width: 320, height: 200 })
    }
  )

  it('returns no placement when the full measured height cannot fit', () => {
    expect(
      placeFloatingCommsSurface({
        contentBounds: { ...contentBounds, height: 240 },
        workAreas,
        anchor,
        workspace,
        zoomFactor: 1,
        measuredHeight: 300
      })
    ).toBeNull()
  })

  it('rejects an anchor outside the workspace shell', () => {
    expect(
      placeFloatingCommsSurface({
        contentBounds,
        workAreas,
        anchor: { ...anchor, x: workspace.x - 41 },
        workspace,
        zoomFactor: 1,
        measuredHeight: 300
      })
    ).toBeNull()
  })
})

describe('clampFloatingCommsSurfaceHeight', () => {
  it('rounds rendered height and clamps growth to the surface maximum', () => {
    expect(clampFloatingCommsSurfaceHeight(419.6)).toBe(420)
    expect(clampFloatingCommsSurfaceHeight(431)).toBe(420)
    expect(clampFloatingCommsSurfaceHeight(Number.NaN)).toBe(1)
  })
})
