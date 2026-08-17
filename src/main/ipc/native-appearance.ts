import { ipcMain, nativeTheme } from 'electron'
import type { Store } from '../persistence'
import { NativeThemeSnapshotSchema, type NativeThemeSnapshot } from '../../shared/native-appearance'
import { syncNativeThemeSource } from '../native-theme-source'
import {
  clearNativeAppearanceWindows,
  isNativeAppearanceWindow,
  sendToNativeAppearanceWindows
} from '../native-appearance-windows'

const SNAPSHOT_CHANNEL = 'appearance:getNativeTheme'
const UPDATED_CHANNEL = 'appearance:nativeThemeChanged'

let removeSettingsListener: (() => void) | null = null
let nativeThemeUpdatedListener: (() => void) | null = null

export function getNativeThemeSnapshot(): NativeThemeSnapshot {
  return NativeThemeSnapshotSchema.parse({
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
    themeSource: nativeTheme.themeSource
  })
}

export function registerNativeAppearanceHandlers(store: Store): void {
  removeNativeAppearanceListeners()
  ipcMain.handle(SNAPSHOT_CHANNEL, (event) => {
    if (!isNativeAppearanceWindow(event.sender)) {
      throw new Error('native_appearance_sender_denied')
    }
    return getNativeThemeSnapshot()
  })
  removeSettingsListener = store.onSettingsChanged((updates, settings) => {
    if ('theme' in updates) {
      syncNativeThemeSource(settings.theme)
    }
  })
  nativeThemeUpdatedListener = () => {
    sendToNativeAppearanceWindows(UPDATED_CHANNEL, getNativeThemeSnapshot())
  }
  nativeTheme.on('updated', nativeThemeUpdatedListener)
}

export function shutdownNativeAppearanceHandlers(): void {
  removeNativeAppearanceListeners()
  clearNativeAppearanceWindows()
}

function removeNativeAppearanceListeners(): void {
  ipcMain.removeHandler(SNAPSHOT_CHANNEL)
  removeSettingsListener?.()
  removeSettingsListener = null
  if (nativeThemeUpdatedListener) {
    nativeTheme.removeListener('updated', nativeThemeUpdatedListener)
    nativeThemeUpdatedListener = null
  }
}
