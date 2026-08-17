import { nativeTheme } from 'electron'
import type { GlobalSettings } from '../shared/types'

export function syncNativeThemeSource(theme: GlobalSettings['theme'] | undefined): void {
  nativeTheme.themeSource = theme ?? 'system'
}
