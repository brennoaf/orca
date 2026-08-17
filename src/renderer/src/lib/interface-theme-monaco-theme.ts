import type { editor } from 'monaco-editor'

import {
  customInterfaceThemes,
  getInterfaceThemeSurfacePalette,
  normalizeInterfaceTheme,
  type CustomInterfaceTheme,
  type InterfaceTheme,
  type InterfaceThemeMode
} from '../../../shared/interface-theme'

type MonacoThemeRegistry = {
  defineTheme: (name: string, data: editor.IStandaloneThemeData) => void
}

function withAlpha(color: string, alpha: string): string {
  return `${color}${alpha}`
}

export function getInterfaceThemeMonacoThemeName(
  theme: InterfaceTheme | undefined,
  mode: InterfaceThemeMode
): string {
  const normalizedTheme = normalizeInterfaceTheme(theme)
  return normalizedTheme === 'default'
    ? mode === 'dark'
      ? 'vs-dark'
      : 'vs'
    : `orca-${normalizedTheme}-${mode}`
}

export function buildInterfaceThemeMonacoTheme(
  theme: CustomInterfaceTheme,
  mode: InterfaceThemeMode
): editor.IStandaloneThemeData {
  const palette = getInterfaceThemeSurfacePalette(theme, mode)
  return {
    base: mode === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': palette.background,
      'editor.foreground': palette.foreground,
      'editorCursor.foreground': palette.cursor,
      'editor.selectionBackground': palette.selectionBackground,
      'editor.selectionForeground': palette.selectionForeground,
      'editor.inactiveSelectionBackground': withAlpha(palette.selectionBackground, '88'),
      'editor.lineHighlightBackground': withAlpha(palette.selectionBackground, '18'),
      'editorGutter.background': palette.background,
      'editorWidget.background': palette.background,
      'editorWidget.foreground': palette.foreground,
      'editorWidget.border': palette.cursor
    }
  }
}

export function registerInterfaceThemeMonacoThemes(registry: MonacoThemeRegistry): void {
  for (const theme of customInterfaceThemes) {
    for (const mode of ['light', 'dark'] as const) {
      registry.defineTheme(
        getInterfaceThemeMonacoThemeName(theme, mode),
        buildInterfaceThemeMonacoTheme(theme, mode)
      )
    }
  }
}
