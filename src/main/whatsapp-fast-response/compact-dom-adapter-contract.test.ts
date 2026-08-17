import { describe, expect, it, vi } from 'vitest'
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

describe('compact WhatsApp DOM adapter contracts', () => {
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
    expect(compactWhatsAppCss).toContain('background:#fff!important')
    expect(compactWhatsAppCss).toContain(
      'position:fixed!important;inset:0!important;margin:auto!important'
    )
    expect(compactWhatsAppCss).toContain('data-orca-whatsapp-login-spinner')
    expect(compactWhatsAppCss).toContain('data-orca-whatsapp-login-qr-source')
    expect(buildCompactWhatsAppScript()).not.toContain('fetch(')
  })
  it('leaves the full WhatsApp guest outside the compact presentation scope', () => {
    expect(compactWhatsAppCss).toContain(
      'html[data-orca-whatsapp-fast-response="1"][data-orca-whatsapp-mode="loading"] body *'
    )
    expect(compactWhatsAppCss).not.toContain('\nbody *{visibility:hidden!important}')
  })
  it('uses separate presentation markers for the exact spinner and QR source', () => {
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-login-spinner],html[data-orca-whatsapp-fast-response="1"][data-orca-whatsapp-mode="loading"] body [data-orca-whatsapp-login-spinner] *{visibility:visible!important}'
    )
    expect(compactWhatsAppCss).toContain(
      '[data-orca-whatsapp-login-qr-source],html[data-orca-whatsapp-fast-response="1"][data-orca-whatsapp-mode="qr"] body svg[data-orca-whatsapp-login-qr-source]'
    )
    expect(compactWhatsAppCss).not.toContain(
      'body [data-orca-whatsapp-login-qr-source] *{visibility:visible!important}'
    )
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
})
