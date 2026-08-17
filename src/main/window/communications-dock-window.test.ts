import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  workAreas: [
    { x: 0, y: 0, width: 1_920, height: 900 },
    { x: 1_920, y: -200, width: 2_560, height: 1_400 }
  ]
}))

vi.mock('electron', () => ({
  BrowserWindow: class {},
  screen: {
    getDisplayMatching: (bounds: { x: number }) => ({
      workArea: bounds.x >= 1_920 ? mocks.workAreas[1] : mocks.workAreas[0]
    })
  }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('../native-appearance-windows', () => ({ registerNativeAppearanceWindow: vi.fn() }))
vi.mock('./privileged-window-navigation', () => ({
  installPrivilegedWindowNavigationPolicy: vi.fn()
}))

import {
  clampCommunicationsDockBounds,
  communicationsDockMaximumHeight
} from './communications-dock-window'

describe('communications dock detached window height', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows heights above 720 and clamps only to the current work area', () => {
    expect(clampCommunicationsDockBounds({ x: 100, y: 0, width: 420, height: 820 }).height).toBe(
      820
    )
    expect(clampCommunicationsDockBounds({ x: 100, y: 0, width: 420, height: 1_200 }).height).toBe(
      900
    )
  })

  it('uses the matching monitor work area for persisted and restored bounds', () => {
    const bounds = { x: 2_100, y: -150, width: 500, height: 1_300 }
    expect(clampCommunicationsDockBounds(bounds)).toEqual(bounds)
    expect(communicationsDockMaximumHeight(bounds)).toBe(1_400)
  })
})
