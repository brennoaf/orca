import type { Constructable, Procedure } from '@vitest/spy'
import { vi, type Mock } from 'vitest'

type CompactHostMock = Mock<Constructable | Procedure>

type CompactHostMocks = {
  windows: Map<
    number,
    {
      isDestroyed: () => boolean
      once: CompactHostMock
      removeListener: CompactHostMock
      getContentBounds: () => { x: number; y: number; width: number; height: number }
      contentView: { addChildView: CompactHostMock; removeChildView: CompactHostMock }
    }
  >
  webContents: {
    isDestroyed: CompactHostMock
    setWindowOpenHandler: CompactHostMock
    on: CompactHostMock
    loadURL: CompactHostMock
    insertCSS: CompactHostMock
    removeInsertedCSS: CompactHostMock
    executeJavaScript: CompactHostMock
    executeJavaScriptInIsolatedWorld: CompactHostMock
    close: CompactHostMock
  }
  view: {
    setBounds: CompactHostMock
    setVisible: CompactHostMock
    webContents: CompactHostMocks['webContents']
  }
  WebContentsView: CompactHostMock
  resolveKnownPartition: CompactHostMock
  createProfile: CompactHostMock
}

type CompactHostSender = { id: number; isDestroyed: () => boolean; send: CompactHostMock }
type CompactHostStore = {
  getUI: CompactHostMock
  updateUI: CompactHostMock
  onUIChanged: CompactHostMock
}

export const mocks: CompactHostMocks = (() => {
  const windows = new Map<
    number,
    {
      isDestroyed: () => boolean
      once: ReturnType<typeof vi.fn>
      removeListener: ReturnType<typeof vi.fn>
      getContentBounds: () => { x: number; y: number; width: number; height: number }
      contentView: {
        addChildView: ReturnType<typeof vi.fn>
        removeChildView: ReturnType<typeof vi.fn>
      }
    }
  >()
  const webContents = {
    isDestroyed: vi.fn(() => false),
    setWindowOpenHandler: vi.fn(),
    on: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    insertCSS: vi.fn(() => Promise.resolve('css-key')),
    removeInsertedCSS: vi.fn(() => Promise.resolve()),
    executeJavaScript: vi.fn(() => Promise.resolve('qr')),
    executeJavaScriptInIsolatedWorld: vi.fn<() => Promise<unknown>>(() => Promise.resolve('qr')),
    close: vi.fn()
  }
  return {
    windows,
    webContents,
    view: { setBounds: vi.fn(), setVisible: vi.fn(), webContents },
    WebContentsView: vi.fn(function () {
      return mocks.view
    }),
    resolveKnownPartition: vi.fn<(id: string) => string | null>(() => 'persist:whatsapp'),
    createProfile: vi.fn(() => ({ id: 'profile-whatsapp', partition: 'persist:whatsapp' }))
  }
})()

export const sender: CompactHostSender = { id: 1, isDestroyed: () => false, send: vi.fn() }
export const store: CompactHostStore = {
  getUI: vi.fn(() => ({ floatingWorkspaceApps: {} })),
  updateUI: vi.fn(),
  onUIChanged: vi.fn<(listener: (ui: { floatingWorkspaceApps: unknown }) => void) => () => void>(
    () => () => {}
  )
}
export const request = {
  appId: 'whatsapp-web' as const,
  target: 'attached' as const,
  requestId: 1,
  surfaceId: 1,
  mode: 'attached-native' as const,
  rectCss: { x: 1, y: 2, width: 300, height: 400 },
  rendererZoomFactor: 1
}
export const visibility = {
  appId: 'whatsapp-web' as const,
  target: 'attached' as const,
  requestId: 1,
  surfaceId: 1,
  mode: 'attached-native' as const
}

export function resetCompactHostFixture(): void {
  vi.clearAllMocks()
  mocks.webContents.isDestroyed.mockReset().mockReturnValue(false)
  mocks.webContents.setWindowOpenHandler.mockReset()
  mocks.webContents.on.mockReset()
  mocks.webContents.loadURL.mockReset().mockResolvedValue(undefined)
  mocks.webContents.insertCSS.mockReset().mockResolvedValue('css-key')
  mocks.webContents.removeInsertedCSS.mockReset().mockResolvedValue(undefined)
  mocks.webContents.executeJavaScript.mockReset().mockResolvedValue('qr')
  mocks.webContents.executeJavaScriptInIsolatedWorld.mockReset().mockResolvedValue('qr')
  mocks.webContents.close.mockReset()
  mocks.view.setBounds.mockReset()
  mocks.view.setVisible.mockReset()
  mocks.WebContentsView.mockReset().mockImplementation(function () {
    return mocks.view
  })
  mocks.resolveKnownPartition.mockReset().mockReturnValue('persist:whatsapp')
  mocks.createProfile
    .mockReset()
    .mockReturnValue({ id: 'profile-whatsapp', partition: 'persist:whatsapp' })
  sender.send.mockReset()
  store.getUI.mockReset().mockReturnValue({ floatingWorkspaceApps: {} })
  store.updateUI.mockReset()
  store.onUIChanged.mockReset().mockReturnValue(() => {})
  mocks.windows.clear()
  mocks.windows.set(sender.id, {
    isDestroyed: () => false,
    once: vi.fn(),
    removeListener: vi.fn(),
    getContentBounds: () => ({ x: 0, y: 0, width: 500, height: 600 }),
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }
  })
}
