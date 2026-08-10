import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  class Emitter {
    handlers = new Map<string, ((...args: unknown[]) => void)[]>()
    on(event: string, handler: (...args: unknown[]) => void): this {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler])
      return this
    }
    once(event: string, handler: (...args: unknown[]) => void): this {
      return this.on(event, handler)
    }
    removeListener(event: string, handler: (...args: unknown[]) => void): this {
      this.handlers.set(
        event,
        (this.handlers.get(event) ?? []).filter((candidate) => candidate !== handler)
      )
      return this
    }
    emit(event: string, ...args: unknown[]): void {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(...args)
      }
    }
  }

  class FakeWebContents extends Emitter {
    destroyed = false
    zoomFactor = 1
    send = vi.fn()
    session = {
      setPermissionRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn()
    }
    isDestroyed = (): boolean => this.destroyed
    isLoading = (): boolean => false
    getZoomFactor = (): number => this.zoomFactor
  }

  class FakeWindow extends Emitter {
    static instances: FakeWindow[] = []
    options: Electron.BrowserWindowConstructorOptions
    destroyed = false
    visible = false
    webContents = new FakeWebContents()
    hide = vi.fn(() => {
      const wasVisible = this.visible
      this.visible = false
      if (wasVisible) {
        this.emit('hide')
      }
    })
    show = vi.fn(() => {
      const wasVisible = this.visible
      this.visible = true
      if (!wasVisible) {
        this.emit('show')
      }
    })
    focus = vi.fn()
    setBounds = vi.fn()
    bounds: Electron.Rectangle
    loadURL = vi.fn()
    loadFile = vi.fn()
    constructor(options: Electron.BrowserWindowConstructorOptions) {
      super()
      this.options = options
      this.bounds = { x: 100, y: 40, width: 1_000, height: 720 }
      FakeWindow.instances.push(this)
    }
    isDestroyed(): boolean {
      return this.destroyed
    }
    isVisible(): boolean {
      return this.visible
    }
    getContentBounds(): Electron.Rectangle {
      return { x: 100, y: 50, width: 1_000, height: 700 }
    }
    getBounds(): Electron.Rectangle {
      return this.bounds
    }
    destroy = vi.fn(() => {
      this.destroyed = true
      this.webContents.destroyed = true
      this.emit('closed')
    })
  }

  const parent = new FakeWindow({})
  FakeWindow.instances.length = 0
  const screen = Object.assign(new Emitter(), {
    getDisplayMatching: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1_920, height: 1_080 } }))
  })
  const app = new Emitter()
  return { FakeWindow, parent, screen, app, send: vi.fn(), installPolicy: vi.fn() }
})

