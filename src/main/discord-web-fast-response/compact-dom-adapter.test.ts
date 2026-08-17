import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { DISCORD_WEB_COMPACT_INTENT_EVENT } from '../../shared/discord-web-fast-response'
import { installDiscordWebCompactNavigation } from '../../preload/discord-web-fast-response-navigation'
import {
  buildCompactDiscordScript,
  compactDiscordCss,
  compactDiscordModeFor
} from './compact-dom-adapter'

function runCompactScript(window: Window, hydrationTimeoutMs = 5000): Promise<string> | string {
  return new Function(
    'window',
    'document',
    'MutationObserver',
    `return ${buildCompactDiscordScript(hydrationTimeoutMs)}`
  )(window, window.document, window.MutationObserver) as Promise<string> | string
}

function setup() {
  const window = new Window()
  const { document } = window
  document.body.innerHTML = [
    '<nav id="guild-rail"><div role="tree" data-list-id="guildsnav">',
    '<div role="treeitem" data-list-item-id="guildsnav___home"></div>',
    '<div role="treeitem" data-list-item-id="guildsnav___12345678901234567"><img alt="EGB" src="https://cdn.discordapp.com/icon.png"></div>',
    '</div></nav>',
    '<aside id="channel-sidebar">',
    '<div role="button" aria-label="Planning category"><span>Category</span></div>',
    '<a role="link" href="/channels/12345678901234567/22345678901234567" data-list-item-id="channels___22345678901234567" aria-label="orbit-plans (text channel)"><span>Text</span><span data-text-variant="text-sm/medium">orbit-plans</span><span>badge</span></a>',
    '<a role="button" data-list-item-id="channels___32345678901234567" aria-label="voice-lobby, 2 participants, 12 minutes"><span>Voice (Limited)</span><span data-text-variant="text-sm/medium">voice-lobby</span><span>2 participants</span></a>',
    '<a href="/channels/@me/42345678901234567"><img alt="Brenno" src="https://cdn.discordapp.com/avatar.png"></a>',
    '</aside>',
    '<div id="content-shell"><div id="content-parent"><main id="chat"></main></div></div>'
  ].join('')
  const intents: unknown[] = []
  document.addEventListener(DISCORD_WEB_COMPACT_INTENT_EVENT, (event) => {
    if ('detail' in event) {
      intents.push(event.detail)
    }
  })
  const run = (): Promise<string> | string => runCompactScript(window)
  return { document, intents, run, window }
}

function setMode(window: Window, mode: object): unknown {
  return new Function('window', 'mode', 'return window.__orcaDiscordFastResponse.setMode(mode)')(
    window,
    mode
  )
}

function navigate(window: Window, command: object): unknown {
  return new Function(
    'window',
    'command',
    'return window.__orcaDiscordFastResponse.navigate(command)'
  )(window, command)
}

