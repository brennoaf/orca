import { describe, expect, it, vi } from 'vitest'

import {
  customInterfaceThemes,
  getInterfaceThemeSurfacePalette
} from '../../../shared/interface-theme'
import {
  buildInterfaceThemeMonacoTheme,
  getInterfaceThemeMonacoThemeName,
  registerInterfaceThemeMonacoThemes
} from './interface-theme-monaco-theme'

describe('interface theme Monaco themes', () => {
  it('builds both inherited modes for every interface theme', () => {
    for (const theme of customInterfaceThemes) {
      for (const mode of ['light', 'dark'] as const) {
        const palette = getInterfaceThemeSurfacePalette(theme, mode)
        const result = buildInterfaceThemeMonacoTheme(theme, mode)

        expect(result.base).toBe(mode === 'dark' ? 'vs-dark' : 'vs')
        expect(result.inherit).toBe(true)
        expect(result.rules).toEqual([])
        expect(result.colors).toMatchObject({
          'editor.background': palette.background,
          'editor.foreground': palette.foreground,
          'editorCursor.foreground': palette.cursor,
          'editor.selectionBackground': palette.selectionBackground,
          'editor.selectionForeground': palette.selectionForeground,
          'editorGutter.background': palette.background
        })
      }
    }
  })

  it('registers one stable theme name for every theme and mode', () => {
    const defineTheme = vi.fn()

    registerInterfaceThemeMonacoThemes({ defineTheme })

    expect(defineTheme).toHaveBeenCalledTimes(customInterfaceThemes.length * 2)
    expect(defineTheme).toHaveBeenCalledWith(
      getInterfaceThemeMonacoThemeName('xp', 'light'),
      buildInterfaceThemeMonacoTheme('xp', 'light')
    )
  })

  it('uses the built-in Monaco themes for the default interface theme', () => {
    expect(getInterfaceThemeMonacoThemeName('default', 'light')).toBe('vs')
    expect(getInterfaceThemeMonacoThemeName('default', 'dark')).toBe('vs-dark')
  })
})
