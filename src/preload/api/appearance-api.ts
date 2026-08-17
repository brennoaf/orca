import type { NativeThemeSnapshot } from '../../shared/native-appearance'

export type AppearanceApi = {
  getNativeTheme: () => Promise<NativeThemeSnapshot>
  onNativeThemeChanged: (callback: (snapshot: NativeThemeSnapshot) => void) => () => void
}
