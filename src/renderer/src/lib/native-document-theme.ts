import {
  NativeThemeSnapshotSchema,
  type NativeThemeSnapshot
} from '../../../shared/native-appearance'
import type { DocumentThemePreference } from './document-theme'
import { applyDocumentTheme } from './document-theme'

type AppearanceApi = {
  getNativeTheme: () => Promise<NativeThemeSnapshot>
  onNativeThemeChanged: (callback: (snapshot: NativeThemeSnapshot) => void) => () => void
}

type NativeDocumentThemeOptions = {
  appearance?: AppearanceApi | null
  disableTransitions?: boolean
  matchMedia?: typeof window.matchMedia
  onSystemThemeChanged?: () => void
  reportError?: (error: unknown) => void
}

function appearanceApi(): AppearanceApi | null {
  if (isWebClient()) {
    return null
  }
  return window.api?.appearance ?? null
}

function isWebClient(): boolean {
  return Boolean((globalThis as { __ORCA_WEB_CLIENT__?: boolean }).__ORCA_WEB_CLIENT__)
}

function resolveAppearanceApi(appearance: AppearanceApi | null | undefined): AppearanceApi | null {
  if (isWebClient()) {
    return null
  }
  return appearance === undefined ? appearanceApi() : appearance
}

function parseNativeSnapshot(value: unknown): NativeThemeSnapshot {
  const result = NativeThemeSnapshotSchema.safeParse(value)
  if (!result.success) {
    throw new Error('native_theme_snapshot_invalid')
  }
  return result.data
}

function reportNativeThemeError(error: unknown, reportError?: (error: unknown) => void): void {
  if (reportError) {
    reportError(error)
    return
  }
  console.error('[appearance] native theme unavailable:', error)
}

function applyNativeSnapshot(
  theme: DocumentThemePreference,
  snapshot: NativeThemeSnapshot,
  disableTransitions?: boolean
): void {
  applyDocumentTheme(theme, {
    disableTransitions,
    systemShouldUseDarkColors: snapshot.shouldUseDarkColors
  })
}

export async function initializeNativeDocumentTheme(
  theme: DocumentThemePreference,
  options: NativeDocumentThemeOptions = {}
): Promise<void> {
  if (theme !== 'system') {
    applyDocumentTheme(theme, { disableTransitions: options.disableTransitions })
    return
  }
  const appearance = resolveAppearanceApi(options.appearance)
  if (!appearance) {
    applyDocumentTheme('system', {
      disableTransitions: options.disableTransitions,
      matchMedia: options.matchMedia
    })
    return
  }
  try {
    applyNativeSnapshot(
      theme,
      parseNativeSnapshot(await appearance.getNativeTheme()),
      options.disableTransitions
    )
  } catch (error) {
    reportNativeThemeError(error, options.reportError)
  }
}

export function subscribeNativeDocumentTheme(
  theme: DocumentThemePreference,
  options: NativeDocumentThemeOptions = {}
): () => void {
  if (theme !== 'system') {
    applyDocumentTheme(theme, { disableTransitions: options.disableTransitions })
    return () => undefined
  }
  const appearance = resolveAppearanceApi(options.appearance)
  if (!appearance) {
    const media = (options.matchMedia ?? window.matchMedia.bind(window))(
      '(prefers-color-scheme: dark)'
    )
    const apply = (): void => {
      applyDocumentTheme('system', {
        disableTransitions: options.disableTransitions,
        matchMedia: () => media
      })
      options.onSystemThemeChanged?.()
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }
  let disposed = false
  let revision = 0
  const apply = (snapshot: unknown): void => {
    if (disposed) {
      return
    }
    revision += 1
    let parsed: NativeThemeSnapshot
    try {
      parsed = parseNativeSnapshot(snapshot)
    } catch (error) {
      reportNativeThemeError(error, options.reportError)
      return
    }
    applyNativeSnapshot(theme, parsed, options.disableTransitions)
    options.onSystemThemeChanged?.()
  }
  const off = appearance.onNativeThemeChanged(apply)
  const initialRevision = revision
  void appearance.getNativeTheme().then(
    (snapshot) => {
      if (!disposed && revision === initialRevision) {
        apply(snapshot)
      }
    },
    (error: unknown) => {
      if (!disposed) {
        reportNativeThemeError(error, options.reportError)
      }
    }
  )
  return () => {
    disposed = true
    off()
  }
}
