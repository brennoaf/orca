import type { BrowserWindow } from 'electron'
import {
  COMMUNICATIONS_DOCK_NAVBAR_MAX_HEIGHT,
  COMMUNICATIONS_DOCK_NAVBAR_MIN_HEIGHT,
  type CommunicationsDockBounds,
  type CommunicationsDockLayout
} from '../../shared/communications-dock'
import {
  COMMUNICATIONS_DOCK_MIN_HEIGHT,
  COMMUNICATIONS_DOCK_MIN_WIDTH
} from './communications-dock-layout'
import { clampCommunicationsDockBounds } from './communications-dock-window'

export class CommunicationsDockCollapseController {
  private navbarHeight = 40

  constructor(private expandedBounds: CommunicationsDockBounds) {}

  boundsChanged(bounds: CommunicationsDockBounds, collapsed = false): void {
    const nextBounds = clampCommunicationsDockBounds(bounds)
    this.expandedBounds = collapsed
      ? { ...this.expandedBounds, x: nextBounds.x, y: nextBounds.y }
      : nextBounds
  }

  applyInitialState(window: BrowserWindow, layout: CommunicationsDockLayout): void {
    if (!layout.collapsed) {
      return
    }
    window.setMinimumSize(COMMUNICATIONS_DOCK_MIN_WIDTH, this.navbarHeight)
    window.setBounds({ ...this.expandedBounds, height: this.navbarHeight }, false)
  }

  setCollapsed(
    window: BrowserWindow,
    layout: CommunicationsDockLayout,
    collapsed: boolean
  ): CommunicationsDockLayout {
    if (layout.collapsed === collapsed) {
      return layout
    }
    if (collapsed) {
      this.expandedBounds = window.getBounds()
      window.setMinimumSize(COMMUNICATIONS_DOCK_MIN_WIDTH, this.navbarHeight)
      window.setBounds({ ...this.expandedBounds, height: this.navbarHeight }, false)
    } else {
      window.setMinimumSize(COMMUNICATIONS_DOCK_MIN_WIDTH, COMMUNICATIONS_DOCK_MIN_HEIGHT)
      window.setBounds(clampCommunicationsDockBounds(this.expandedBounds), false)
    }
    return { ...layout, bounds: this.expandedBounds, collapsed }
  }

  setNavbarHeight(window: BrowserWindow, layout: CommunicationsDockLayout, height: number): void {
    this.navbarHeight = Math.round(
      Math.min(
        Math.max(height, COMMUNICATIONS_DOCK_NAVBAR_MIN_HEIGHT),
        COMMUNICATIONS_DOCK_NAVBAR_MAX_HEIGHT
      )
    )
    if (layout.collapsed) {
      window.setMinimumSize(COMMUNICATIONS_DOCK_MIN_WIDTH, this.navbarHeight)
      window.setBounds({ ...window.getBounds(), height: this.navbarHeight }, false)
    }
  }

  getBounds(): CommunicationsDockBounds {
    return this.expandedBounds
  }
}
