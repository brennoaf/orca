import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearNativeAppearanceWindows,
  isNativeAppearanceWindow,
  registerNativeAppearanceWindow,
  sendToNativeAppearanceWindows
} from './native-appearance-windows'

function createWindow(id: number) {
  const window = new EventEmitter() as EventEmitter & {
    isDestroyed: () => boolean
    webContents: EventEmitter & {
      id: number
      isDestroyed: () => boolean
      send: ReturnType<typeof vi.fn>
    }
  }
  let destroyed = false
  window.isDestroyed = () => destroyed
  window.webContents = Object.assign(new EventEmitter(), {
    id,
    isDestroyed: () => destroyed,
    send: vi.fn()
  })
  return {
    window,
    destroy: () => {
      destroyed = true
      window.webContents.emit('destroyed')
    }
  }
}

describe('native appearance window registry', () => {
  beforeEach(() => clearNativeAppearanceWindows())

  it('authorizes and broadcasts to main and auxiliary Orca windows', () => {
    const windows = [createWindow(1), createWindow(2), createWindow(3), createWindow(4)]
    for (const entry of windows) {
      registerNativeAppearanceWindow(entry.window as never)
      expect(isNativeAppearanceWindow(entry.window.webContents as never)).toBe(true)
    }
    sendToNativeAppearanceWindows('appearance:nativeThemeChanged', { shouldUseDarkColors: true })
    for (const entry of windows) {
      expect(entry.window.webContents.send).toHaveBeenCalledOnce()
    }
    expect(isNativeAppearanceWindow(createWindow(9).window.webContents as never)).toBe(false)
  })

  it('removes destroyed windows and authorizes their replacement', () => {
    const first = createWindow(1)
    const replacement = createWindow(2)
    registerNativeAppearanceWindow(first.window as never)
    first.destroy()
    expect(isNativeAppearanceWindow(first.window.webContents as never)).toBe(false)
    registerNativeAppearanceWindow(replacement.window as never)
    expect(isNativeAppearanceWindow(replacement.window.webContents as never)).toBe(true)
    sendToNativeAppearanceWindows('appearance:nativeThemeChanged', {})
    expect(first.window.webContents.send).not.toHaveBeenCalled()
    expect(replacement.window.webContents.send).toHaveBeenCalledOnce()
  })

  it('registers a window idempotently', () => {
    const entry = createWindow(1)
    const first = registerNativeAppearanceWindow(entry.window as never)
    const second = registerNativeAppearanceWindow(entry.window as never)
    expect(second).toBe(first)
    expect(entry.window.listenerCount('closed')).toBe(1)
    expect(entry.window.webContents.listenerCount('destroyed')).toBe(1)
    sendToNativeAppearanceWindows('appearance:nativeThemeChanged', {})
    expect(entry.window.webContents.send).toHaveBeenCalledOnce()
  })
})
