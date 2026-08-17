import { describe, expect, it, vi } from 'vitest'
import {
  applyDocumentInterfaceTheme,
  applyDocumentTheme,
  resolveDocumentTheme,
  THEME_TRANSITION_DISABLED_CLASS
} from './document-theme'

class FakeClassList {
  private readonly tokens = new Set<string>()

  add(...tokens: string[]): void {
    for (const token of tokens) {
      this.tokens.add(token)
    }
  }

  remove(...tokens: string[]): void {
    for (const token of tokens) {
      this.tokens.delete(token)
    }
  }

  toggle(token: string, force?: boolean): boolean {
    if (force === true) {
      this.tokens.add(token)
      return true
    }
    if (force === false) {
      this.tokens.delete(token)
      return false
    }
    if (this.tokens.has(token)) {
      this.tokens.delete(token)
      return false
    }
    this.tokens.add(token)
    return true
  }

  contains(token: string): boolean {
    return this.tokens.has(token)
  }
}

function createThemeRoot(): {
  classList: FakeClassList
  dataset: DOMStringMap
  style: Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>
} {
  const properties = new Map<string, string>()
  return {
    classList: new FakeClassList(),
    dataset: {} as DOMStringMap,
    style: {
      removeProperty: (property) => (properties.delete(property) ? '' : ''),
      setProperty: (property, value) => void properties.set(property, value ?? '')
    }
  }
}

function createFrameQueue(): {
  requestAnimationFrame: (callback: FrameRequestCallback) => number
  cancelAnimationFrame: (handle: number) => void
  flushNextFrame: () => void
  pendingCount: () => number
} {
  let nextHandle = 1
  const callbacks = new Map<number, FrameRequestCallback>()
  return {
    requestAnimationFrame: (callback) => {
      const handle = nextHandle++
      callbacks.set(handle, callback)
      return handle
    },
    cancelAnimationFrame: (handle) => {
      callbacks.delete(handle)
    },
    flushNextFrame: () => {
      const [handle, callback] = callbacks.entries().next().value ?? []
      if (handle === undefined || !callback) {
        return
      }
      callbacks.delete(handle)
      callback(0)
    },
    pendingCount: () => callbacks.size
  }
}

describe('document theme', () => {
  it('resolves explicit theme preferences', () => {
    expect(resolveDocumentTheme('dark')).toBe(true)
    expect(resolveDocumentTheme('light')).toBe(false)
  })

  it('resolves system from matchMedia', () => {
    expect(resolveDocumentTheme('system', () => ({ matches: true }))).toBe(true)
    expect(resolveDocumentTheme('system', () => ({ matches: false }))).toBe(false)
  })

  it('applies dark and light root classes', () => {
    const root = createThemeRoot()

    applyDocumentTheme('dark', { root, disableTransitions: false })
    expect(root.classList.contains('dark')).toBe(true)

    applyDocumentTheme('light', { root, disableTransitions: false })
    expect(root.classList.contains('dark')).toBe(false)
  })

  it('applies system root class from matchMedia', () => {
    const root = createThemeRoot()

    applyDocumentTheme('system', {
      root,
      matchMedia: () => ({ matches: true }),
      disableTransitions: false
    })
    expect(root.classList.contains('dark')).toBe(true)
  })

  it('removes the transition suppression class after two animation frames', () => {
    const root = createThemeRoot()
    const frames = createFrameQueue()

    applyDocumentTheme('dark', {
      root,
      requestAnimationFrame: frames.requestAnimationFrame,
      cancelAnimationFrame: frames.cancelAnimationFrame
    })

    expect(root.classList.contains(THEME_TRANSITION_DISABLED_CLASS)).toBe(true)

    frames.flushNextFrame()
    expect(root.classList.contains(THEME_TRANSITION_DISABLED_CLASS)).toBe(true)

    frames.flushNextFrame()
    expect(root.classList.contains(THEME_TRANSITION_DISABLED_CLASS)).toBe(false)
  })

  it('cancels stale transition suppression frames on rapid theme changes', () => {
    const root = createThemeRoot()
    const frames = createFrameQueue()

    applyDocumentTheme('dark', {
      root,
      requestAnimationFrame: frames.requestAnimationFrame,
      cancelAnimationFrame: frames.cancelAnimationFrame
    })
    expect(frames.pendingCount()).toBe(1)

    applyDocumentTheme('light', {
      root,
      requestAnimationFrame: frames.requestAnimationFrame,
      cancelAnimationFrame: frames.cancelAnimationFrame
    })
    expect(frames.pendingCount()).toBe(1)

    frames.flushNextFrame()
    expect(root.classList.contains(THEME_TRANSITION_DISABLED_CLASS)).toBe(true)
    expect(frames.pendingCount()).toBe(1)

    frames.flushNextFrame()
    expect(root.classList.contains(THEME_TRANSITION_DISABLED_CLASS)).toBe(false)
    expect(frames.pendingCount()).toBe(0)
  })

  it('preserves theme-owned fonts and restores the default font override', () => {
    const root = createThemeRoot()
    const setProperty = vi.spyOn(root.style, 'setProperty')
    const removeProperty = vi.spyOn(root.style, 'removeProperty')

    applyDocumentInterfaceTheme('qq98', 'Inter', root)
    expect(root.dataset.orcaTheme).toBe('qq98')
    expect(removeProperty).toHaveBeenCalledWith('--app-font-family')

    applyDocumentInterfaceTheme('default', 'Inter', root)
    expect(root.dataset.orcaTheme).toBe('default')
    expect(setProperty).toHaveBeenLastCalledWith(
      '--app-font-family',
      '"Inter", "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    )
  })
})
