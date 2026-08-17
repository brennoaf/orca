import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (event: { sender: unknown }) => unknown>()
  return {
    handlers,
    handle: vi.fn((channel: string, handler: (event: { sender: unknown }) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
    nativeTheme: {
      themeSource: 'system' as 'system' | 'light' | 'dark',
      shouldUseDarkColors: false,
      on: vi.fn(),
      removeListener: vi.fn()
    },
    send: vi.fn(),
    trusted: vi.fn(() => true),
    clear: vi.fn()
  }
})

vi.mock('electron', () => ({
  ipcMain: { handle: mocks.handle, removeHandler: mocks.removeHandler },
  nativeTheme: mocks.nativeTheme
}))
vi.mock('../native-appearance-windows', () => ({
  clearNativeAppearanceWindows: mocks.clear,
  isNativeAppearanceWindow: mocks.trusted,
  sendToNativeAppearanceWindows: mocks.send
}))

import {
  getNativeThemeSnapshot,
  registerNativeAppearanceHandlers,
  shutdownNativeAppearanceHandlers
} from './native-appearance'
import { syncNativeThemeSource } from '../native-theme-source'

describe('native appearance authority', () => {
  beforeEach(() => {
    shutdownNativeAppearanceHandlers()
    mocks.handlers.clear()
    mocks.handle.mockClear()
    mocks.removeHandler.mockClear()
    mocks.nativeTheme.themeSource = 'system'
    mocks.nativeTheme.shouldUseDarkColors = false
    mocks.nativeTheme.on.mockClear()
    mocks.nativeTheme.removeListener.mockClear()
    mocks.send.mockClear()
    mocks.clear.mockClear()
    mocks.trusted.mockReset().mockReturnValue(true)
  })

  it('synchronizes explicit and system theme sources', () => {
    syncNativeThemeSource('dark')
    expect(mocks.nativeTheme.themeSource).toBe('dark')
    syncNativeThemeSource('light')
    expect(mocks.nativeTheme.themeSource).toBe('light')
    syncNativeThemeSource(undefined)
    expect(mocks.nativeTheme.themeSource).toBe('system')
  })

  it('returns the current native snapshot only to a registered Orca window', () => {
    const store = { onSettingsChanged: vi.fn(() => vi.fn()) }
    mocks.nativeTheme.themeSource = 'system'
    mocks.nativeTheme.shouldUseDarkColors = true
    registerNativeAppearanceHandlers(store as never)
    const handler = mocks.handlers.get('appearance:getNativeTheme')
    expect(handler?.({ sender: {} })).toEqual({ shouldUseDarkColors: true, themeSource: 'system' })
    mocks.trusted.mockReturnValue(false)
    expect(() => handler?.({ sender: {} })).toThrow('native_appearance_sender_denied')
  })

  it('synchronizes store-produced theme changes', () => {
    let listener:
      | ((
          updates: { theme?: 'system' | 'light' | 'dark' },
          settings: { theme: 'system' | 'light' | 'dark' }
        ) => void)
      | undefined
    const store = {
      onSettingsChanged: vi.fn((next: typeof listener) => {
        listener = next
        return vi.fn()
      })
    }
    registerNativeAppearanceHandlers(store as never)
    listener?.({ theme: 'dark' }, { theme: 'dark' })
    expect(mocks.nativeTheme.themeSource).toBe('dark')
    listener?.({}, { theme: 'light' })
    expect(mocks.nativeTheme.themeSource).toBe('dark')
  })

  it('publishes native updates and removes every listener on shutdown', () => {
    const removeSettingsListener = vi.fn()
    const store = { onSettingsChanged: vi.fn(() => removeSettingsListener) }
    registerNativeAppearanceHandlers(store as never)
    const updated = mocks.nativeTheme.on.mock.calls.find(([event]) => event === 'updated')?.[1]
    mocks.nativeTheme.shouldUseDarkColors = true
    updated?.()
    expect(mocks.send).toHaveBeenCalledWith('appearance:nativeThemeChanged', {
      shouldUseDarkColors: true,
      themeSource: 'system'
    })

    shutdownNativeAppearanceHandlers()
    expect(removeSettingsListener).toHaveBeenCalledOnce()
    expect(mocks.nativeTheme.removeListener).toHaveBeenCalledWith('updated', updated)
    expect(mocks.handlers.has('appearance:getNativeTheme')).toBe(false)
  })

  it('validates snapshots before publication', () => {
    mocks.nativeTheme.themeSource = 'system'
    mocks.nativeTheme.shouldUseDarkColors = true
    expect(getNativeThemeSnapshot()).toEqual({
      shouldUseDarkColors: true,
      themeSource: 'system'
    })
  })
})
