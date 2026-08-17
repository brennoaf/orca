// @vitest-environment happy-dom

import '@testing-library/jest-dom/vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
const terminalHarness = vi.hoisted(() => ({
  instances: [] as {
    write: ReturnType<typeof vi.fn>
    writeCallbacks: (() => void)[]
    onDataListener: ((data: string) => void) | null
    dispose: ReturnType<typeof vi.fn>
    resize: ReturnType<typeof vi.fn>
    reset: ReturnType<typeof vi.fn>
    paste: ReturnType<typeof vi.fn>
    input: ReturnType<typeof vi.fn>
    scrollToTop: ReturnType<typeof vi.fn>
    scrollToBottom: ReturnType<typeof vi.fn>
    options: Record<string, unknown>
    selectAll: ReturnType<typeof vi.fn>
    modes: { bracketedPasteMode: boolean }
    selectionText: string
    customKeyHandler: ((event: KeyboardEvent) => boolean) | null
  }[],
  userInputListener: null as (() => void) | null,
  userInputDispose: vi.fn()
}))

const platformState = vi.hoisted(() => ({ value: 'linux' }))
const storeState = vi.hoisted(() => ({
  settings: null as GlobalSettings | null,
  keybindings: {} as Record<string, string[]>
}))

const imeHarness = vi.hoisted(() => ({
  forwarders: [] as {
    claimKeyEvent: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    sendInput: (data: string) => void
    getKittyKeyboardFlags: () => number
  }[],
  trackers: [] as { dispose: ReturnType<typeof vi.fn> }[],
  claimResult: false
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80
    rows = 24
    buffer = { active: { cursorY: 0 } }
    writeCallbacks: (() => void)[] = []
    onDataListener: ((data: string) => void) | null = null
    customKeyHandler: ((event: KeyboardEvent) => boolean) | null = null
    selectionText = ''
    write = vi.fn((_data: string, callback?: () => void) => {
      if (callback) {
        this.writeCallbacks.push(callback)
      }
    })
    open = vi.fn()
    focus = vi.fn()
    dispose = vi.fn()
    resize = vi.fn()
    reset = vi.fn()
    modes = { bracketedPasteMode: false }
    paste = vi.fn((data: string) => {
      terminalHarness.userInputListener?.()
      this.onDataListener?.(data)
    })
    input = vi.fn((data: string) => {
      terminalHarness.userInputListener?.()
      this.onDataListener?.(data)
    })
    element = document.createElement('div')
    unicode = { activeVersion: '6', versions: ['6', '11'], register: vi.fn() }
    loadAddon = vi.fn()
    attachCustomWheelEventHandler = vi.fn()
    scrollToTop = vi.fn()
    scrollToBottom = vi.fn()
    options: Record<string, unknown>
    selectAll = vi.fn()
    getSelection = vi.fn(() => this.selectionText)
    attachCustomKeyEventHandler = vi.fn((handler: (event: KeyboardEvent) => boolean) => {
      this.customKeyHandler = handler
    })
    onData = vi.fn((listener: (data: string) => void) => {
      this.onDataListener = listener
      return { dispose: vi.fn() }
    })

    constructor(options: Record<string, unknown> = {}) {
      this.options = { ...options }
      terminalHarness.instances.push(this)
    }
  }
}))
vi.mock(import('@/lib/pane-manager/pane-terminal-options'), async (importOriginal) => ({
  ...(await importOriginal()),
  buildDefaultTerminalOptions: () => ({})
}))
vi.mock('@/components/terminal-pane/terminal-user-input-signal', () => ({
  subscribeToTerminalUserInput: (_terminal: unknown, listener: () => void) => {
    terminalHarness.userInputListener = listener
    return { dispose: terminalHarness.userInputDispose }
  }
}))
vi.mock('@/components/terminal-pane/use-system-prefers-dark', () => ({
  useSystemPrefersDark: () => false
}))
vi.mock('@/lib/shortcut-platform', () => ({
  getShortcutPlatform: () => platformState.value
}))
vi.mock('@/components/terminal-pane/terminal-ime-native-text-forwarder', () => ({
  installTerminalImeNativeTextForwarder: (args: {
    sendInput: (data: string) => void
    getKittyKeyboardFlags?: () => number
  }) => {
    const forwarder = {
      claimKeyEvent: vi.fn(() => imeHarness.claimResult),
      dispose: vi.fn(),
      sendInput: args.sendInput,
      getKittyKeyboardFlags: args.getKittyKeyboardFlags ?? ((): number => 0)
    }
    imeHarness.forwarders.push(forwarder)
    return forwarder
  }
}))
vi.mock('@/components/terminal-pane/terminal-ime-composition-tracker', () => ({
  installTerminalImeCompositionTracker: () => {
    const tracker = { isActive: () => false, dispose: vi.fn() }
    imeHarness.trackers.push(tracker)
    return tracker
  }
}))
vi.mock('@/store', () => {
  const useAppStore = (selector: (s: typeof storeState) => unknown): unknown => selector(storeState)
  useAppStore.getState = (): typeof storeState => storeState
  return { useAppStore }
})