vi.mock('electron', () => ({
  app: mocks.app,
  BrowserWindow: mocks.FakeWindow,
  screen: mocks.screen
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('../ipc/ui', () => ({
  getTrustedUIRendererWindow: () => mocks.parent,
  sendToTrustedUIRenderer: mocks.send
}))
vi.mock('./privileged-window-navigation', () => ({
  installPrivilegedWindowNavigationPolicy: mocks.installPolicy
}))

import {
  closeFloatingCommsSurface,
  destroyFloatingCommsSurface,
  getFloatingCommsSurfaceIdentity,
  isFloatingCommsSurfaceVisible,
  openFloatingCommsSurface,
  resizeFloatingCommsSurface
} from './floating-comms-surface-window'

const request = {
  appId: 'discord' as const,
  requestId: 1,
  anchor: { x: 200, y: 100, width: 40, height: 40 },
  height: 300
}

describe('floating communications BrowserWindow', () => {
  function surface(): InstanceType<typeof mocks.FakeWindow> {
    const window = mocks.FakeWindow.instances[0]
    if (!window) {
      throw new Error('Floating communications window was not created')
    }
    return window
  }

  afterEach(() => {
    destroyFloatingCommsSurface()
    mocks.FakeWindow.instances.length = 0
    vi.clearAllMocks()
    mocks.parent.bounds = { x: 100, y: 40, width: 1_000, height: 720 }
    mocks.parent.webContents.zoomFactor = 1
    mocks.screen.getDisplayMatching.mockReturnValue({
      workArea: { x: 0, y: 0, width: 1_920, height: 1_080 }
    })
  })

  it('reuses one hardened child and tears it down with its parent', () => {
    openFloatingCommsSurface(request)
    openFloatingCommsSurface({ ...request, appId: 'slack', requestId: 2 })
    expect(mocks.FakeWindow.instances).toHaveLength(1)
    const child = surface()
    expect(child.options).toMatchObject({
      parent: mocks.parent,
      width: 320,
      height: 420,
      modal: false,
      frame: false,
      transparent: true,
      resizable: false,
      focusable: true,
      skipTaskbar: true,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false
      }
    })
    expect(mocks.installPolicy).toHaveBeenCalledWith(child.webContents)
    expect(child.webContents.session.setPermissionRequestHandler).toHaveBeenCalledOnce()
    expect(child.webContents.session.setPermissionCheckHandler).toHaveBeenCalledOnce()
    child.webContents.emit('did-finish-load')
    resizeFloatingCommsSurface(2, 300)
    child.emit('blur')
    expect(child.hide).toHaveBeenCalled()
    mocks.parent.emit('closed')
    expect(child.destroy).toHaveBeenCalledOnce()
    expect(mocks.parent.handlers.get('move') ?? []).toHaveLength(0)
    expect(mocks.parent.handlers.get('resize') ?? []).toHaveLength(0)
    expect(mocks.screen.handlers.get('display-metrics-changed') ?? []).toHaveLength(0)
    expect(mocks.app.handlers.get('before-quit') ?? []).toHaveLength(0)
  })

  it('waits for measured content before showing and focuses only on first reveal', () => {
    openFloatingCommsSurface(request)
    const child = surface()
    expect(child.show).not.toHaveBeenCalled()
    child.webContents.emit('did-finish-load')
    expect(child.webContents.send).toHaveBeenCalledWith('floatingComms:stateChanged', {
      appId: 'discord',
      requestId: 1
    })
    expect(child.show).not.toHaveBeenCalled()

    resizeFloatingCommsSurface(1, 240)
    expect(child.show).toHaveBeenCalledOnce()
    expect(child.focus).toHaveBeenCalledOnce()
    expect(isFloatingCommsSurfaceVisible()).toBe(true)
    expect(child.webContents.send).toHaveBeenCalledWith('floatingComms:visibilityChanged', {
      appId: 'discord',
      requestId: 1,
      visible: true
    })
    resizeFloatingCommsSurface(1, 260)
    expect(child.focus).toHaveBeenCalledOnce()

    closeFloatingCommsSurface()
    expect(isFloatingCommsSurfaceVisible()).toBe(false)
    expect(child.webContents.send).toHaveBeenCalledWith('floatingComms:visibilityChanged', {
      appId: 'discord',
      requestId: 1,
      visible: false
    })
  })

  it('invalidates the current request when it closes before its first measure', () => {
    openFloatingCommsSurface(request)
    const child = surface()
    child.webContents.emit('did-finish-load')
    child.webContents.send.mockClear()

    closeFloatingCommsSurface(1)

    expect(child.show).not.toHaveBeenCalled()
    expect(child.webContents.send).toHaveBeenCalledExactlyOnceWith(
      'floatingComms:visibilityChanged',
      { appId: 'discord', requestId: 1, visible: false }
    )
    expect(getFloatingCommsSurfaceIdentity()).toBeNull()
    expect(isFloatingCommsSurfaceVisible()).toBe(false)
  })

  it('invalidates a replacement request without replaying the previous visible identity', () => {
    openFloatingCommsSurface(request)
    const child = surface()
    child.webContents.emit('did-finish-load')
    resizeFloatingCommsSurface(1, 300)
    openFloatingCommsSurface({ ...request, appId: 'slack', requestId: 2 })
    child.webContents.send.mockClear()

    closeFloatingCommsSurface(2)

    expect(child.webContents.send).toHaveBeenCalledExactlyOnceWith(
      'floatingComms:visibilityChanged',
      { appId: 'slack', requestId: 2, visible: false }
    )
  })

  it('closes on Escape and follows parent and display geometry changes', () => {
    openFloatingCommsSurface(request)
    const child = surface()
    child.webContents.emit('did-finish-load')
    resizeFloatingCommsSurface(1, 300)
    child.hide.mockClear()
    const keyboardEvent = { preventDefault: vi.fn() }
    child.webContents.emit('before-input-event', keyboardEvent, {
      type: 'keyDown',
      key: 'Escape'
    })
    expect(keyboardEvent.preventDefault).toHaveBeenCalledOnce()
    expect(child.hide).toHaveBeenCalledOnce()

    openFloatingCommsSurface(request)
    child.setBounds.mockClear()
    mocks.parent.emit('move')
    mocks.parent.emit('resize')
    mocks.screen.emit('display-metrics-changed')
    expect(child.setBounds).toHaveBeenCalledTimes(3)
  })

  it('does not create a child when neither side of the parent has room', () => {
    mocks.parent.bounds = { x: 326, y: 0, width: 1_940, height: 900 }
    mocks.screen.getDisplayMatching.mockReturnValue({
      workArea: { x: 0, y: 0, width: 2_560, height: 1_440 }
    })

    expect(openFloatingCommsSurface(request)).toBe(false)
    expect(mocks.FakeWindow.instances).toHaveLength(0)
    expect(mocks.parent.handlers.get('move') ?? []).toHaveLength(0)
  })

  it('uses fallback for the restored offscreen parent at reduced renderer zoom', () => {
    mocks.parent.bounds = { x: 326, y: 204, width: 1_936, height: 1_208 }
    mocks.parent.webContents.zoomFactor = 2 / 3
    mocks.screen.getDisplayMatching.mockReturnValue({
      workArea: { x: 0, y: 0, width: 1_920, height: 1_200 }
    })

    expect(openFloatingCommsSurface({ ...request, height: 262 })).toBe(false)
    expect(mocks.FakeWindow.instances).toHaveLength(0)
  })

  it('repositions outside the parent and switches to fallback if that becomes impossible', () => {
    expect(openFloatingCommsSurface(request)).toBe(true)
    const child = surface()

    mocks.parent.bounds = { x: 600, y: 40, width: 1_000, height: 720 }
    child.setBounds.mockClear()
    mocks.parent.emit('move')
    const placement = child.setBounds.mock.calls[0]?.[0] as Electron.Rectangle | undefined
    expect(placement).toBeDefined()
    expect((placement?.x ?? 0) + (placement?.width ?? 0)).toBeLessThanOrEqual(592)

    mocks.parent.bounds = { x: 300, y: 40, width: 1_320, height: 720 }
    mocks.parent.emit('move')
    expect(child.destroy).toHaveBeenCalledOnce()
    expect(child.show).not.toHaveBeenCalled()
    expect(mocks.send).toHaveBeenCalledWith('floatingComms:fallback', {
      appId: 'discord',
      requestId: 1
    })
    expect(mocks.send).not.toHaveBeenCalledWith('floatingComms:closed', null)
    expect(child.destroy.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.send.mock.invocationCallOrder[0] ?? 0
    )
    expect(mocks.parent.handlers.get('move') ?? []).toHaveLength(0)
    expect(mocks.screen.handlers.get('display-metrics-changed') ?? []).toHaveLength(0)
  })

  it('ignores stale close and blur events after reopening the same app', () => {
    openFloatingCommsSurface(request)
    const child = surface()
    child.webContents.emit('did-finish-load')
    resizeFloatingCommsSurface(1, 420)

    openFloatingCommsSurface({ ...request, requestId: 2 })
    expect(isFloatingCommsSurfaceVisible()).toBe(false)
    closeFloatingCommsSurface(1)
    child.emit('blur')
    expect(child.hide).not.toHaveBeenCalled()

    resizeFloatingCommsSurface(2, 420)
    expect(isFloatingCommsSurfaceVisible()).toBe(true)
    expect(child.focus).toHaveBeenCalledTimes(2)
    closeFloatingCommsSurface(2)
    expect(child.hide).toHaveBeenCalledOnce()
  })

  it('ignores delayed lifecycle events from a replaced BrowserWindow', () => {
    openFloatingCommsSurface(request)
    const first = surface()
    destroyFloatingCommsSurface()
    openFloatingCommsSurface({ ...request, appId: 'slack', requestId: 2 })
    const second = mocks.FakeWindow.instances[1]
    if (!second) {
      throw new Error('Replacement communications window was not created')
    }

    first.webContents.emit('did-finish-load')
    first.emit('show')
    first.emit('hide')
    first.emit('closed')

    expect(getFloatingCommsSurfaceIdentity()).toEqual({ appId: 'slack', requestId: 2 })
    second.webContents.emit('did-finish-load')
    resizeFloatingCommsSurface(2, 300)
    expect(second.show).toHaveBeenCalledOnce()
    expect(second.focus).toHaveBeenCalledOnce()
  })
})
