import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WebContents } from 'electron'

type DockLifecycle = {
  boundsChanged: (bounds: { x: number; y: number; width: number; height: number }) => void
  closed: () => void
  crashed: () => void
  hideRequested: () => void
  loaded: () => void
}

const created: {
  lifecycle: DockLifecycle
  window: ReturnType<typeof createWindow>
}[] = []

function createWindow() {
  let visible = false
  return {
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => visible),
    isFocused: vi.fn(() => true),
    restore: vi.fn(),
    show: vi.fn(() => {
      visible = true
    }),
    focus: vi.fn(),
    hide: vi.fn(() => {
      visible = false
    }),
    destroy: vi.fn(),
    webContents: {
      isDestroyed: vi.fn(() => false),
      send: vi.fn()
    }
  }
}

const screen = { getPrimaryDisplay: vi.fn() }

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => 'C:\\dock-test') }, screen }))
vi.mock('./communications-dock-window', () => ({
  createCommunicationsDockWindow: vi.fn((_bounds: unknown, lifecycle: DockLifecycle) => {
    const window = createWindow()
    created.push({ lifecycle, window })
    return window
  })
}))
vi.mock('./communications-dock-layout', () => ({
  CommunicationsDockLayoutStore: class {
    private layout = {
      version: 1 as const,
      bounds: { x: 10, y: 10, width: 420, height: 640 },
      tabs: [
        {
          id: 'whatsapp-web',
          layout: { type: 'leaf' as const, appId: 'whatsapp-web' as const },
          activeLeafAppId: 'whatsapp-web' as const
        }
      ],
      activeTabId: 'whatsapp-web',
      collapsed: false
    }
    get = () => this.layout
    set = vi.fn((layout: typeof this.layout) => {
      this.layout = layout
    })
    flush = vi.fn(async () => {})
  }
}))
vi.mock('./communications-dock-collapse', () => ({
  CommunicationsDockCollapseController: class {
    constructor(_bounds: unknown) {}
    applyInitialState = vi.fn()
    boundsChanged = vi.fn()
    getBounds = vi.fn(() => ({ x: 10, y: 10, width: 420, height: 640 }))
    setCollapsed = vi.fn((_window: unknown, layout: unknown) => layout)
    setNavbarHeight = vi.fn()
  }
}))
vi.mock('./communications-dock-publication', () => ({
  notifyCommunicationsDockPresence: vi.fn(),
  sendCommunicationsDockSnapshot: vi.fn()
}))
vi.mock('../ipc/ui', () => ({ sendToTrustedUIRenderer: vi.fn() }))
vi.mock('./communications-dock-host', () => ({
  defaultCommunicationsDockHost: { action: vi.fn(), reattach: vi.fn() },
  defaultCommunicationsDockSession: (appId: string) =>
    appId === 'whatsapp-web' ? { appId, selectedConversationId: null, draft: '' } : { appId }
}))

