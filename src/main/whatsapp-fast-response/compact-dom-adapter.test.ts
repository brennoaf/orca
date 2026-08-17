import { describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { buildCompactWhatsAppScript, compactWhatsAppCss } from './compact-dom-adapter'

describe('compact WhatsApp DOM adapter', () => {
  it('stores unread attention as a boolean and excludes archived badges when configured', async () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML = `
      <div id="side">
        <div data-testid="icon-unread-count"></div>
        <button data-testid="chatlist-panel-archived-button"><span data-testid="icon-unread-count"></span></button>
      </div>
    `
    const run = (hideArchivedChats: boolean): unknown =>
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript(hideArchivedChats)}`
      )(window, document, window.MutationObserver)
    expect(run(true)).toBe('loading')
    expect(document.documentElement.dataset.orcaWhatsappHasUnread).toBe('true')
    document.querySelector('#side > [data-testid="icon-unread-count"]')?.remove()
    await Promise.resolve()
    expect(document.documentElement.dataset.orcaWhatsappHasUnread).toBe('false')
    expect(run(false)).toBe('loading')
    expect(document.documentElement.dataset.orcaWhatsappHasUnread).toBe('true')
    new Function('window', 'return window.__orcaWhatsAppFastResponseCleanup()')(window)
    expect(document.documentElement.hasAttribute('data-orca-whatsapp-has-unread')).toBe(false)
  })
  it('scopes the compact list and conversation layout to public live structure', () => {
    expect(compactWhatsAppCss).toContain('[data-testid="wa-web-main-screen"]>div')
    expect(compactWhatsAppCss).toContain(
      'html[data-orca-whatsapp-fast-response="1"] [data-testid="drawer-left"],html[data-orca-whatsapp-fast-response="1"] [data-testid="drawer-middle"]{border-inline-start:0!important}'
    )
    expect(compactWhatsAppCss).not.toContain(
      '[data-testid="drawer-left"],[data-testid="drawer-middle"]{border-inline-start:0!important}'
    )
    expect(compactWhatsAppCss).toContain('[data-testid="wa-web-main-screen"]>div>div:has(>#side)')
    expect(compactWhatsAppCss).toContain('flex:0 0 100%!important')
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-mode="list"] [data-testid="chatlist-header"]'
    )
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-mode="list"] [data-testid="wa-web-main-screen"]>div:has(>div>#side)'
    )
    expect(compactWhatsAppCss).toContain('height:100%!important;min-height:0!important')
    expect(compactWhatsAppCss).toContain(
      '#pane-side{flex:1 1 auto!important;overflow-y:auto!important}'
    )
    expect(compactWhatsAppCss).not.toContain(
      '[data-orca-whatsapp-mode="list"] #side [role="tablist"]{display:none!important}'
    )
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-mode="conversation"] #side [role="tablist"]{display:none!important}'
    )
    expect(compactWhatsAppCss).toContain('#side,html')
    expect(compactWhatsAppCss).toContain('overflow-x:hidden!important')
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-mode="conversation"] [data-testid="wa-web-main-screen"]>div>div:has(>#side){display:none!important}'
    )
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-mode="conversation"] [data-testid="wa-web-main-screen"]>.two{display:flex!important;height:100%!important;min-height:0!important;max-height:none!important;overflow:hidden!important}'
    )
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-mode="conversation"] [data-testid="wa-web-main-screen"]>.two>div:has(>#main){flex:0 0 100%!important;min-width:0!important;width:100%!important;height:100%!important;min-height:0!important;max-width:100%!important;max-height:none!important;overflow:hidden!important}'
    )
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-mode="conversation"] #app>div,html[data-orca-whatsapp-fast-response="1"][data-orca-whatsapp-mode="conversation"] #app>div>div{min-width:0!important;min-height:0!important;width:100%!important;height:100%!important;max-width:100%!important;overflow:hidden!important}'
    )
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-mode="conversation"] #app,html[data-orca-whatsapp-fast-response="1"][data-orca-whatsapp-mode="conversation"] #main{display:flex!important;flex:1 1 auto!important;min-width:0!important;min-height:0!important;width:100%!important;max-width:100%!important;overflow:hidden!important}'
    )
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-mode="list"] #side{display:flex!important'
    )
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-archived="true"] [data-testid="drawer-left"]{display:none!important}'
    )
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-archived="true"] [data-testid="archived-chatlist"]{min-width:0!important;width:100%!important;height:100%!important;min-height:0!important;overflow-y:auto!important}'
    )
    expect(compactWhatsAppCss).not.toContain(
      '[data-orca-whatsapp-mode="list"] [data-testid="wa-web-main-screen"]>div>div:has(>#side){display:none!important}'
    )
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-list-tools-expanded="false"] [data-orca-whatsapp-list-tools-source]{display:none!important}'
    )
    expect(compactWhatsAppCss).not.toMatch(/cell-frame-container|cell-frame-title|:hover/)
    expect(compactWhatsAppCss).not.toMatch(
      /\[data-testid="chat-list"\][^{]*(?:img|span|div:nth-child)/
    )
    expect(compactWhatsAppCss).toContain(
      '#orca-wa-fast-response-list-tools{display:flex!important;flex:0 0 32px!important'
    )
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-native-archived]{display:none!important}'
    )
    expect(compactWhatsAppCss).not.toMatch(/(?:zoom|transform)\s*:/)
  })
  it('overrides the native conversation minimum height without adding a second scroller', () => {
    expect(compactWhatsAppCss).toContain(
      '[data-testid="wa-web-main-screen"]>.two{display:flex!important;height:100%!important;min-height:0!important;max-height:none!important;overflow:hidden!important}'
    )
    expect(compactWhatsAppCss).not.toMatch(
      /\[data-testid="wa-web-main-screen"\]>.two\{[^}]*overflow-y:(?:auto|scroll)/
    )
    expect(compactWhatsAppCss).not.toMatch(/#main\{[^}]*overflow-y:(?:auto|scroll)/)
  })
  it('collapses only list search and filters by default and restores them from an accessible control', () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML = `
      <div data-testid="wa-web-main-screen"><div><div><section id="side">
        <header data-testid="chatlist-header"><button id="new-chat" type="button">New chat</button></header>
        <div id="search-shell"><div data-testid="chat-list-search-container"><input /></div></div>
        <div id="filters" role="tablist"><button role="tab">All</button><button role="tab">Unread</button></div>
        <span data-testid="chat-butterbar"></span>
        <div id="pane-side">
          <button id="archived" data-testid="chatlist-panel-archived-button">Archived</button>
          <div data-testid="chat-list"><div data-testid="cell-frame-container" id="chat-row"><div><img alt="" /></div><div><span data-testid="cell-frame-title">Chat</span><span id="preview">Preview</span></div><div><span data-testid="icon-unread-count">2</span></div></div></div>
        </div>
      </section></div></div></div>
    `
    expect(
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    ).toBe('list')
    const toolbar = document.getElementById('orca-wa-fast-response-list-tools')
    const archive = toolbar?.querySelector('[data-action="archived"]')
    const button = toolbar?.querySelector('[data-action="search"]')
    expect(toolbar?.nextElementSibling?.id).toBe('pane-side')
    expect(button?.getAttribute('aria-expanded')).toBe('false')
    expect(button?.getAttribute('aria-label')).toBe('Show search and filters')
    expect(button?.getAttribute('title')).toBe('Show search and filters')
    expect(document.documentElement.dataset.orcaWhatsappListToolsExpanded).toBe('false')
    expect(
      document.getElementById('search-shell')?.hasAttribute('data-orca-whatsapp-list-tools-source')
    ).toBe(true)
    expect(
      document.getElementById('filters')?.hasAttribute('data-orca-whatsapp-list-tools-source')
    ).toBe(true)
    expect(
      document
        .querySelector('[data-testid="chatlist-header"]')
        ?.hasAttribute('data-orca-whatsapp-list-tools-source')
    ).toBe(false)
    expect(document.getElementById('new-chat')).not.toBeNull()
    expect(document.getElementById('archived')).not.toBeNull()
    expect(archive?.getAttribute('aria-label')).toBe('Archived chats')
    expect(archive?.querySelector('svg')).not.toBeNull()
    expect(archive?.querySelector('[data-orca-whatsapp-archived-attention]')).toBeNull()
    expect(document.getElementById('chat-row')).not.toBeNull()
    expect(document.querySelector('[data-testid="icon-unread-count"]')?.textContent).toBe('2')
    let archivedClicks = 0
    document.getElementById('archived')?.addEventListener('click', () => {
      archivedClicks += 1
    })
    archive?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    expect(archivedClicks).toBe(1)
    button?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    expect(button?.getAttribute('aria-expanded')).toBe('true')
    expect(button?.getAttribute('aria-label')).toBe('Hide search and filters')
    expect(document.documentElement.dataset.orcaWhatsappListToolsExpanded).toBe('true')
    button?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    expect(button?.getAttribute('aria-expanded')).toBe('false')
    new Function('window', 'return window.__orcaWhatsAppFastResponseCleanup()')(window)
    expect(document.getElementById('orca-wa-fast-response-list-tools')).toBeNull()
    expect(document.querySelector('[data-orca-whatsapp-list-tools-source]')).toBeNull()
    expect(document.documentElement.hasAttribute('data-orca-whatsapp-list-tools-expanded')).toBe(
      false
    )
  })
  it('updates archived attention without modifying list rows', async () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML = `<section id="side"><div data-testid="chatlist-header"></div><div data-testid="chat-list-search-container"></div><div role="tablist"></div><div id="pane-side"><button data-testid="chatlist-panel-archived-button" id="archived"></button><div data-testid="chat-list"><div data-testid="cell-frame-container" id="row"><img id="avatar"><span id="title"></span><span id="preview"></span><span id="meta"></span></div></div></div></section>`
    expect(
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    ).toBe('list')
    expect(document.querySelector('[data-orca-whatsapp-archived-attention]')).toBeNull()
    document
      .getElementById('archived')
      ?.insertAdjacentHTML('beforeend', '<span data-icon="mention"></span>')
    await Promise.resolve()
    expect(document.querySelector('[data-orca-whatsapp-archived-attention]')?.textContent).toBe('@')
    for (const id of ['row', 'avatar', 'title', 'preview', 'meta']) {
      expect(document.getElementById(id)?.attributes.length).toBe(id === 'row' ? 2 : 1)
    }
  })
  it('removes list tools in archived and conversation states and returns collapsed', async () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML = `
      <section id="side">
        <div data-testid="chatlist-header"></div>
        <div id="search-shell"><div data-testid="chat-list-search-container"></div></div>
        <div id="filters" role="tablist"></div>
        <div id="pane-side"><div data-testid="chat-list"><button id="row"></button></div></div>
      </section>
    `
    expect(
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    ).toBe('list')
    document
      .querySelector('#orca-wa-fast-response-list-tools [data-action="search"]')
      ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    expect(document.documentElement.dataset.orcaWhatsappListToolsExpanded).toBe('true')
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div data-testid="drawer-fullscreen" id="drawer"><div data-testid="archived-chatlist" id="archived-list"></div></div>'
    )
    const archived = document.getElementById('archived-list')
    const drawer = document.getElementById('drawer')
    if (!archived || !drawer) {
      throw new Error('archived_list_tools_fixture_missing')
    }
    vi.spyOn(archived, 'getBoundingClientRect').mockReturnValue(new window.DOMRect(0, 0, 1, 1))
    vi.spyOn(drawer, 'getBoundingClientRect').mockReturnValue(new window.DOMRect(0, 0, 1, 1))
    archived.setAttribute('style', 'display: block')
    await Promise.resolve()
    expect(document.documentElement.dataset.orcaWhatsappArchived).toBe('true')
    expect(document.getElementById('orca-wa-fast-response-list-tools')).toBeNull()
    expect(document.documentElement.hasAttribute('data-orca-whatsapp-list-tools-expanded')).toBe(
      false
    )
    archived.setAttribute('aria-hidden', 'true')
    await Promise.resolve()
    const restored = document.querySelector(
      '#orca-wa-fast-response-list-tools [data-action="search"]'
    )
    expect(restored?.getAttribute('aria-expanded')).toBe('false')
    expect(document.documentElement.dataset.orcaWhatsappListToolsExpanded).toBe('false')
    document.body.insertAdjacentHTML(
      'beforeend',
      '<main id="main"><header data-testid="conversation-header"></header><div contenteditable="true"></div></main>'
    )
    await Promise.resolve()
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('conversation')
    expect(document.getElementById('orca-wa-fast-response-list-tools')).toBeNull()
    expect(document.documentElement.hasAttribute('data-orca-whatsapp-list-tools-expanded')).toBe(
      false
    )
  })
  it('keeps the conversation header visible, blocks profile controls, and removes native actions', async () => {
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-mode="conversation"] #main [data-testid="conversation-header"]'
    )
    expect(compactWhatsAppCss).toContain(
      'position:sticky!important;top:0!important;z-index:1!important'
    )
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-header-action-hidden]{display:none!important}'
    )
    expect(compactWhatsAppCss).toContain(
      'flex:0 1 124px!important;min-width:0!important;max-width:124px!important;overflow:hidden!important'
    )
    expect(compactWhatsAppCss).toContain(
      'text-overflow:ellipsis!important;white-space:nowrap!important'
    )
    const window = new Window()
    const { document } = window
    document.body.innerHTML = `
      <div data-testid="chatlist-header"></div>
      <div data-testid="chat-list-search-container"></div>
      <div data-testid="chat-list"></div>
      <main id="main">
        <header data-testid="conversation-header">
          <div role="button" id="avatar"><img alt="" /></div>
          <div role="button" data-testid="conversation-info-header" id="name"><span data-testid="conversation-info-header-chat-title"></span></div>
          <button type="button" aria-label="Video call" id="video"><svg></svg></button>
          <button type="button" aria-label="Voice call" id="voice"><svg></svg></button>
          <button type="button" aria-label="Search" id="search"><svg></svg></button>
          <button type="button" aria-label="Menu" id="menu"><svg></svg></button>
        </header>
        <div contenteditable="true" id="composer"></div>
      </main>
    `
    let avatarActivations = 0
    let nameActivations = 0
    let menuActivations = 0
    let composerActivations = 0
    for (const type of ['pointerdown', 'click', 'keydown']) {
      document.getElementById('avatar')?.addEventListener(type, () => {
        avatarActivations += 1
      })
      document.getElementById('name')?.addEventListener(type, () => {
        nameActivations += 1
      })
    }
    document.getElementById('menu')?.addEventListener('click', () => {
      menuActivations += 1
    })
    document.getElementById('composer')?.addEventListener('click', () => {
      composerActivations += 1
    })
    expect(
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    ).toBe('conversation')
    const back = document.getElementById('orca-wa-fast-response-back')
    expect(back?.getAttribute('aria-label')).toBe('Back to chats')
    expect(back?.getAttribute('title')).toBe('Back to chats')
    expect(back?.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(back?.textContent).toBe('')
    expect(
      document.getElementById('voice')?.hasAttribute('data-orca-whatsapp-header-action-hidden')
    ).toBe(true)
    expect(
      document.getElementById('video')?.hasAttribute('data-orca-whatsapp-header-action-hidden')
    ).toBe(true)
    expect(
      document.getElementById('search')?.hasAttribute('data-orca-whatsapp-header-action-hidden')
    ).toBe(true)
    expect(
      document.getElementById('menu')?.hasAttribute('data-orca-whatsapp-header-action-hidden')
    ).toBe(false)
    for (const id of ['avatar', 'name']) {
      document
        .getElementById(id)
        ?.dispatchEvent(new window.Event('pointerdown', { bubbles: true, cancelable: true }))
      document
        .getElementById(id)
        ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
      document
        .getElementById(id)
        ?.dispatchEvent(
          new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
        )
      document
        .getElementById(id)
        ?.dispatchEvent(
          new window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
        )
    }
    expect(avatarActivations).toBe(0)
    expect(nameActivations).toBe(0)
    document
      .getElementById('menu')
      ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    document
      .getElementById('composer')
      ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(menuActivations).toBe(1)
    expect(composerActivations).toBe(1)
    const lateCall = document.createElement('button')
    lateCall.type = 'button'
    lateCall.id = 'late-call'
    document.querySelector('[data-testid="conversation-header"]')?.append(lateCall)
    lateCall.setAttribute('aria-label', 'Voice call')
    await Promise.resolve()
    expect(lateCall.hasAttribute('data-orca-whatsapp-header-action-hidden')).toBe(true)
  })
  it('keeps group and community headers compact without opening their information controls', () => {
    expect(compactWhatsAppCss).toContain(
      '[data-testid="chat-subtitle"]{min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}'
    )
    const window = new Window()
    const { document } = window
    document.body.innerHTML = `
      <div data-testid="chatlist-header"></div>
      <div data-testid="chat-list-search-container"></div>
      <div data-testid="chat-list"></div>
      <main id="main"><header data-testid="conversation-header">
        <div role="button" id="group-avatar"><img alt="" /></div>
        <div role="button" data-testid="conversation-info-header" id="group-info"><span data-testid="conversation-info-header-chat-title"></span><div data-testid="chat-subtitle"></div></div>
        <button type="button" aria-label="Subgroup switcher" id="subgroup"></button>
        <button type="button" aria-label="Group video call" id="group-video"></button>
        <button type="button" aria-label="Search" id="search"></button>
        <button type="button" aria-label="Menu" id="menu"></button>
      </header><div contenteditable="true" id="composer"></div></main>
    `
    let blocked = 0
    let menuActivations = 0
    let composerActivations = 0
    for (const id of ['group-avatar', 'group-info']) {
      document.getElementById(id)?.addEventListener('click', () => {
        blocked += 1
      })
    }
    document.getElementById('menu')?.addEventListener('click', () => {
      menuActivations += 1
    })
    document.getElementById('composer')?.addEventListener('click', () => {
      composerActivations += 1
    })
    expect(
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    ).toBe('conversation')
    expect(
      document
        .getElementById('group-video')
        ?.hasAttribute('data-orca-whatsapp-header-action-hidden')
    ).toBe(true)
    expect(
      document.getElementById('search')?.hasAttribute('data-orca-whatsapp-header-action-hidden')
    ).toBe(true)
    expect(
      document.getElementById('subgroup')?.hasAttribute('data-orca-whatsapp-header-action-hidden')
    ).toBe(true)
    expect(
      document.getElementById('menu')?.hasAttribute('data-orca-whatsapp-header-action-hidden')
    ).toBe(false)
    for (const id of ['group-avatar', 'group-info']) {
      document
        .getElementById(id)
        ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
      document
        .getElementById(id)
        ?.dispatchEvent(
          new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
        )
    }
    document
      .getElementById('menu')
      ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    document
      .getElementById('composer')
      ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(blocked).toBe(0)
    expect(menuActivations).toBe(1)
    expect(composerActivations).toBe(1)
  })
  it('expands the archived list without hiding its native Back control', async () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML = `
      <div data-testid="chatlist-header"></div><div data-testid="chat-list-search-container"></div><div data-testid="chat-list"></div>
      <div data-testid="drawer-fullscreen" style="width: 1px; height: 1px"><header><div><button aria-label="Back" id="back"></button><div data-testid="drawer-title-body"></div></div></header><div data-testid="archived-chatlist" style="width: 1px; height: 1px"><button id="archived-row"></button></div></div>
    `
    const archived = document.querySelector('[data-testid="archived-chatlist"]')
    const drawer = document.querySelector('[data-testid="drawer-fullscreen"]')
    if (!archived) {
      throw new Error('archived_test_fixture_missing')
    }
    if (!drawer) {
      throw new Error('archived_drawer_test_fixture_missing')
    }
    vi.spyOn(archived, 'getBoundingClientRect').mockReturnValue(new window.DOMRect(0, 0, 1, 1))
    vi.spyOn(drawer, 'getBoundingClientRect').mockReturnValue(new window.DOMRect(0, 0, 1, 1))
    expect(
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    ).toBe('list')
    expect(document.documentElement.getAttribute('data-orca-whatsapp-archived')).toBe('true')
    const back = document.getElementById('back')
    if (!back) {
      throw new Error('archived_back_test_fixture_missing')
    }
    expect(back?.closest('[data-testid="drawer-fullscreen"]')).toBe(drawer)
    expect(back?.closest('header')).not.toBeNull()
    expect(back?.closest('[hidden],[aria-hidden="true"]')).toBeNull()
    expect(window.getComputedStyle(back).display).not.toBe('none')
    document.querySelector('[data-testid="archived-chatlist"]')?.setAttribute('aria-hidden', 'true')
    await Promise.resolve()
    expect(document.documentElement.hasAttribute('data-orca-whatsapp-archived')).toBe(false)
  })
  it('releases archived rows from real manual list mode for click and keyboard selection', async () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML = `
      <div data-testid="chatlist-header"></div><div data-testid="chat-list-search-container"></div><div data-testid="chat-list"></div>
      <main id="main"><header data-testid="conversation-header"></header><div contenteditable="true"></div></main>
    `
    const run = (): unknown =>
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    for (const event of [
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
      new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      new window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    ]) {
      expect(run()).toBe('conversation')
      document
        .getElementById('orca-wa-fast-response-back')
        ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div data-testid="drawer-fullscreen"><div data-testid="archived-chatlist"><button id="archived-row"></button></div></div>'
      )
      const archived = document.querySelector('[data-testid="archived-chatlist"]')
      const drawer = document.querySelector('[data-testid="drawer-fullscreen"]')
      if (!archived || !drawer) {
        throw new Error('archived_test_fixture_missing')
      }
      vi.spyOn(archived, 'getBoundingClientRect').mockReturnValue(new window.DOMRect(0, 0, 1, 1))
      vi.spyOn(drawer, 'getBoundingClientRect').mockReturnValue(new window.DOMRect(0, 0, 1, 1))
      await Promise.resolve()
      expect(document.documentElement.dataset.orcaWhatsappMode).toBe('list')
      document.getElementById('archived-row')?.dispatchEvent(event)
      expect(document.documentElement.dataset.orcaWhatsappMode).toBe('conversation')
      document.querySelector('[data-testid="drawer-fullscreen"]')?.remove()
    }
  })
  it('keeps Back in the conversation header flow without blocking it or video and search', async () => {
    expect(compactWhatsAppCss).toContain('#orca-wa-fast-response-back{flex:0 0 auto!important')
    expect(compactWhatsAppCss).not.toMatch(
      /#orca-wa-fast-response-back\{[^}]*position:(?:fixed|absolute)/
    )
    const window = new Window()
    const { document } = window
    document.body.innerHTML = `
      <div data-testid="chatlist-header"></div>
      <div data-testid="chat-list-search-container"></div>
      <div data-testid="chat-list"></div>
      <main id="main">
        <header data-testid="conversation-header">
          <div role="button" id="avatar"><img alt="" /></div>
          <div role="button" data-testid="conversation-info-header" id="name"><span data-testid="conversation-info-header-chat-title"></span></div>
          <button type="button" aria-label="Video call" id="video"><svg></svg></button>
          <button type="button" aria-label="Search" id="search"><svg></svg></button>
          <button type="button" aria-label="Menu" id="menu"><svg></svg></button>
        </header>
        <div contenteditable="true"></div>
      </main>
    `
    const run = (): unknown =>
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    expect(run()).toBe('conversation')
    const header = document.querySelector('[data-testid="conversation-header"]')
    const back = document.getElementById('orca-wa-fast-response-back')
    expect(header?.firstElementChild).toBe(back)
    expect(back?.parentElement).toBe(header)
    expect(document.getElementById('video')?.parentElement).toBe(header)
    expect(document.getElementById('search')?.parentElement).toBe(header)
    expect(run()).toBe('conversation')
    expect(document.querySelectorAll('#orca-wa-fast-response-back')).toHaveLength(1)
    back?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('list')
    document
      .querySelector('[data-testid="chat-list"]')
      ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('conversation')
    const replacement = document.createElement('header')
    replacement.setAttribute('data-testid', 'conversation-header')
    header?.replaceWith(replacement)
    await Promise.resolve()
    const rerenderedBack = document.getElementById('orca-wa-fast-response-back')
    expect(replacement.firstElementChild).toBe(rerenderedBack)
    expect(document.querySelectorAll('#orca-wa-fast-response-back')).toHaveLength(1)
    rerenderedBack?.dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true })
    )
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('list')
    expect(document.querySelector('#orca-wa-fast-response-back')).toBeNull()
  })
  it('limits conversation detection to a composer inside the main pane and releases manual list mode for keyboard activation', () => {
    const script = buildCompactWhatsAppScript()
    expect(script).toContain('node(\'#main [contenteditable="true"]\')')
    expect(script).toContain("event.key === 'Enter' || event.key === ' '")
    expect(script).toContain('window.__orcaWhatsAppFastResponseObserver?.disconnect()')
  })
  it('keeps a search editor in list mode and returns to conversation after keyboard selection', () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML = `
      <div data-testid="chatlist-header"></div>
      <div data-testid="search-container" contenteditable="true"></div>
      <div data-testid="chat-list"><button type="button">Chat</button></div>
      <main id="main"><header data-testid="conversation-header"></header><div contenteditable="true"></div></main>
    `
    expect(
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    ).toBe('conversation')
    const back = document.getElementById('orca-wa-fast-response-back')
    back?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('list')
    document
      .querySelector('[data-testid="chat-list"] button')
      ?.dispatchEvent(new window.KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }))
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('conversation')
  })
  it('recognizes the current authenticated list fingerprint', () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML = `
      <div data-testid="chatlist-header"></div>
      <div data-testid="chat-list-search-container"></div>
      <div data-testid="chat-list"></div>
    `
    expect(
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    ).toBe('list')
  })
  it('rerenders official attribute mutations without looping on its own artifacts', async () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML = `
      <div id="header"></div>
      <div id="search"></div>
      <div id="list"></div>
      <main id="main"><header data-testid="conversation-header"></header><div contenteditable="true"></div></main>
    `
    expect(
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    ).toBe('loading')
    document.getElementById('main')?.classList.add('mounted')
    document.getElementById('header')?.setAttribute('data-testid', 'chatlist-header')
    document.getElementById('search')?.setAttribute('data-testid', 'chat-list-search-container')
    document.getElementById('list')?.setAttribute('data-testid', 'chat-list')
    await Promise.resolve()
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('conversation')
    await Promise.resolve()
    expect(document.querySelectorAll('#orca-wa-fast-response-back')).toHaveLength(1)
  })
  it('keeps an unknown document loading until the list fingerprint arrives', async () => {
    const window = new Window()
    const { document } = window
    const run = (): unknown =>
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    expect(run()).toBe('loading')
    await Promise.resolve()
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('loading')
    expect(document.querySelector('[role="status"]')).toBeNull()
    document.body.innerHTML = `
      <div data-testid="chatlist-header"></div>
      <div data-testid="chat-list-search-container"></div>
      <div data-testid="chat-list"></div>
    `
    await Promise.resolve()
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('list')
  })
  it('keeps the login loading until a QR source arrives inside its authentication surface', async () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML = `
      <div id="login">
        <div data-testid="wa-wordmark"></div>
        <div id="login-shell"><span data-testid="loading-spinner"></span></div>
      </div>
      <canvas id="unrelated"></canvas>
    `
    const run = (): unknown =>
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    expect(run()).toBe('loading')
    expect(
      document
        .querySelector('[data-testid="loading-spinner"]')
        ?.hasAttribute('data-orca-whatsapp-login-spinner')
    ).toBe(true)
    expect(
      document.getElementById('unrelated')?.hasAttribute('data-orca-whatsapp-login-qr-source')
    ).toBe(false)
    document
      .querySelector('[data-testid="loading-spinner"]')
      ?.replaceWith(document.createElement('div'))
    document
      .getElementById('login-shell')
      ?.insertAdjacentHTML('beforeend', '<div data-ref=""></div>')
    await Promise.resolve()
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('qr')
    expect(
      document.querySelector('[data-ref]')?.hasAttribute('data-orca-whatsapp-login-qr-source')
    ).toBe(true)
  })
  it('recognizes the live QR fingerprint on its first adapter pass', () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML = `
      <div data-testid="link-device-qr-code" data-ref="">
        <canvas id="exact-qr" role="img"></canvas>
      </div>
      <canvas id="unrelated"></canvas>
    `
    expect(
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    ).toBe('qr')
    expect(
      document.getElementById('exact-qr')?.hasAttribute('data-orca-whatsapp-login-qr-source')
    ).toBe(true)
    expect(
      document.getElementById('unrelated')?.hasAttribute('data-orca-whatsapp-login-qr-source')
    ).toBe(false)
  })
  it('does not promote QR candidates from a broad structural spinner ancestor', () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML = `
      <div id="app">
        <div data-testid="wa-wordmark"></div>
        <span data-testid="loading-spinner"></span>
        <div><canvas id="unrelated-canvas"></canvas><div data-ref=""></div></div>
      </div>
    `
    expect(
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    ).toBe('loading')
    expect(
      document
        .getElementById('unrelated-canvas')
        ?.hasAttribute('data-orca-whatsapp-login-qr-source')
    ).toBe(false)
    expect(
      document.querySelector('[data-ref]')?.hasAttribute('data-orca-whatsapp-login-qr-source')
    ).toBe(false)
  })
  it('removes orphan adapter artifacts across reinjection and mode transitions', async () => {
    const window = new Window()
    const { document } = window
    document.documentElement.setAttribute('data-orca-whatsapp-fast-response', '1')
    document.documentElement.setAttribute('data-orca-whatsapp-mode', 'loading')
    document.body.innerHTML = `
      <button id="orca-wa-fast-response-back"></button>
      <div id="orca-wa-fast-response-unsupported">WhatsApp Web layout is not supported here. Open full view.</div>
      <div data-orca-whatsapp-login-qr-source></div>
      <div data-testid="chatlist-header"></div>
      <div data-testid="chat-list-search-container"></div>
      <div data-testid="chat-list"></div>
    `
    const run = (): unknown =>
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    expect(run()).toBe('list')
    expect(document.querySelectorAll('#orca-wa-fast-response-back')).toHaveLength(0)
    expect(document.querySelector('#orca-wa-fast-response-unsupported')).toBeNull()
    expect(document.querySelector('[data-orca-whatsapp-login-qr-source]')).toBeNull()
    document.querySelectorAll('[data-testid]').forEach((element) => element.remove())
    await Promise.resolve()
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('loading')
    document.body.innerHTML += `
      <div data-testid="chatlist-header"></div>
      <div data-testid="chat-list-search-container"></div>
      <div data-testid="chat-list"></div>
    `
    await Promise.resolve()
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('list')
    expect(run()).toBe('list')
    new Function('window', 'return window.__orcaWhatsAppFastResponseCleanup()')(window)
    expect(document.documentElement.hasAttribute('data-orca-whatsapp-fast-response')).toBe(false)
    expect(document.documentElement.hasAttribute('data-orca-whatsapp-mode')).toBe(false)
  })
  it('centers the real QR source from the authentication surface', async () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML = `
      <div id="login">
        <div data-testid="wa-wordmark"></div>
        <div id="login-shell"><span data-testid="loading-spinner"></span></div>
      </div>
    `
    const run = (): unknown =>
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    expect(run()).toBe('loading')
    document
      .querySelector('[data-testid="loading-spinner"]')
      ?.replaceWith(document.createElement('div'))
    document
      .getElementById('login-shell')
      ?.insertAdjacentHTML('beforeend', '<div data-ref=""><canvas id="qr-canvas"></canvas></div>')
    await Promise.resolve()
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('qr')
    expect(
      document.querySelector('[data-ref]')?.hasAttribute('data-orca-whatsapp-login-qr-source')
    ).toBe(false)
    expect(
      document.getElementById('qr-canvas')?.hasAttribute('data-orca-whatsapp-login-qr-source')
    ).toBe(true)
    expect(document.querySelectorAll('[data-orca-whatsapp-login-qr-source]')).toHaveLength(1)
    document.querySelector('[data-ref]')?.remove()
    await Promise.resolve()
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('loading')
    expect(document.querySelector('[data-orca-whatsapp-login-qr-source]')).toBeNull()
    const reference = document.createElement('div')
    reference.setAttribute('data-ref', '')
    document.getElementById('login-shell')?.append(reference)
    await Promise.resolve()
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('qr')
  })
  it('replaces the observer listeners when reinjected into the same document', () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML =
      '<div><div data-testid="wa-logo"></div><div><span data-testid="loading-spinner"></span></div></div>'
    const removeListener = vi.spyOn(document, 'removeEventListener')
    const run = (): unknown =>
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    expect(run()).toBe('loading')
    expect(run()).toBe('loading')
    expect(document.querySelectorAll('#orca-wa-fast-response-back')).toHaveLength(0)
    expect(removeListener).toHaveBeenCalledWith('pointerdown', expect.any(Function), true)
    expect(removeListener).toHaveBeenCalledWith('click', expect.any(Function), true)
    expect(removeListener).toHaveBeenCalledWith('keydown', expect.any(Function), true)
  })
})
