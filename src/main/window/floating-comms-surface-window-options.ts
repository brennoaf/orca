import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'
import { FLOATING_COMMS_SURFACE_MAX_HEIGHT } from '../../shared/floating-comms-surface'
import { FLOATING_COMMS_SURFACE_WIDTH } from './floating-comms-surface-placement'

const FLOATING_COMMS_PARTITION = 'orca-floating-comms-surface'

export function floatingCommsSurfaceWindowOptions(
  parent: BrowserWindow,
  preload: string
): BrowserWindowConstructorOptions {
  return {
    parent,
    width: FLOATING_COMMS_SURFACE_WIDTH,
    height: FLOATING_COMMS_SURFACE_MAX_HEIGHT,
    modal: false,
    frame: false,
    transparent: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: FLOATING_COMMS_PARTITION,
      webviewTag: false
    }
  }
}
