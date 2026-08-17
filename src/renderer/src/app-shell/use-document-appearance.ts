import { useEffect } from 'react'
import { applyDocumentInterfaceTheme, applyDocumentTheme } from '../lib/document-theme'
import { scheduleRuntimeGraphSync } from '../runtime/sync-runtime-graph'
import { useAppStore } from '../store'

/** Applies the settings-driven theme and app font to the document root. */
export function useDocumentAppearance(): void {
  const settings = useAppStore((s) => s.settings)

  useEffect(() => {
    if (!settings) {
      return
    }

    if (settings.theme === 'dark') {
      applyDocumentTheme('dark')
      return undefined
    } else if (settings.theme === 'light') {
      applyDocumentTheme('light')
      return undefined
    }
    // system
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    applyDocumentTheme('system')
    const handler = (): void => {
      applyDocumentTheme('system')
      // System theme changes don't mutate the store, so mobile terminal colors need an explicit graph republish.
      scheduleRuntimeGraphSync()
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [settings])

  useEffect(() => {
    applyDocumentInterfaceTheme(settings?.interfaceTheme, settings?.appFontFamily)
  }, [settings?.appFontFamily, settings?.interfaceTheme])
}
