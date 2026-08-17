import { describe, expect, it } from 'vitest'
import { composeActiveTerminalTheme } from './terminal-appearance'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import {
  customInterfaceThemes,
  getInterfaceThemeSurfacePalette
} from '../../../../shared/interface-theme'
import { getBuiltinTheme } from '@/lib/terminal-theme'

describe('composeActiveTerminalTheme', () => {
  function settingsWith(partial: Partial<GlobalSettings>): GlobalSettings {
    return {
      terminalColorOverrides: undefined,
      terminalCursorOpacity: undefined,
      terminalBackgroundOpacity: undefined,
      interfaceTheme: 'default',
      ...partial
    } as GlobalSettings
  }

  it('preserves the selected terminal theme when the interface theme is default', () => {
    const base = { background: '#101010', foreground: '#fafafa', cursor: '#fafafa' }
    const result = composeActiveTerminalTheme(base, settingsWith({}), 'dark')
    expect(result).toEqual({
      overviewRulerBorder: 'transparent',
      scrollbarSliderBackground: 'rgba(180, 180, 185, 0.4)',
      scrollbarSliderHoverBackground: 'rgba(180, 180, 185, 0.6)',
      scrollbarSliderActiveBackground: 'rgba(180, 180, 185, 0.8)',
      ...base
    })
  })

  it('preserves built-in dark and light terminal palettes with the default interface theme', () => {
    for (const [themeName, mode] of [
      ['Dracula', 'dark'],
      ['Builtin Tango Light', 'light']
    ] as const) {
      const baseTheme = getBuiltinTheme(themeName)
      const result = composeActiveTerminalTheme(baseTheme, settingsWith({}), mode)

      expect(baseTheme).not.toBeNull()
      expect(result).toMatchObject(baseTheme!)
    }
  })

  it('lets the base theme override terminal scrollbar defaults', () => {
    const result = composeActiveTerminalTheme(
      {
        background: '#101010',
        overviewRulerBorder: '#222222',
        scrollbarSliderBackground: 'rgba(1, 2, 3, 0.4)'
      },
      settingsWith({}),
      'dark'
    )

    expect(result!.overviewRulerBorder).toBe('#222222')
    expect(result!.scrollbarSliderBackground).toBe('rgba(1, 2, 3, 0.4)')
  })

  it('layers terminalColorOverrides on top of the base theme', () => {
    const base = { background: '#101010', foreground: '#fafafa' }
    const result = composeActiveTerminalTheme(
      base,
      settingsWith({ terminalColorOverrides: { foreground: '#00ff00' } }),
      'dark'
    )
    expect(result!.foreground).toBe('#00ff00')
    expect(result!.background).toBe('#101010')
  })

  it('applies background opacity by converting the hex background to rgba', () => {
    const base = { background: '#112233' }
    const result = composeActiveTerminalTheme(
      base,
      settingsWith({
        terminalBackgroundOpacity: 0.5,
        terminalColorOverrides: { background: '#112233' }
      }),
      'dark'
    )
    expect(result!.background).toBe('rgba(17, 34, 51, 0.5)')
  })

  it('honors a zero background opacity', () => {
    // Why: pin against a regression where the guard becomes truthy-only
    // (e.g. `if (settings.terminalBackgroundOpacity)`) and silently drops
    // the user's intent to make the background fully transparent.
    const base = { background: '#112233' }
    const result = composeActiveTerminalTheme(
      base,
      settingsWith({
        terminalBackgroundOpacity: 0,
        terminalColorOverrides: { background: '#112233' }
      }),
      'dark'
    )
    expect(result!.background).toBe('rgba(17, 34, 51, 0)')
  })

  it('applies cursor opacity only when the cursor is a hex color', () => {
    const base = { cursor: '#ffffff' }
    const result = composeActiveTerminalTheme(
      base,
      settingsWith({
        terminalCursorOpacity: 0.3,
        terminalColorOverrides: { cursor: '#ffffff' }
      }),
      'dark'
    )
    expect(result!.cursor).toBe('rgba(255, 255, 255, 0.3)')
  })

  it('leaves named CSS cursor colors untouched when applying opacity', () => {
    const base = { cursor: 'red' }
    const result = composeActiveTerminalTheme(
      base,
      settingsWith({
        terminalCursorOpacity: 0.3,
        terminalColorOverrides: { cursor: 'red' }
      }),
      'dark'
    )
    expect(result!.cursor).toBe('red')
  })

  it('returns null when given a null base theme', () => {
    expect(composeActiveTerminalTheme(null, settingsWith({}), 'dark')).toBeNull()
  })

  it('applies every interface palette in both modes', () => {
    for (const theme of customInterfaceThemes) {
      for (const mode of ['light', 'dark'] as const) {
        const result = composeActiveTerminalTheme(
          { black: '#010101', red: '#aa0000' },
          settingsWith({ interfaceTheme: theme }),
          mode
        )

        expect(result).toMatchObject({
          ...getInterfaceThemeSurfacePalette(theme, mode),
          black: '#010101',
          red: '#aa0000'
        })
      }
    }
  })

  it('keeps explicit user color overrides above the interface palette', () => {
    const result = composeActiveTerminalTheme(
      { background: '#101010', foreground: '#fafafa' },
      settingsWith({
        interfaceTheme: 'minecraft',
        terminalColorOverrides: {
          background: '#112233',
          cursor: '#abcdef',
          selectionBackground: '#fedcba'
        }
      }),
      'light'
    )

    expect(result).toMatchObject({
      background: '#112233',
      cursor: '#abcdef',
      selectionBackground: '#fedcba',
      foreground: getInterfaceThemeSurfacePalette('minecraft', 'light').foreground
    })
  })
})
