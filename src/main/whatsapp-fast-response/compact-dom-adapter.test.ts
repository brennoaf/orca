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
  manualList: false
}

describe('compact WhatsApp DOM adapter', () => {
  it('recognizes the strict QR, list, conversation and unsupported fingerprints', () => {
    expect(compactWhatsAppModeFor({ ...structure, qrLogo: true, qrCanvas: true })).toBe('qr')
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
    expect(compactWhatsAppModeFor(structure)).toBe('unsupported')
  })
  it('replaces CSS once per reload and evaluates no content-extraction script', async () => {
    const guest = {
      insertCSS: vi.fn(async () => 'new-key'),
      removeInsertedCSS: vi.fn(async () => undefined),
      executeJavaScript: vi.fn(async () => 'list'),
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
    expect(buildCompactWhatsAppScript()).not.toContain('fetch(')
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
