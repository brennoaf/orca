import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import type { Terminal } from '@xterm/xterm'
import { composeActiveTerminalTheme } from '@/components/terminal-pane/terminal-appearance'
import { useSystemPrefersDark } from '@/components/terminal-pane/use-system-prefers-dark'
import { useEffectiveMacOptionAsAlt } from '@/lib/keyboard-layout/use-effective-mac-option-as-alt'
import { getBuiltinTheme, resolveEffectiveTerminalAppearance } from '@/lib/terminal-theme'
import { resolveTerminalMinimumContrastRatio } from '@/lib/terminal-contrast-correction'
import { useAppStore } from '@/store'
import { buildPreviewAppearanceOptions } from './preview-terminal-options'
import { syncPreviewTerminalLigatures } from './preview-terminal-ligatures'
import type { DashboardCardTerminalInput } from '../../../../shared/dashboard-snapshot'

export function createPreviewTerminalFitter(
  container: HTMLDivElement,
  getTerminal: () => Terminal | null
): () => void {
  const fitToBox = (): void => {
    const screen = container.querySelector<HTMLElement>('.xterm-screen')
    const box = container.parentElement
    const terminal = getTerminal()
    if (!screen || !box || !terminal) {
      return
    }
    const scale = Math.min(1, box.clientWidth / Math.max(1, screen.offsetWidth))
    container.style.transform = scale < 1 ? `scale(${scale})` : ''
    const cellHeight = screen.offsetHeight / Math.max(1, terminal.rows)
    const cursorBottom = (terminal.buffer.active.cursorY + 1) * cellHeight * scale
    const anchorTop = cursorBottom <= box.clientHeight
    box.style.alignItems = anchorTop ? 'flex-start' : 'flex-end'
    container.style.transformOrigin = anchorTop ? 'top left' : 'bottom left'
  }

  let fitScheduled = false
  return (): void => {
    if (fitScheduled) {
      return
    }
    fitScheduled = true
    requestAnimationFrame(() => {
      fitScheduled = false
      fitToBox()
    })
  }
}

export function useAgentTerminalPreviewAppearance(
  terminalInput: DashboardCardTerminalInput | null
) {
  const terminalRef = useRef<Terminal | null>(null)
  const settings = useAppStore((state) => state.settings)
  const systemPrefersDark = useSystemPrefersDark()
  const macOptionAsAlt = useEffectiveMacOptionAsAlt(settings?.terminalMacOptionAsAlt)
  const settingsRef = useRef(settings)
  const macOptionAsAltRef = useRef(macOptionAsAlt)
  const terminalInputRef = useRef(terminalInput)
  const { terminalTheme, terminalMode } = useMemo(() => {
    if (!settings) {
      return { terminalTheme: null, terminalMode: 'dark' as const }
    }
    const appearance = resolveEffectiveTerminalAppearance(settings, systemPrefersDark)
    const theme = composeActiveTerminalTheme(
      appearance.theme ?? getBuiltinTheme(appearance.themeName),
      settings,
      appearance.mode
    )
    return { terminalTheme: theme, terminalMode: appearance.mode }
  }, [settings, systemPrefersDark])
  const terminalThemeRef = useRef(terminalTheme)
  const terminalModeRef = useRef(terminalMode)

  useLayoutEffect(() => {
    settingsRef.current = settings
    macOptionAsAltRef.current = macOptionAsAlt
    terminalInputRef.current = terminalInput
    terminalThemeRef.current = terminalTheme
    terminalModeRef.current = terminalMode
  }, [settings, macOptionAsAlt, terminalInput, terminalTheme, terminalMode])

  useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) {
      return
    }
    Object.assign(
      terminal.options,
      buildPreviewAppearanceOptions(settings, macOptionAsAlt === 'true'),
      {
        theme: terminalTheme ?? undefined,
        minimumContrastRatio: resolveTerminalMinimumContrastRatio(
          terminalTheme?.background,
          terminalMode
        )
      }
    )
    syncPreviewTerminalLigatures(terminal, settings)
  }, [settings, macOptionAsAlt, terminalTheme, terminalMode])

  const getTerminalShortcutPolicy = useCallback(
    () => settingsRef.current?.terminalShortcutPolicy,
    []
  )

  return {
    terminalRef,
    settingsRef,
    macOptionAsAltRef,
    terminalInputRef,
    terminalTheme,
    terminalThemeRef,
    terminalModeRef,
    terminalMode,
    getTerminalShortcutPolicy,
    macOptionAsAlt,
    settings
  }
}