describe('compact Discord DOM adapter', () => {
  it('projects the authoritative server state and emits deterministic back intents', async () => {
    const { document, intents, run, window } = setup()
    const nativeGuild = document.querySelector(
      '[data-list-item-id="guildsnav___12345678901234567"]'
    )
    const nativeClick = vi.fn()
    nativeGuild?.addEventListener('click', nativeClick)

    expect(run()).toBe('installed')
    await Promise.resolve()
    const guild = document.querySelector(
      '[data-orca-guild-id]'
    ) as unknown as HTMLButtonElement | null
    guild?.click()
    expect(intents).toEqual([
      { kind: 'select-server', serverId: '12345678901234567', serverName: 'EGB' }
    ])
    expect(nativeClick).toHaveBeenCalledOnce()
    expect(document.documentElement.dataset.orcaDiscordFastResponseMode).toBe('manager')

    expect(
      setMode(window, {
        kind: 'server-channels',
        serverId: '12345678901234567',
        serverName: 'EGB'
      })
    ).toBe('installed')
    await Promise.resolve()
    expect(document.documentElement.dataset.orcaDiscordFastResponseMode).toBe('server-channels')
    const manager = document.getElementById('orca-discord-fast-response-manager')
    expect(manager?.textContent).toContain('orbit-plans')
    expect(manager?.textContent).toContain('voice-lobby')
    expect(manager?.textContent).not.toContain('Text')
    expect(manager?.textContent).not.toContain('Voice (Limited)')
    expect(manager?.textContent).not.toContain('Category')
    const channel = document.querySelector(
      '[data-orca-channel-id="22345678901234567"]'
    ) as unknown as HTMLAnchorElement | null
    channel?.addEventListener('click', (event) => event.preventDefault())
    channel?.click()
    expect(intents.at(-1)).toEqual({
      kind: 'open-text-channel',
      serverId: '12345678901234567',
      serverName: 'EGB',
      channelId: '22345678901234567',
      channelName: 'orbit-plans'
    })
    const voice = document.querySelector(
      '[data-orca-channel-id="32345678901234567"]'
    ) as unknown as HTMLAnchorElement | null
    voice?.click()
    expect(intents).toHaveLength(2)

    setMode(window, {
      kind: 'dedicated',
      source: {
        kind: 'server-channel',
        serverId: '12345678901234567',
        serverName: 'EGB',
        channelId: '22345678901234567',
        channelName: 'orbit-plans'
      }
    })
    await Promise.resolve()
    expect(document.querySelector('[data-orca-discord-fast-response-content="1"]')).toBe(
      document.querySelector('main')
    )
    expect(document.querySelectorAll('[data-orca-discord-dedicated-path="1"]')).toHaveLength(3)
    expect(document.body.hasAttribute('data-orca-discord-dedicated-path')).toBe(true)
    ;(
      document.querySelector('[data-orca-action="back"]') as unknown as HTMLButtonElement | null
    )?.click()
    expect(intents.at(-1)).toEqual({ kind: 'back' })

    setMode(window, {
      kind: 'server-channels',
      serverId: '12345678901234567',
      serverName: 'EGB'
    })
    await Promise.resolve()
    ;(
      document.querySelector('[data-orca-action="back"]') as unknown as HTMLButtonElement | null
    )?.click()
    expect(intents.at(-1)).toEqual({ kind: 'back' })
    setMode(window, { kind: 'manager', tab: 'servers' })
    await Promise.resolve()
    expect(document.getElementById('orca-discord-fast-response-manager')?.textContent).toContain(
      'EGB'
    )

    const secondSidebar = document.createElement('aside')
    secondSidebar.innerHTML = [
      '<a role="link" href="/channels/52345678901234567/62345678901234567" data-list-item-id="channels___62345678901234567"><span>b-general</span></a>',
      '<a role="button" data-list-item-id="channels___72345678901234567"><span>B Voice</span></a>'
    ].join('')
    document.body.append(secondSidebar)
    setMode(window, {
      kind: 'server-channels',
      serverId: '52345678901234567',
      serverName: 'Server B'
    })
    await Promise.resolve()
    expect(manager?.textContent).toContain('Channel')
    expect(manager?.textContent).toContain('Voice channel')
    expect(manager?.textContent).not.toContain('orbit-plans')
    expect(manager?.textContent).not.toContain('voice-lobby')

    secondSidebar.replaceChildren()
    await Promise.resolve()
    await Promise.resolve()
    expect(manager?.querySelectorAll('[data-orca-channel-id]')).toHaveLength(0)
    expect(manager?.textContent).toContain('No available channels.')
    await Promise.resolve()
    expect(manager?.querySelectorAll('[data-orca-channel-id]')).toHaveLength(0)
  })

  it('keeps synthetic native guild clicks out of dedicated mode', async () => {
    const { document, intents, run } = setup()
    expect(run()).toBe('installed')
    await Promise.resolve()
    intents.length = 0

    ;(
      document.querySelector(
        '[data-list-item-id="guildsnav___12345678901234567"]'
      ) as unknown as HTMLElement | null
    )?.click()

    expect(intents).toEqual([])
    expect(document.documentElement.dataset.orcaDiscordFastResponseMode).toBe('manager')
  })

  it('keeps synthetic Messages links inert until an exact native navigation command', async () => {
    const { document, intents, run, window } = setup()
    const nativeHome = document.querySelector('[data-list-item-id="guildsnav___home"]')
    const nativeDm = document.querySelector('#channel-sidebar a[href^="/channels/@me/"]')
    const homeClick = vi.fn()
    const dmClick = vi.fn()
    nativeHome?.addEventListener('click', homeClick)
    nativeDm?.addEventListener('click', dmClick)
    expect(run()).toBe('installed')
    setMode(window, { kind: 'manager', tab: 'messages' })
    await Promise.resolve()

    const dm = document.querySelector(
      '#orca-discord-fast-response-manager a[href="/channels/@me/42345678901234567"]'
    ) as unknown as HTMLAnchorElement | null
    dm?.click()
    expect(intents.at(-1)).toEqual({
      kind: 'open-direct-message',
      href: '/channels/@me/42345678901234567',
      name: 'Brenno'
    })
    expect(dmClick).not.toHaveBeenCalled()
    expect(navigate(window, { kind: 'open-home' })).toBe('clicked')
    expect(homeClick).toHaveBeenCalledOnce()
    expect(
      navigate(window, {
        kind: 'open-direct-message',
        href: '/channels/@me/42345678901234567'
      })
    ).toBe('clicked')
    expect(dmClick).toHaveBeenCalledOnce()
    expect(
      navigate(window, {
        kind: 'open-direct-message',
        href: '/channels/@me/99999999999999999'
      })
    ).toBe('missing')
    expect(navigate(window, { kind: 'open-direct-message', href: 'https://example.com' })).toBe(
      'denied'
    )

    document.querySelector('#channel-sidebar a[href^="/channels/@me/"]')?.remove()
    await Promise.resolve()
    await Promise.resolve()
    expect(
      document.querySelectorAll('#orca-discord-fast-response-manager a[href^="/channels/@me/"]')
    ).toHaveLength(0)

    setMode(window, { kind: 'manager', tab: 'friends' })
    await Promise.resolve()
    expect(document.getElementById('orca-discord-fast-response-manager')?.textContent).toContain(
      'Friends are not available in fast response yet.'
    )
    expect(document.documentElement.dataset.orcaDiscordFastResponseTab).toBe('friends')
  })

  it('returns missing when native Home is absent', () => {
    const { document, run, window } = setup()
    expect(run()).toBe('installed')
    document.querySelector('[data-list-item-id="guildsnav___home"]')?.remove()
    expect(navigate(window, { kind: 'open-home' })).toBe('missing')
  })

  it('routes real manager-tab clicks through the preload and rerenders each selected hub tab', async () => {
    const { document, run, window } = setup()
    const sent: unknown[] = []
    const removeNavigation = installDiscordWebCompactNavigation({
      document: document as unknown as Document,
      onAvailability: (listener) => {
        listener({ available: true, revision: 7 })
        return () => undefined
      },
      send: (intent) => sent.push(intent)
    })
    expect(run()).toBe('installed')
    await Promise.resolve()

    const tabs = Array.from(document.querySelectorAll('[data-orca-manager-tab]'))
    expect(tabs).toHaveLength(3)
    expect(
      tabs.every((tab) => tab.tagName === 'BUTTON' && tab.getAttribute('role') === 'tab')
    ).toBe(true)
    expect(compactDiscordCss).toContain('grid-template-columns:repeat(3,minmax(0,1fr))')
    expect(compactDiscordCss).toContain('min-height:40px')

    const messages = document.querySelector(
      '[data-orca-manager-tab="messages"]'
    ) as unknown as HTMLButtonElement | null
    messages?.click()
    expect(sent).toEqual([{ revision: 7, intent: { kind: 'select-manager-tab', tab: 'messages' } }])
    setMode(window, { kind: 'manager', tab: 'messages' })
    await Promise.resolve()
    expect(
      document.querySelector('[data-orca-manager-tab="messages"]')?.getAttribute('aria-selected')
    ).toBe('true')
    expect(document.getElementById('orca-discord-fast-response-manager')?.textContent).toContain(
      'Brenno'
    )

    const friends = document.querySelector(
      '[data-orca-manager-tab="friends"]'
    ) as unknown as HTMLButtonElement | null
    friends?.click()
    expect(sent.at(-1)).toEqual({
      revision: 7,
      intent: { kind: 'select-manager-tab', tab: 'friends' }
    })
    setMode(window, { kind: 'manager', tab: 'friends' })
    await Promise.resolve()
    expect(
      document.querySelector('[data-orca-manager-tab="friends"]')?.getAttribute('aria-selected')
    ).toBe('true')
    expect(document.getElementById('orca-discord-fast-response-manager')?.textContent).toContain(
      'Friends are not available in fast response yet.'
    )
    removeNavigation()
  })

  it('cleans its isolated projection and stays unsupported without Discord structure', async () => {
    const { document, run, window } = setup()
    expect(run()).toBe('installed')
    await Promise.resolve()
    new Function('window', 'window.__orcaDiscordFastResponseCleanup()')(window)
    expect(document.documentElement.hasAttribute('data-orca-discord-fast-response')).toBe(false)
    expect(document.querySelector('[data-orca-discord-dedicated-path]')).toBeNull()
    expect(document.getElementById('orca-discord-fast-response-style')).toBeNull()
    expect(document.getElementById('orca-discord-fast-response-manager')).toBeNull()

    const unsupported = new Window()
    unsupported.document.body.innerHTML =
      '<div role="tree" data-list-id="unrelated"><div role="treeitem"></div></div><main></main>'
    await expect(Promise.resolve(runCompactScript(unsupported, 0))).resolves.toBe('unsupported')
  })

  it('does not recreate projection DOM from a microtask pending after cleanup', async () => {
    const { document, run, window } = setup()
    expect(run()).toBe('installed')
    new Function('window', 'window.__orcaDiscordFastResponseCleanup()')(window)
    await Promise.resolve()
    await Promise.resolve()

    expect(document.documentElement.hasAttribute('data-orca-discord-fast-response')).toBe(false)
    expect(document.querySelector('[data-orca-discord-fast-response-content]')).toBeNull()
    expect(document.querySelector('[data-orca-discord-dedicated-path]')).toBeNull()
    expect(document.getElementById('orca-discord-fast-response-style')).toBeNull()
    expect(document.getElementById('orca-discord-fast-response-manager')).toBeNull()
  })

  it('installs consistently after late Discord hydration', async () => {
    vi.useFakeTimers()
    try {
      const window = new Window()
      const completion = Promise.resolve(runCompactScript(window))
      let settled = false
      void completion.then(() => {
        settled = true
      })
      vi.advanceTimersByTime(4999)
      await Promise.resolve()
      expect(settled).toBe(false)

      window.document.body.innerHTML = [
        '<div role="tree" data-list-id="guildsnav">',
        '<div role="treeitem" data-list-item-id="guildsnav___12345678901234567"><span>EGB</span></div>',
        '</div>',
        '<main></main>'
      ].join('')
      await Promise.resolve()
      await expect(completion).resolves.toBe('installed')
      await Promise.resolve()

      expect(window.document.documentElement.dataset.orcaDiscordFastResponse).toBe('1')
      expect(window.document.documentElement.dataset.orcaDiscordFastResponseMode).toBe('manager')
      expect(window.document.documentElement.dataset.orcaDiscordFastResponseTab).toBe('servers')
      expect(window.document.querySelector('[data-orca-discord-fast-response-content="1"]')).toBe(
        window.document.querySelector('main')
      )
      expect(window.document.getElementById('orca-discord-fast-response-style')).toBeTruthy()
      expect(window.document.getElementById('orca-discord-fast-response-manager')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('cancels pending hydration without accepting later structure', async () => {
    const window = new Window()
    const completion = Promise.resolve(runCompactScript(window))
    new Function('window', 'window.__orcaDiscordFastResponseCleanup()')(window)
    await expect(completion).resolves.toBe('unsupported')

    window.document.body.innerHTML = '<div role="tree" data-list-id="guildsnav"></div><main></main>'
    await Promise.resolve()
    await Promise.resolve()
    expect(window.document.documentElement.hasAttribute('data-orca-discord-fast-response')).toBe(
      false
    )
    expect(window.document.getElementById('orca-discord-fast-response-style')).toBeNull()
    expect(window.document.getElementById('orca-discord-fast-response-manager')).toBeNull()
  })

  it('keeps CSS scoped, isolates dedicated siblings, and validates every public mode', () => {
    expect(compactDiscordCss).toContain('html[data-orca-discord-fast-response="1"]')
    expect(compactDiscordCss).not.toMatch(/^\s*(?:main|nav)/m)
    expect(compactDiscordCss).toContain('[data-orca-discord-fast-response-mode="dedicated"]')
    expect(compactDiscordCss).toContain('[data-orca-discord-dedicated-path="1"]>:not(')
    expect(compactDiscordModeFor({ kind: 'manager', tab: 'servers' })).toEqual({
      kind: 'manager',
      tab: 'servers'
    })
    expect(
      compactDiscordModeFor({
        kind: 'server-channels',
        serverId: '12345678901234567',
        serverName: 'EGB'
      })
    ).toEqual({
      kind: 'server-channels',
      serverId: '12345678901234567',
      serverName: 'EGB'
    })
    expect(compactDiscordModeFor({ kind: 'dedicated' })).toBeNull()
    expect(compactDiscordModeFor('bad')).toBeNull()
  })
})
