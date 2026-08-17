import type { GlobalSettings } from '../../../shared/global-settings-types'
import { normalizeInterfaceTheme, type InterfaceTheme } from '../../../shared/interface-theme'
import { buildAppFontFamily } from './app-font-family'

export type DocumentThemePreference = GlobalSettings['theme']

export const THEME_TRANSITION_DISABLED_CLASS = 'theme-transition-disabled'

const DARK_MODE_QUERY = '(prefers-color-scheme: dark)'

type ThemeClassList = {
  add: (...tokens: string[]) => void
  remove: (...tokens: string[]) => void
  toggle: (token: string, force?: boolean) => boolean
}

type ThemeRoot = {
  classList: ThemeClassList
  dataset?: DOMStringMap
  style?: Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>
}

type ThemeMediaMatcher = (query: string) => Pick<MediaQueryList, 'matches'>
type ThemeAnimationFrame = (callback: FrameRequestCallback) => number
type ThemeCancelAnimationFrame = (handle: number) => void

type ApplyDocumentThemeOptions = {
  root?: ThemeRoot
  matchMedia?: ThemeMediaMatcher
  requestAnimationFrame?: ThemeAnimationFrame
  cancelAnimationFrame?: ThemeCancelAnimationFrame
  disableTransitions?: boolean
  systemShouldUseDarkColors?: boolean
}

let pendingTransitionDisableFrames: number[] = []

function cancelPendingTransitionDisableFrames(cancelFrame: ThemeCancelAnimationFrame): void {
  for (const frameId of pendingTransitionDisableFrames) {
    cancelFrame(frameId)
  }
  pendingTransitionDisableFrames = []
}

function systemPrefersDark(
  matchMedia: ThemeMediaMatcher = window.matchMedia.bind(window)
): boolean {
  return matchMedia(DARK_MODE_QUERY).matches
}

export function resolveDocumentTheme(
  theme: DocumentThemePreference,
  matchMedia?: ThemeMediaMatcher,
  systemShouldUseDarkColors?: boolean
): boolean {
  if (theme === 'dark') {
    return true
  }
  if (theme === 'light') {
    return false
  }
  return systemShouldUseDarkColors ?? systemPrefersDark(matchMedia)
}

export function applyDocumentTheme(
  theme: DocumentThemePreference,
  options: ApplyDocumentThemeOptions = {}
): void {
  const root = options.root ?? document.documentElement
  const disableTransitions = options.disableTransitions ?? true
  const shouldUseDarkTheme = resolveDocumentTheme(
    theme,
    options.matchMedia,
    options.systemShouldUseDarkColors
  )

  if (disableTransitions) {
    root.classList.add(THEME_TRANSITION_DISABLED_CLASS)
  }

  root.classList.toggle('dark', shouldUseDarkTheme)
  // Mirror with `light` so consumers can observe the resolved theme
  // symmetrically (Tailwind keys only on `dark`, so this is style-neutral).
  root.classList.toggle('light', !shouldUseDarkTheme)

  if (!disableTransitions) {
    return
  }

  const requestFrame = options.requestAnimationFrame ?? window.requestAnimationFrame.bind(window)
  const cancelFrame = options.cancelAnimationFrame ?? window.cancelAnimationFrame.bind(window)
  cancelPendingTransitionDisableFrames(cancelFrame)

  // Why: two frames lets the root theme class recalculate before restoring
  // normal hover/collapse transitions, preventing staggered color fades.
  const firstFrame = requestFrame(() => {
    pendingTransitionDisableFrames = pendingTransitionDisableFrames.filter(
      (id) => id !== firstFrame
    )
    const secondFrame = requestFrame(() => {
      pendingTransitionDisableFrames = pendingTransitionDisableFrames.filter(
        (id) => id !== secondFrame
      )
      root.classList.remove(THEME_TRANSITION_DISABLED_CLASS)
    })
    pendingTransitionDisableFrames.push(secondFrame)
  })
  pendingTransitionDisableFrames.push(firstFrame)
}

export function applyDocumentInterfaceTheme(
  theme: InterfaceTheme | undefined,
  appFontFamily?: GlobalSettings['appFontFamily'],
  root: ThemeRoot = document.documentElement
): void {
  const normalized = normalizeInterfaceTheme(theme)
  if (root.dataset) {
    root.dataset.orcaTheme = normalized
  }
  if (!root.style) {
    return
  }
  if (normalized === 'default') {
    root.style.setProperty('--app-font-family', buildAppFontFamily(appFontFamily))
    return
  }
  root.style.removeProperty('--app-font-family')
}
