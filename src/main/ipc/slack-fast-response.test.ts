import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (event: { sender: unknown }, value: unknown) => unknown>()
  const owner = {
    isDestroyed: () => false,
    webContents: { once: vi.fn(), removeListener: vi.fn() }
  }
  const host = { attach: vi.fn(), update: vi.fn(), release: vi.fn(), shutdown: vi.fn() }
  const dock = { isSender: vi.fn(), getSnapshotForSender: vi.fn() }
  return {
    handlers,
    owner,
    host,
    dock,
    attached: { isAttachedSender: vi.fn() },
    trusted: vi.fn(() => true),
    fromWebContents: vi.fn(() => owner)
  }
})

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
  ipcMain: {
    handle: (channel: string, handler: (event: { sender: unknown }, value: unknown) => unknown) =>
      mocks.handlers.set(channel, handler)
  }
}))
vi.mock('./ui', () => ({ isTrustedUIRenderer: mocks.trusted }))
vi.mock('../window/communications-dock-controller', () => ({
  communicationsDockController: mocks.dock
}))
vi.mock('../window/floating-comms-surface-controller', () => ({
  floatingCommsSurfaceController: mocks.attached
}))
vi.mock('../slack-fast-response/compact-host', () => ({
  SlackFastResponseHost: class {
    attach = mocks.host.attach
    update = mocks.host.update
    release = mocks.host.release
    shutdown = mocks.host.shutdown
  }
}))

import {
  registerSlackFastResponseHandlers,
  shutdownSlackFastResponseHost
} from './slack-fast-response'

const sender = { id: 17 }
const registration = {
  appId: 'slack',
  browserTabId: 'tab',
  browserPageId: 'page',
  workspaceId: 'workspace',
  revision: 1
}
const browser = { ...registration, target: 'browser' as const }
const dock = {
  appId: 'slack' as const,
  target: 'dock' as const,
  generation: 4,
  revision: 7,
  tabId: 'tab',
  activeLeafAppId: 'slack' as const,
  rectCss: { x: 0, y: 0, width: 300, height: 400 },
  rendererZoomFactor: 1
}

function visibleSlackDock(): object {
  return {
    visible: true,
    layout: {
      collapsed: false,
      activeTabId: 'tab',
      tabs: [{ id: 'tab', layout: { type: 'leaf', appId: 'slack' } }]
    }
  }
}

describe('registerSlackFastResponseHandlers', () => {
  beforeEach(() => {
    shutdownSlackFastResponseHost()
    mocks.handlers.clear()
    vi.clearAllMocks()
    mocks.trusted.mockReturnValue(true)
    mocks.fromWebContents.mockReturnValue(mocks.owner)
    mocks.dock.isSender.mockReturnValue(true)
    mocks.dock.getSnapshotForSender.mockReturnValue(visibleSlackDock())
    mocks.attached.isAttachedSender.mockReturnValue(false)
    registerSlackFastResponseHandlers({} as never)
  })

  it('binds browser registration tokens to the exact sender and rejects stale identities', () => {
    const register = mocks.handlers.get('slackFastResponse:registerBrowserSurface')!
    const unregister = mocks.handlers.get('slackFastResponse:unregisterBrowserSurface')!
    const attach = mocks.handlers.get('slackFastResponse:attach')!
    const result = register({ sender }, registration) as { registrationToken: string }

    expect(() =>
      unregister(
        { sender: { id: 18 } },
        { ...browser, registrationToken: result.registrationToken }
      )
    ).toThrow('slack_fast_response_browser_registration_denied')
    expect(() =>
      attach(
        { sender },
        {
          ...browser,
          revision: 2,
          registrationToken: result.registrationToken,
          rectCss: dock.rectCss,
          rendererZoomFactor: 1
        }
      )
    ).toThrow('slack_fast_response_sender_denied')
    unregister({ sender }, { ...browser, registrationToken: result.registrationToken })
    expect(mocks.host.release).toHaveBeenCalledWith(
      sender,
      expect.objectContaining({
        ...browser,
        registrationToken: result.registrationToken
      })
    )
  })

  it('replaces a registration from the same owner and releases all registrations on shutdown', () => {
    const register = mocks.handlers.get('slackFastResponse:registerBrowserSurface')!
    const first = register({ sender }, registration) as { registrationToken: string }
    const second = register({ sender }, registration) as { registrationToken: string }
    expect(first.registrationToken).not.toBe(second.registrationToken)
    expect(mocks.host.release).toHaveBeenCalledOnce()

    shutdownSlackFastResponseHost()
    expect(mocks.host.shutdown).toHaveBeenCalledOnce()
    expect(mocks.host.release).toHaveBeenCalledOnce()
    expect(mocks.owner.webContents.removeListener).toHaveBeenCalledWith(
      'destroyed',
      expect.any(Function)
    )
  })

  it('authorizes dock only for a current visible Slack tab', () => {
    const attach = mocks.handlers.get('slackFastResponse:attach')!
    attach({ sender }, dock)
    expect(mocks.host.attach).toHaveBeenCalledWith(sender, dock)

    mocks.dock.getSnapshotForSender.mockReturnValue({ ...visibleSlackDock(), visible: false })
    expect(() => attach({ sender }, dock)).toThrow('slack_fast_response_sender_denied')
  })

  it('rejects untrusted registration and malformed schemas', () => {
    const register = mocks.handlers.get('slackFastResponse:registerBrowserSurface')!
    const attach = mocks.handlers.get('slackFastResponse:attach')!
    mocks.trusted.mockReturnValue(false)
    expect(() => register({ sender }, registration)).toThrow(
      'slack_fast_response_browser_registration_denied'
    )
    expect(() => attach({ sender }, { ...dock, extra: true })).toThrow(
      'slack_fast_response_request_denied'
    )
  })
})
