// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NativeThemeSnapshot } from '../../../shared/native-appearance'
import {
  initializeNativeDocumentTheme,
  subscribeNativeDocumentTheme
} from './native-document-theme'

type AppearanceApi = {
  getNativeTheme: () => Promise<NativeThemeSnapshot>
  onNativeThemeChanged: (callback: (snapshot: NativeThemeSnapshot) => void) => () => void
}

function appearance(initial: NativeThemeSnapshot): {
  api: AppearanceApi
  emit: (snapshot: NativeThemeSnapshot) => void
  off: ReturnType<typeof vi.fn>
} {
  let listener: ((snapshot: NativeThemeSnapshot) => void) | null = null
  const off = vi.fn()
  return {
    api: {
      getNativeTheme: vi.fn(() => Promise.resolve(initial)),
      onNativeThemeChanged: vi.fn((callback: (snapshot: NativeThemeSnapshot) => void) => {
        listener = callback
        return off
      })
    },
    emit: (snapshot) => listener?.(snapshot),
    off
  }
}

describe('native document theme', () => {
  afterEach(() => {
    document.documentElement.className = ''
    delete (globalThis as { __ORCA_WEB_CLIENT__?: boolean }).__ORCA_WEB_CLIENT__
  })

  it('uses the authoritative native dark snapshot when matchMedia is light', async () => {
    const bridge = appearance({ shouldUseDarkColors: true, themeSource: 'system' })
    await initializeNativeDocumentTheme('system', {
      appearance: bridge.api,
      disableTransitions: false,
      matchMedia: vi.fn(() => ({ matches: false }) as MediaQueryList)
    })
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('applies native updates and cleans its listener', async () => {
    const bridge = appearance({ shouldUseDarkColors: false, themeSource: 'system' })
    const cleanup = subscribeNativeDocumentTheme('system', {
      appearance: bridge.api,
      disableTransitions: false
    })
    await vi.waitFor(() => expect(document.documentElement.classList.contains('light')).toBe(true))
    bridge.emit({ shouldUseDarkColors: true, themeSource: 'system' })
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    cleanup()
    expect(bridge.off).toHaveBeenCalledOnce()
  })

  it.each(['light', 'dark'] as const)(
    'keeps explicit %s independent from native updates',
    (theme) => {
      const bridge = appearance({ shouldUseDarkColors: theme === 'light', themeSource: 'system' })
      const cleanup = subscribeNativeDocumentTheme(theme, {
        appearance: bridge.api,
        disableTransitions: false
      })
      bridge.emit({ shouldUseDarkColors: theme === 'light', themeSource: 'system' })
      expect(document.documentElement.classList.contains('dark')).toBe(theme === 'dark')
      expect(bridge.api.getNativeTheme).not.toHaveBeenCalled()
      expect(bridge.api.onNativeThemeChanged).not.toHaveBeenCalled()
      cleanup()
    }
  )

  it('uses matchMedia only when the appearance bridge is absent', () => {
    const matchMedia = vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
    const cleanup = subscribeNativeDocumentTheme('system', {
      appearance: null,
      disableTransitions: false,
      matchMedia: matchMedia as unknown as typeof window.matchMedia
    })
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    cleanup()
  })

  it('uses matchMedia for the web client without touching a truthy fallback proxy', async () => {
    ;(globalThis as { __ORCA_WEB_CLIENT__?: boolean }).__ORCA_WEB_CLIENT__ = true
    const getNativeTheme = vi.fn(
      () => Promise.resolve(undefined) as unknown as Promise<NativeThemeSnapshot>
    )
    const onNativeThemeChanged = vi.fn(() => vi.fn())
    const change: { current?: () => void } = {}
    let matches = false
    const remove = vi.fn()
    const matchMedia = vi.fn(() => ({
      get matches() {
        return matches
      },
      addEventListener: (_event: string, callback: () => void) => {
        change.current = callback
      },
      removeEventListener: remove
    }))

    await initializeNativeDocumentTheme('system', {
      appearance: { getNativeTheme, onNativeThemeChanged },
      disableTransitions: false,
      matchMedia: matchMedia as unknown as typeof window.matchMedia
    })
    const cleanup = subscribeNativeDocumentTheme('system', {
      appearance: { getNativeTheme, onNativeThemeChanged },
      disableTransitions: false,
      matchMedia: matchMedia as unknown as typeof window.matchMedia
    })
    expect(document.documentElement.classList.contains('light')).toBe(true)
    matches = true
    change.current?.()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(getNativeTheme).not.toHaveBeenCalled()
    expect(onNativeThemeChanged).not.toHaveBeenCalled()
    cleanup()
    expect(remove).toHaveBeenCalledOnce()
  })

  it('logs malformed native snapshots without changing the current theme', async () => {
    document.documentElement.classList.add('dark')
    const reportError = vi.fn()
    await initializeNativeDocumentTheme('system', {
      appearance: {
        getNativeTheme: () => Promise.resolve(undefined) as unknown as Promise<NativeThemeSnapshot>,
        onNativeThemeChanged: () => vi.fn()
      },
      disableTransitions: false,
      reportError
    })
    expect(reportError).toHaveBeenCalledOnce()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('keeps a newer native event over a deferred initial snapshot', async () => {
    let resolveInitial: (snapshot: NativeThemeSnapshot) => void = () => undefined
    const listener: { current?: (snapshot: NativeThemeSnapshot) => void } = {}
    const cleanup = subscribeNativeDocumentTheme('system', {
      appearance: {
        getNativeTheme: () => new Promise((resolve) => (resolveInitial = resolve)),
        onNativeThemeChanged: (callback) => {
          listener.current = callback
          return vi.fn()
        }
      },
      disableTransitions: false
    })
    listener.current?.({ shouldUseDarkColors: true, themeSource: 'system' })
    resolveInitial({ shouldUseDarkColors: false, themeSource: 'system' })
    await Promise.resolve()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    cleanup()
  })
})
