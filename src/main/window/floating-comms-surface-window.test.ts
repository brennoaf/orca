import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    showInactive = vi.fn(() => {
      const wasVisible = this.visible
      this.visible = true
      if (!wasVisible) {
        this.emit('show')
      }
    })
    setBounds = vi.fn()
    bounds: Electron.Rectangle
    contentBounds: Electron.Rectangle
    loadURL = vi.fn()
    loadFile = vi.fn()
    constructor(options: Electron.BrowserWindowConstructorOptions) {
      super()
      this.options = options
      this.bounds = { x: 100, y: 40, width: 1_000, height: 720 }
      this.contentBounds = { x: 100, y: 50, width: 1_000, height: 700 }
      FakeWindow.instances.push(this)
    }
    isDestroyed(): boolean {
      return this.destroyed
    }
    isVisible(): boolean {
      return this.visible
    }
    getContentBounds(): Electron.Rectangle {
      return this.contentBounds
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
    getAllDisplays: vi.fn(() => [
      {
        bounds: { x: 0, y: 0, width: 1_920, height: 1_080 },
        workArea: { x: 0, y: 0, width: 1_920, height: 1_080 }
      }
    ])
  })
  const app = new Emitter()
  return {
    FakeWindow,
    parent,
    trustedOwner: parent as FakeWindow | null,
    screen,
    app,
    send: vi.fn(),
    installPolicy: vi.fn()
  }
})