import { AgentTerminalPreview } from './AgentTerminalPreview'

describe('AgentTerminalPreview', () => {
  const input = vi.fn(async (_ptyId: string, _data: string) => true)
  const fit = vi.fn(async (_ptyId: string, cols: number, rows: number) => ({ cols, rows }))
  const ack = vi.fn(async () => {})
  const unsubscribe = vi.fn(async () => {})
  const connect = vi.fn()
  const readClipboardText = vi.fn(async () => 'clip-text')
  const writeClipboardText = vi.fn(async () => {})
  const writeTerminalClipboardText = vi.fn(async () => {})
  let emitData: ((payload: unknown) => void) | null

  beforeEach(() => {
    terminalHarness.instances.length = 0
    terminalHarness.userInputListener = null
    platformState.value = 'linux'
    storeState.keybindings = {}
    storeState.settings = null
    imeHarness.forwarders.length = 0
    imeHarness.trackers.length = 0
    imeHarness.claimResult = false
    emitData = null
    connect.mockResolvedValue({
      snapshot: { data: '', cols: 80, rows: 24, seq: 1 },
      replay: []
    })
    readClipboardText.mockResolvedValue('clip-text')
    Object.assign(window, {
      api: {
        terminalPreview: {
          connect,
          input,
          fit,
          ack,
          unsubscribe,
          onData: (listener: (payload: unknown) => void) => {
            emitData = listener
            return vi.fn()
          }
        },
        ui: {
          readClipboardText,
          writeClipboardText,
          writeTerminalClipboardText,
          onAppMenuPaste: (_listener: () => void) => vi.fn(),
          onAppMenuSelectionAction: (_listener: (action: 'copy' | 'select-all') => void) => vi.fn(),
          performNativeSelectionAction: vi.fn()
        }
      }
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })
  it('keeps the existing terminal visible while a resync snapshot is captured', async () => {
    let resolveRefresh!: (value: {
      snapshot: { data: string; cols: number; rows: number; seq: number }
      replay: string[]
    }) => void
    connect
      .mockResolvedValueOnce({
        snapshot: { data: 'first', cols: 80, rows: 24, seq: 1 },
        replay: []
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve
          })
      )
    const view = render(<AgentTerminalPreview ptyId="pty-1" />)
    await waitFor(() => expect(terminalHarness.instances).toHaveLength(1))
    const terminal = terminalHarness.instances[0]!

    act(() => emitData?.({ type: 'resync', ptyId: 'pty-1' }))
    await waitFor(() => expect(connect).toHaveBeenCalledTimes(2))
    expect(terminalHarness.instances).toHaveLength(1)
    expect(terminal.dispose).not.toHaveBeenCalled()
    expect(terminal.reset).not.toHaveBeenCalled()
    expect(view.queryByText(/No live terminal/)).not.toBeInTheDocument()

    await act(async () => {
      resolveRefresh({
        snapshot: { data: 'second', cols: 100, rows: 30, seq: 2 },
        replay: []
      })
    })
    await waitFor(() => expect(terminal.reset).toHaveBeenCalledTimes(1))
    expect(terminal.resize).toHaveBeenCalledWith(100, 30)
    expect(terminalHarness.instances).toHaveLength(1)
    expect(terminal.dispose).not.toHaveBeenCalled()
    expect(view.queryByText(/No live terminal/)).not.toBeInTheDocument()
  })

  it('disposes a stale terminal when resync confirms the pty is gone', async () => {
    connect
      .mockResolvedValueOnce({
        snapshot: { data: 'first', cols: 80, rows: 24, seq: 1 },
        replay: []
      })
      .mockResolvedValueOnce({ snapshot: null, replay: [] })
    const view = render(<AgentTerminalPreview ptyId="pty-1" />)
    await waitFor(() => expect(terminalHarness.instances).toHaveLength(1))
    const terminal = terminalHarness.instances[0]!

    act(() => emitData?.({ type: 'resync', ptyId: 'pty-1' }))

    await waitFor(() => expect(view.getByText(/No live terminal/)).toBeInTheDocument())
    expect(terminal.dispose).toHaveBeenCalledTimes(1)
    expect(terminalHarness.userInputDispose).toHaveBeenCalledTimes(1)
    expect(unsubscribe).toHaveBeenCalledWith('pty-1')
  })

  it('connects a replacement pty after the previous pty was gone', async () => {
    connect.mockResolvedValueOnce({ snapshot: null, replay: [] }).mockResolvedValueOnce({
      snapshot: { data: 'replacement', cols: 80, rows: 24, seq: 1 },
      replay: []
    })
    const view = render(<AgentTerminalPreview ptyId="pty-gone" />)
    await waitFor(() => expect(view.getByText(/No live terminal/)).toBeInTheDocument())

    view.rerender(<AgentTerminalPreview ptyId="pty-live" />)

    await waitFor(() => expect(terminalHarness.instances).toHaveLength(1))
    expect(connect).toHaveBeenLastCalledWith('pty-live', { scrollbackRows: 24 })
    expect(view.queryByText(/No live terminal/)).not.toBeInTheDocument()
  })

  it('claims a grid sized to the dialog box and never re-requests an unchanged target', async () => {
    vi.useFakeTimers()
    const view = render(<AgentTerminalPreview ptyId="pty-1" />)
    await vi.waitFor(() => expect(terminalHarness.instances).toHaveLength(1))

    const host = view.container.querySelector<HTMLElement>('.origin-bottom-left')!
    const box = host.parentElement!
    Object.defineProperty(box, 'clientWidth', { configurable: true, value: 900 })
    Object.defineProperty(box, 'clientHeight', { configurable: true, value: 480 })
    const screen = document.createElement('div')
    screen.className = 'xterm-screen'
    Object.defineProperty(screen, 'offsetWidth', { configurable: true, value: 800 })
    Object.defineProperty(screen, 'offsetHeight', { configurable: true, value: 384 })
    host.appendChild(screen)

    await vi.advanceTimersByTimeAsync(200)
    expect(fit).toHaveBeenCalledTimes(1)
    expect(fit).toHaveBeenCalledWith('pty-1', 90, 30)

    // A reconnect (e.g. the host reclaiming the grid) computes the same
    act(() => emitData?.({ type: 'resync', ptyId: 'pty-1' }))
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(2))
    await vi.advanceTimersByTimeAsync(400)
    expect(fit).toHaveBeenCalledTimes(1)
  })

  it('delays repeated capture after an overflow and cancels the retry on unmount', async () => {
    vi.useFakeTimers()
    connect.mockResolvedValue({
      snapshot: { data: 'screen', cols: 80, rows: 24, seq: 1 },
      replay: [],
      resyncRequired: true
    })
    const view = render(<AgentTerminalPreview ptyId="pty-1" />)
    await vi.waitFor(() => expect(terminalHarness.instances).toHaveLength(1))
    const terminal = terminalHarness.instances[0]!
    expect(connect).toHaveBeenCalledTimes(1)

    act(() => terminal.writeCallbacks.splice(0).forEach((callback) => callback()))
    await vi.advanceTimersByTimeAsync(149)
    expect(connect).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(connect).toHaveBeenCalledTimes(2)

    act(() => terminal.writeCallbacks.splice(0).forEach((callback) => callback()))
    view.unmount()
    await vi.advanceTimersByTimeAsync(150)
    expect(connect).toHaveBeenCalledTimes(2)
  })
})
