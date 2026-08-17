import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  acquireSandboxPreloadPath: vi.fn((_directory: string, name: string) => ({
    path: `C:\\out\\sandbox-preload\\generations\\${'a'.repeat(64)}\\${name}.js`,
    release: mocks.releaseSandboxPreload
  })),
  handlers: new Map<string, (...args: unknown[]) => void>(),
  releaseSandboxPreload: vi.fn(),
  webContents: {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      mocks.handlers.set(event, handler)
    }),
    setWindowOpenHandler: vi.fn()
  },
  WebContentsView: vi.fn(function () {
    return { webContents: mocks.webContents }
  })
}))

vi.mock('electron', () => ({ WebContentsView: mocks.WebContentsView }))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))

vi.mock('../communication-web-external-navigation', () => ({
  configureCommunicationWebNavigation: vi.fn()
}))

vi.mock('../sandbox-preload-path', () => ({
  acquireSandboxPreloadPath: mocks.acquireSandboxPreloadPath
}))

import { createDiscordWebFastResponseView, isDiscordWebNavigationUrl } from './compact-host-view'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.handlers.clear()
})

describe('Discord Web navigation allowlist', () => {
  it('allows Discord HTTPS hosts only', () => {
    expect(isDiscordWebNavigationUrl('https://discord.com/app')).toBe(true)
    expect(isDiscordWebNavigationUrl('https://canary.discord.com/app')).toBe(true)
    expect(isDiscordWebNavigationUrl('http://discord.com/app')).toBe(false)
    expect(isDiscordWebNavigationUrl('https://discord.com.example.com/app')).toBe(false)
    expect(isDiscordWebNavigationUrl('invalid')).toBe(false)
  })
})

describe('Discord Web fast-response view', () => {
  it('uses a dedicated sandboxed isolated preload', () => {
    const didNavigateInPage = vi.fn()
    createDiscordWebFastResponseView({
      partition: 'persist:discord',
      didFinishLoad: vi.fn(),
      didStartNavigation: vi.fn(),
      didNavigateInPage,
      didFailLoad: vi.fn(),
      renderProcessGone: vi.fn(),
      destroyed: vi.fn()
    })

    expect(mocks.WebContentsView).toHaveBeenCalledWith({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'persist:discord',
        preload: expect.stringMatching(
          /sandbox-preload\\generations\\[a-f0-9]{64}\\discord-web-fast-response-preload\.js$/
        ),
        sandbox: true
      }
    })
    expect(mocks.acquireSandboxPreloadPath).toHaveBeenCalledWith(
      expect.any(String),
      'discord-web-fast-response-preload',
      { retainGeneration: true }
    )
    mocks.handlers.get('did-finish-load')?.()
    expect(mocks.releaseSandboxPreload).toHaveBeenCalledTimes(1)
    mocks.handlers.get('did-navigate-in-page')?.({}, 'https://discord.com/channels/@me', true)
    expect(didNavigateInPage).toHaveBeenCalledWith(
      expect.objectContaining({ webContents: mocks.webContents }),
      'https://discord.com/channels/@me',
      true
    )
  })

  it('fails before creating the view when the sandbox preload is unavailable', () => {
    mocks.acquireSandboxPreloadPath.mockImplementationOnce(() => {
      throw new Error('sandbox_preload_manifest_invalid:discord-web-fast-response-preload')
    })

    expect(() =>
      createDiscordWebFastResponseView({
        partition: 'persist:discord',
        didFinishLoad: vi.fn(),
        didStartNavigation: vi.fn(),
        didNavigateInPage: vi.fn(),
        didFailLoad: vi.fn(),
        renderProcessGone: vi.fn(),
        destroyed: vi.fn()
      })
    ).toThrow('sandbox_preload_manifest_invalid:discord-web-fast-response-preload')
    expect(mocks.WebContentsView).not.toHaveBeenCalled()
  })
})