vi.mock('electron', () => ({
  app: mocks.app,
  BrowserWindow: mocks.FakeWindow,
  screen: mocks.screen
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
vi.mock('../ipc/ui', () => ({
  getTrustedUIRendererWindow: () => mocks.trustedOwner,
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
  resizeFloatingCommsSurface,
  updateFloatingCommsSurface
} from './floating-comms-surface-window'

const request = {
  appId: 'discord' as const,
  requestId: 1,
  anchor: { x: 400, y: 100, width: 40, height: 40 },
  workspace: { x: 400, y: 80, width: 400, height: 500 },
  height: 300
}
const identityFor = (appId: 'discord' | 'slack', requestId: number) => ({
  appId,
  requestId,
  surfaceId: requestId,
  mode: 'attached-native' as const
})
const owner = mocks.parent as unknown as Electron.BrowserWindow

describe('floating communications BrowserWindow', () => {
  function surface(): InstanceType<typeof mocks.FakeWindow> {
    const window = mocks.FakeWindow.instances[0]
    if (!window) {
      throw new Error('Floating communications window was not created')
    }
    return window
  }

  function latestGeometryRequest(): {
    appId: 'discord' | 'slack' | 'whatsapp-web'
    requestId: number
    geometryRequestId: number
  } {
    const call = mocks.parent.webContents.send.mock.calls.findLast(
      ([channel]) => channel === 'floatingComms:geometryRequested'
    )
    if (!call) {
      throw new Error('Geometry request was not sent')
    }
    return call[1] as {
      appId: 'discord' | 'slack' | 'whatsapp-web'
      requestId: number
      geometryRequestId: number
    }
  }

  beforeEach(() => vi.useFakeTimers())

  afterEach(() => {
    destroyFloatingCommsSurface()
    mocks.FakeWindow.instances.length = 0
    vi.clearAllMocks()
    mocks.parent.bounds = { x: 100, y: 40, width: 1_000, height: 720 }
    mocks.parent.contentBounds = { x: 100, y: 50, width: 1_000, height: 700 }
    mocks.parent.webContents.zoomFactor = 1
    mocks.trustedOwner = mocks.parent
    mocks.screen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1_920, height: 1_080 },
        workArea: { x: 0, y: 0, width: 1_920, height: 1_080 }
      }
    ])
    vi.useRealTimers()
  })

  it('reuses one hardened child and tears it down with its parent', () => {
    openFloatingCommsSurface(owner, request)
    openFloatingCommsSurface(owner, { ...request, appId: 'slack', requestId: 2 })
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
    openFloatingCommsSurface(owner, request)
    const child = surface()
    expect(child.show).not.toHaveBeenCalled()
    child.webContents.emit('did-finish-load')
    expect(child.webContents.send).toHaveBeenCalledWith('floatingComms:stateChanged', {
      ...identityFor('discord', 1)
    })
    expect(child.show).not.toHaveBeenCalled()

    resizeFloatingCommsSurface(1, 240)
    expect(child.show).toHaveBeenCalledOnce()
    expect(child.focus).toHaveBeenCalledOnce()
    expect(isFloatingCommsSurfaceVisible()).toBe(true)
    expect(child.webContents.send).toHaveBeenCalledWith('floatingComms:visibilityChanged', {
      ...identityFor('discord', 1),
      visible: true
    })
    resizeFloatingCommsSurface(1, 260)
    expect(child.focus).toHaveBeenCalledOnce()

    closeFloatingCommsSurface()
    expect(isFloatingCommsSurfaceVisible()).toBe(false)
    expect(child.webContents.send).toHaveBeenCalledWith('floatingComms:visibilityChanged', {
      ...identityFor('discord', 1),
      visible: false
    })
  })

  it('invalidates the current request when it closes before its first measure', () => {
    openFloatingCommsSurface(owner, request)
    const child = surface()
    child.webContents.emit('did-finish-load')
    child.webContents.send.mockClear()

    closeFloatingCommsSurface(1)

    expect(child.show).not.toHaveBeenCalled()
    expect(child.webContents.send).toHaveBeenCalledExactlyOnceWith(
      'floatingComms:visibilityChanged',
      { ...identityFor('discord', 1), visible: false }
    )
    expect(getFloatingCommsSurfaceIdentity()).toBeNull()
    expect(isFloatingCommsSurfaceVisible()).toBe(false)
  })

  it('invalidates a replacement request without replaying the previous visible identity', () => {
    openFloatingCommsSurface(owner, request)
    const child = surface()
    child.webContents.emit('did-finish-load')
    resizeFloatingCommsSurface(1, 300)
    openFloatingCommsSurface(owner, { ...request, appId: 'slack', requestId: 2 })
    child.webContents.send.mockClear()

    closeFloatingCommsSurface(2)

    expect(child.webContents.send).toHaveBeenCalledExactlyOnceWith(
      'floatingComms:visibilityChanged',
      { ...identityFor('slack', 2), visible: false }
    )
  })

  it('closes on Escape', () => {
    openFloatingCommsSurface(owner, request, identityFor('discord', 1), {
      onClosed: () => void 0,
      onFallback: (identity) => mocks.send('floatingComms:fallback', identity)
    })
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
  })

  it('moves safely with its owner and waits for fresh renderer geometry after resize', () => {
    openFloatingCommsSurface(owner, request)
    const child = surface()
    child.webContents.emit('did-finish-load')
    resizeFloatingCommsSurface(1, 300)
    child.setBounds.mockClear()
    child.hide.mockClear()

    mocks.parent.contentBounds = { ...mocks.parent.contentBounds, x: 600 }
    mocks.parent.emit('move')
    const moved = child.setBounds.mock.calls[0]?.[0] as Electron.Rectangle | undefined
    expect(moved).toBeDefined()
    expect(moved?.x).toBeGreaterThanOrEqual(600)
    expect((moved?.x ?? 0) + (moved?.width ?? 0)).toBeLessThanOrEqual(1_600)

    mocks.parent.emit('resize')
    expect(child.hide).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(80)
    const geometryRequest = latestGeometryRequest()
    expect(
      updateFloatingCommsSurface(owner, {
        ...request,
        geometryRequestId: geometryRequest.geometryRequestId
      })
    ).toBe(true)
    expect(child.showInactive).toHaveBeenCalledOnce()
    expect(child.focus).toHaveBeenCalledOnce()
  })

  it('debounces geometry storms, rejects superseded replies, and requests after a final resize', () => {
    openFloatingCommsSurface(owner, request)
    const child = surface()
    child.webContents.emit('did-finish-load')
    resizeFloatingCommsSurface(1, 300)
    mocks.parent.webContents.send.mockClear()

    mocks.parent.emit('resize')
    mocks.parent.emit('maximize')
    mocks.parent.emit('resize')
    vi.advanceTimersByTime(79)
    expect(mocks.parent.webContents.send).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    const firstGeometryRequest = latestGeometryRequest()
    expect(
      updateFloatingCommsSurface(owner, {
        ...request,
        geometryRequestId: firstGeometryRequest.geometryRequestId
      })
    ).toBe(true)

    mocks.parent.emit('resize')
    expect(
      updateFloatingCommsSurface(owner, {
        ...request,
        geometryRequestId: firstGeometryRequest.geometryRequestId
      })
    ).toBeNull()
    vi.advanceTimersByTime(80)
    const finalGeometryRequest = latestGeometryRequest()
    expect(finalGeometryRequest.geometryRequestId).toBeGreaterThan(
      firstGeometryRequest.geometryRequestId
    )
  })

  it('ignores unrelated display scale changes and refreshes for the workspace display', () => {
    openFloatingCommsSurface(owner, request)
    const child = surface()
    child.webContents.emit('did-finish-load')
    resizeFloatingCommsSurface(1, 300)
    child.hide.mockClear()
    mocks.parent.webContents.send.mockClear()

    mocks.screen.emit(
      'display-metrics-changed',
      {},
      {
        bounds: { x: 3_000, y: 0, width: 1_920, height: 1_080 },
        workArea: { x: 3_000, y: 0, width: 1_920, height: 1_080 }
      },
      ['scaleFactor']
    )
    vi.advanceTimersByTime(80)
    expect(child.hide).not.toHaveBeenCalled()
    expect(mocks.parent.webContents.send).not.toHaveBeenCalled()

    mocks.screen.emit(
      'display-metrics-changed',
      {},
      {
        bounds: { x: 0, y: 0, width: 1_920, height: 1_080 },
        workArea: { x: 0, y: 0, width: 1_920, height: 1_080 }
      },
      ['scaleFactor']
    )
    expect(child.hide).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(80)
    expect(latestGeometryRequest()).toMatchObject({ appId: 'discord', requestId: 1 })
  })

  it('destroys the suspended surface before fallback when fresh geometry times out', () => {
    openFloatingCommsSurface(owner, request, identityFor('discord', 1), {
      onClosed: () => void 0,
      onFallback: (identity) => mocks.send('floatingComms:fallback', identity)
    })
    const child = surface()
    child.webContents.emit('did-finish-load')
    resizeFloatingCommsSurface(1, 300)

    mocks.parent.emit('resize')
    vi.advanceTimersByTime(80)
    latestGeometryRequest()
    vi.advanceTimersByTime(500)

    expect(child.destroy).toHaveBeenCalledOnce()
    expect(mocks.send).toHaveBeenCalledWith('floatingComms:fallback', {
      ...identityFor('discord', 1),
      mode: 'attached-dom'
    })
    expect(child.destroy.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.send.mock.invocationCallOrder[0] ?? 0
    )
  })

  it('records the first measure while suspended and reveals only after fresh geometry', () => {
    openFloatingCommsSurface(owner, request)
    const child = surface()
    child.webContents.emit('did-finish-load')

    mocks.parent.emit('resize')
    resizeFloatingCommsSurface(1, 260)
    expect(child.show).not.toHaveBeenCalled()
    expect(child.showInactive).not.toHaveBeenCalled()
    vi.advanceTimersByTime(80)
    const geometryRequest = latestGeometryRequest()

    expect(
      updateFloatingCommsSurface(owner, {
        ...request,
        height: 260,
        geometryRequestId: geometryRequest.geometryRequestId
      })
    ).toBe(true)
    expect(child.show).toHaveBeenCalledOnce()
    expect(child.showInactive).not.toHaveBeenCalled()
    expect(child.focus).toHaveBeenCalledOnce()
  })

  it('does not create a child when neither workspace side has room inside Orca', () => {
    const blocked = {
      ...request,
      anchor: { ...request.anchor, x: 300 },
      workspace: { ...request.workspace, x: 300, width: 500 }
    }

    expect(openFloatingCommsSurface(owner, blocked)).toBe(false)
    expect(mocks.FakeWindow.instances).toHaveLength(0)
    expect(mocks.parent.handlers.get('move') ?? []).toHaveLength(0)
  })

  it('uses fallback for the restored offscreen parent at reduced renderer zoom', () => {
    mocks.parent.contentBounds = { x: -500, y: 0, width: 1_000, height: 700 }
    mocks.parent.webContents.zoomFactor = 2 / 3
    mocks.screen.getAllDisplays.mockReturnValue([
      {
        bounds: { x: 0, y: 0, width: 1_920, height: 1_200 },
        workArea: { x: 0, y: 0, width: 1_920, height: 1_200 }
      }
    ])
    const offscreen = {
      ...request,
      anchor: { ...request.anchor, x: 200 },
      workspace: { ...request.workspace, x: 200, width: 500 }
    }

    expect(openFloatingCommsSurface(owner, { ...offscreen, height: 262 })).toBe(false)
    expect(mocks.FakeWindow.instances).toHaveLength(0)
  })

  it('destroys before fallback when fresh workspace geometry loses both sides', () => {
    expect(
      openFloatingCommsSurface(owner, request, identityFor('discord', 1), {
        onClosed: () => void 0,
        onFallback: (identity) => mocks.send('floatingComms:fallback', identity)
      })
    ).toBe(true)
    const child = surface()
    const blocked = {
      ...request,
      anchor: { ...request.anchor, x: 300 },
      workspace: { ...request.workspace, x: 300, width: 500 }
    }

    expect(updateFloatingCommsSurface(owner, { ...blocked, geometryRequestId: null })).toBe(false)
    expect(child.destroy).toHaveBeenCalledOnce()
    expect(child.show).not.toHaveBeenCalled()
    expect(mocks.send).toHaveBeenCalledWith('floatingComms:fallback', {
      ...identityFor('discord', 1),
      mode: 'attached-dom'
    })
    expect(mocks.send).not.toHaveBeenCalledWith('floatingComms:closed', null)
    expect(child.destroy.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.send.mock.invocationCallOrder[0] ?? 0
    )
    expect(mocks.parent.handlers.get('move') ?? []).toHaveLength(0)
    expect(mocks.screen.handlers.get('display-metrics-changed') ?? []).toHaveLength(0)
  })

  it('rejects stale and foreign-owner updates and destroys on owner loss', () => {
    openFloatingCommsSurface(owner, request)
    const child = surface()
    expect(
      updateFloatingCommsSurface(owner, { ...request, requestId: 2, geometryRequestId: null })
    ).toBeNull()
    expect(child.destroy).not.toHaveBeenCalled()

    const replacementOwner = new mocks.FakeWindow({})
    mocks.trustedOwner = replacementOwner
    expect(
      updateFloatingCommsSurface(replacementOwner as unknown as Electron.BrowserWindow, {
        ...request,
        geometryRequestId: null
      })
    ).toBeNull()
    expect(child.destroy).toHaveBeenCalledOnce()
  })

  it('ignores stale close and blur events after reopening the same app', () => {
    openFloatingCommsSurface(owner, request)
    const child = surface()
    child.webContents.emit('did-finish-load')
    resizeFloatingCommsSurface(1, 420)

    openFloatingCommsSurface(owner, { ...request, requestId: 2 })
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
    openFloatingCommsSurface(owner, request)
    const first = surface()
    destroyFloatingCommsSurface()
    openFloatingCommsSurface(owner, { ...request, appId: 'slack', requestId: 2 })
    const second = mocks.FakeWindow.instances[1]
    if (!second) {
      throw new Error('Replacement communications window was not created')
    }

    first.webContents.emit('did-finish-load')
    first.emit('show')
    first.emit('hide')
    first.emit('closed')

    expect(getFloatingCommsSurfaceIdentity()).toEqual(identityFor('slack', 2))
    second.webContents.emit('did-finish-load')
    resizeFloatingCommsSurface(2, 300)
    expect(second.show).toHaveBeenCalledOnce()
    expect(second.focus).toHaveBeenCalledOnce()
  })
})
