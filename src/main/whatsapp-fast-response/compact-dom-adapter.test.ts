import { describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import {
  applyCompactWhatsAppAdapter,
  buildCompactWhatsAppScript,
  compactWhatsAppModeFor,
  compactWhatsAppCss
} from './compact-dom-adapter'

const structure = {
  chatList: false,
  chatlistHeader: false,
  search: false,
  main: false,
  composer: false,
  qrLogo: false,
  qrCanvas: false,
  qrReference: false,
  manualList: false
}

describe('compact WhatsApp DOM adapter', () => {
  it('recognizes the strict QR, list and conversation fingerprints', () => {
    expect(compactWhatsAppModeFor({ ...structure, qrLogo: true, qrCanvas: true })).toBe('qr')
    expect(compactWhatsAppModeFor({ ...structure, qrLogo: true, qrReference: true })).toBe('qr')
    expect(
      compactWhatsAppModeFor({ ...structure, chatList: true, chatlistHeader: true, search: true })
    ).toBe('list')
    expect(
      compactWhatsAppModeFor({
        ...structure,
        chatList: true,
        chatlistHeader: true,
        search: true,
        main: true,
        composer: true
      })
    ).toBe('conversation')
    expect(
      compactWhatsAppModeFor({
        ...structure,
        chatList: true,
        chatlistHeader: true,
        search: true,
        composer: true
      })
    ).toBe('list')
    expect(compactWhatsAppModeFor({ ...structure, qrReference: true })).toBe('loading')
    expect(compactWhatsAppModeFor(structure)).toBe('loading')
  })
  it('replaces CSS once per reload and evaluates no content-extraction script', async () => {
    const guest = {
      insertCSS: vi.fn(async () => 'new-key'),
      removeInsertedCSS: vi.fn(async () => undefined),
      executeJavaScriptInIsolatedWorld: vi.fn(async () => 'list')
    }
    await expect(applyCompactWhatsAppAdapter(guest, 'old-key')).resolves.toEqual({
      cssKey: 'new-key',
      mode: 'list'
    })
    expect(guest.removeInsertedCSS).toHaveBeenCalledWith('old-key')
    expect(guest.insertCSS).toHaveBeenCalledWith(compactWhatsAppCss)
    const script = buildCompactWhatsAppScript()
    expect(script).toContain('MutationObserver')
    expect(script).not.toMatch(/innerText|textContent\s*=\s*node|WebSocket|webpack|Store/)
  })
  it('uses the full guest only through the compact host injection contract', () => {
    expect(compactWhatsAppCss).toContain('data-orca-whatsapp-fast-response')
    expect(compactWhatsAppCss).toContain('place-items:center')
    expect(compactWhatsAppCss).toContain('data-orca-whatsapp-qr-visible')
    expect(buildCompactWhatsAppScript()).not.toContain('fetch(')
  })
  it('hides only the archived chats entry when the preference is enabled', () => {
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-hide-archived="true"] [data-testid="chatlist-panel-archived-button"]'
    )
    expect(buildCompactWhatsAppScript(true)).toContain('data-orca-whatsapp-hide-archived')
    expect(buildCompactWhatsAppScript(false)).toContain(
      "root.removeAttribute('data-orca-whatsapp-hide-archived')"
    )
  })
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
      '[data-testid="wa-web-main-screen"]>div{transform:none!important}'
    )
    expect(compactWhatsAppCss).toContain('[data-testid="wa-web-main-screen"]>div>div:has(>#side)')
    expect(compactWhatsAppCss).toContain('flex:0 0 100%!important')
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-mode="list"] [data-testid="chatlist-header"]'
    )
    expect(compactWhatsAppCss).toContain('#side [role="tablist"]{display:none!important}')
    expect(compactWhatsAppCss).toContain('#side,html')
    expect(compactWhatsAppCss).toContain('overflow-x:hidden!important')
    expect(compactWhatsAppCss).toContain('[data-orca-whatsapp-mode="conversation"] #main')
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-mode="conversation"] [data-testid="chatlist-header"]'
    )
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-mode="conversation"] #side [role="tablist"]'
    )
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
      <main id="main"><div contenteditable="true"></div></main>
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
      <main id="main"><div contenteditable="true"></div></main>
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
  it('keeps an incomplete QR document loading until its QR source arrives', async () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML = '<div data-testid="wa-wordmark"></div>'
    const run = (): unknown =>
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    expect(run()).toBe('loading')
    document.body.innerHTML += '<div data-ref=""></div>'
    await Promise.resolve()
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('qr')
  })
  it('removes orphan adapter artifacts across reinjection and mode transitions', async () => {
    const window = new Window()
    const { document } = window
    document.documentElement.setAttribute('data-orca-whatsapp-fast-response', '1')
    document.documentElement.setAttribute('data-orca-whatsapp-mode', 'loading')
    document.body.innerHTML = `
      <button id="orca-wa-fast-response-back"></button>
      <div id="orca-wa-fast-response-unsupported">WhatsApp Web layout is not supported here. Open full view.</div>
      <div data-orca-whatsapp-qr-visible></div>
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
    expect(document.querySelector('[data-orca-whatsapp-qr-visible]')).toBeNull()
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
  it('recognizes the current QR structure and isolates its official container', async () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML = `
      <div data-testid="wa-wordmark"></div>
      <div><div data-ref=""><button type="button"></button></div></div>
      <div data-testid="chat-list-search-container"></div>
    `
    const run = (): unknown =>
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    expect(run()).toBe('qr')
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('qr')
    expect(
      document.querySelector('[data-ref]')?.hasAttribute('data-orca-whatsapp-qr-visible')
    ).toBe(true)
    expect(
      document.querySelector('[data-ref] button')?.hasAttribute('data-orca-whatsapp-qr-visible')
    ).toBe(true)
    expect(
      document
        .querySelector('[data-testid="wa-wordmark"]')
        ?.hasAttribute('data-orca-whatsapp-qr-visible')
    ).toBe(false)
    document.querySelector('[data-ref]')?.remove()
    expect(run()).toBe('loading')
    expect(document.querySelector('[data-orca-whatsapp-qr-visible]')).toBeNull()
    const reference = document.createElement('div')
    reference.setAttribute('data-ref', '')
    document.body.append(reference)
    await Promise.resolve()
    expect(document.documentElement.dataset.orcaWhatsappMode).toBe('qr')
  })
  it('replaces the observer listeners when reinjected into the same document', () => {
    const window = new Window()
    const { document } = window
    document.body.innerHTML = '<div data-testid="wa-logo"></div><canvas></canvas>'
    const removeListener = vi.spyOn(document, 'removeEventListener')
    const run = (): unknown =>
      new Function(
        'window',
        'document',
        'MutationObserver',
        `return ${buildCompactWhatsAppScript()}`
      )(window, document, window.MutationObserver)
    expect(run()).toBe('qr')
    expect(run()).toBe('qr')
    expect(document.querySelectorAll('#orca-wa-fast-response-back')).toHaveLength(0)
    expect(removeListener).toHaveBeenCalledWith('click', expect.any(Function), true)
    expect(removeListener).toHaveBeenCalledWith('keydown', expect.any(Function), true)
  })
})