describe('communications dock controller lifecycle', () => {
  afterEach(() => {
    created.length = 0
    screen.getPrimaryDisplay.mockClear()
    vi.resetModules()
  })

  it('does not access displays while the controller is imported or constructed', async () => {
    const { CommunicationsDockController } = await import('./communications-dock-controller')
    new CommunicationsDockController({ action: vi.fn(), reattach: vi.fn() })
    expect(screen.getPrimaryDisplay).not.toHaveBeenCalled()
  })

  it('keeps a warm hidden dock available without another ready acknowledgement', async () => {
    const { CommunicationsDockController } = await import('./communications-dock-controller')
    const reattach = vi.fn()
    const controller = new CommunicationsDockController({ action: vi.fn(), reattach })
    controller.openOrFocus('whatsapp-web')
    const createdDock = created[0]
    expect(createdDock.window.show).not.toHaveBeenCalled()
    createdDock.lifecycle.loaded()
    controller.readyForSender(createdDock.window.webContents as unknown as WebContents, 1)
    expect(createdDock.window.show).not.toHaveBeenCalled()
    controller.acknowledge(createdDock.window.webContents as unknown as WebContents, {
      generation: 1,
      revision: 1
    })
    expect(createdDock.window.show).toHaveBeenCalledTimes(1)
    controller.reattach(createdDock.window.webContents as unknown as WebContents, {
      generation: 1,
      revision: 1
    })
    expect(reattach).toHaveBeenCalledTimes(1)
    controller.openOrFocus('whatsapp-web')
    expect(created).toHaveLength(1)
    expect(createdDock.window.show).toHaveBeenCalledTimes(2)
    expect(createdDock.window.focus).toHaveBeenCalledTimes(2)
  })

  it('publishes the shown snapshot after the dock acknowledgement', async () => {
    const { CommunicationsDockController } = await import('./communications-dock-controller')
    const { sendCommunicationsDockSnapshot } = await import('./communications-dock-publication')
    const controller = new CommunicationsDockController({ action: vi.fn(), reattach: vi.fn() })
    controller.openOrFocus('whatsapp-web')
    const createdDock = created[0]
    createdDock.lifecycle.loaded()
    controller.readyForSender(createdDock.window.webContents as unknown as WebContents, 1)
    expect(
      controller.getSnapshotForSender(createdDock.window.webContents as unknown as WebContents)
        .visible
    ).toBe(false)

    controller.acknowledge(createdDock.window.webContents as unknown as WebContents, {
      generation: 1,
      revision: 1
    })

    expect(
      controller.getSnapshotForSender(createdDock.window.webContents as unknown as WebContents)
        .visible
    ).toBe(true)
    expect(sendCommunicationsDockSnapshot).toHaveBeenLastCalledWith(
      true,
      createdDock.window,
      expect.objectContaining({ visible: true })
    )
  })

  it('rejects a stale reattach identity after layout revisions and accepts the current one', async () => {
    const { CommunicationsDockController } = await import('./communications-dock-controller')
    const reattach = vi.fn()
    const controller = new CommunicationsDockController({ action: vi.fn(), reattach })
    controller.openOrFocus('whatsapp-web')
    const createdDock = created[0]
    createdDock.lifecycle.loaded()
    controller.readyForSender(createdDock.window.webContents as unknown as WebContents, 1)
    controller.setCollapsed(createdDock.window.webContents as unknown as WebContents, {
      generation: 1,
      revision: 1,
      collapsed: true
    })

    expect(() =>
      controller.reattach(createdDock.window.webContents as unknown as WebContents, {
        generation: 1,
        revision: 1
      })
    ).toThrow('communications_dock_stale')

    controller.reattach(createdDock.window.webContents as unknown as WebContents, {
      generation: 1,
      revision: 2
    })
    expect(reattach).toHaveBeenCalledOnce()
  })

  it('returns every dock session when reattached and keeps the warm window in panel location', async () => {
    const { CommunicationsDockController } = await import('./communications-dock-controller')
    const reattach = vi.fn()
    const controller = new CommunicationsDockController({ action: vi.fn(), reattach })
    controller.openOrFocus(
      'whatsapp-web',
      { appId: 'whatsapp-web', selectedConversationId: 4, draft: 'draft' },
      {
        slack: { appId: 'slack' },
        discord: { appId: 'discord' }
      }
    )
    const createdDock = created[0]
    createdDock.lifecycle.loaded()
    controller.readyForSender(createdDock.window.webContents as unknown as WebContents, 1)
    controller.reattach(createdDock.window.webContents as unknown as WebContents, {
      generation: 1,
      revision: 1
    })
    expect(reattach).toHaveBeenCalledWith('whatsapp-web', {
      'whatsapp-web': { appId: 'whatsapp-web', selectedConversationId: 4, draft: 'draft' },
      slack: { appId: 'slack' },
      discord: { appId: 'discord' }
    })
    expect(controller.getPresence()).toEqual({
      exists: true,
      visible: false,
      location: 'panel',
      activeAppId: 'whatsapp-web'
    })
    controller.openOrFocus('whatsapp-web')
    expect(created).toHaveLength(1)
  })

  it('treats native close as reattach while collapse leaves the dock detached', async () => {
    const { CommunicationsDockController } = await import('./communications-dock-controller')
    const reattach = vi.fn()
    const controller = new CommunicationsDockController({ action: vi.fn(), reattach })
    controller.openOrFocus('whatsapp-web')
    const createdDock = created[0]
    createdDock.lifecycle.loaded()
    controller.readyForSender(createdDock.window.webContents as unknown as WebContents, 1)
    controller.setCollapsed(createdDock.window.webContents as unknown as WebContents, {
      generation: 1,
      revision: 1,
      collapsed: true
    })
    expect(reattach).not.toHaveBeenCalled()
    expect(controller.getPresence().location).toBe('dock')
    createdDock.lifecycle.hideRequested()
    expect(reattach).toHaveBeenCalledOnce()
    expect(controller.getPresence().location).toBe('panel')
  })
})
