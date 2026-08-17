import { nativeTheme } from 'electron'
import type { GlobalSettings } from '../shared/global-settings-types'

export function syncNativeThemeSource(theme: GlobalSettings['theme'] | undefined): void {
  nativeTheme.themeSource = theme ?? 'system'
}
