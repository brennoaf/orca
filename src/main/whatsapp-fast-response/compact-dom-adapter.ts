import type { WebContents } from 'electron'

export type CompactWhatsAppMode = 'qr' | 'list' | 'conversation' | 'unsupported'

export type CompactWhatsAppStructure = {
  chatList: boolean
  chatlistHeader: boolean
  search: boolean
  main: boolean
  composer: boolean
  qrLogo: boolean
  qrCanvas: boolean
  manualList: boolean
}

const ADAPTER_ATTRIBUTE = 'data-orca-whatsapp-fast-response'
const ADAPTER_VERSION = '1'

export const compactWhatsAppCss = `
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"],html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] body{min-width:0!important;overflow:hidden!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="qr"] body{display:grid!important;min-height:100%!important;place-items:center!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="qr"] body>*{max-width:100%!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="list"] #app,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="list"] [data-testid="chat-list"]{min-width:0!important;width:100%!important;max-width:100%!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="list"] #main{display:none!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="conversation"] #app,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="conversation"] #main{min-width:0!important;width:100%!important;max-width:100%!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="conversation"] [data-testid="chat-list"],html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="conversation"] [data-testid="chatlist-header"],html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="conversation"] [data-testid="search-container"]{display:none!important}
#orca-wa-fast-response-back{position:fixed;z-index:2147483647;top:8px;left:8px;border:0;border-radius:8px;padding:6px 8px;background:#111b21;color:#fff;font:inherit;cursor:pointer}
#orca-wa-fast-response-unsupported{position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:16px;background:#111b21;color:#fff;font:14px sans-serif;text-align:center}
`

export function compactWhatsAppModeFor(value: CompactWhatsAppStructure): CompactWhatsAppMode {
  if (value.chatList && value.chatlistHeader && value.search) {
    return value.manualList || !value.main || !value.composer ? 'list' : 'conversation'
  }
  return value.qrLogo && value.qrCanvas ? 'qr' : 'unsupported'
}

export function buildCompactWhatsAppScript(): string {
  return `(() => {
    const attribute = ${JSON.stringify(ADAPTER_ATTRIBUTE)};
    const version = ${JSON.stringify(ADAPTER_VERSION)};
    const root = document.documentElement;
    const id = 'orca-wa-fast-response-back';
    const unsupportedId = 'orca-wa-fast-response-unsupported';
    let manualList = false;
    let manualListMain = '';
    const node = (selector) => document.querySelector(selector);
    const mainComposer = () => node('#main [contenteditable="true"]');
    const mainSignature = () => {
      const main = node('#main');
      return main ? main.childElementCount + ':' + main.querySelectorAll('[contenteditable="true"]').length : '';
    };
    const mode = () => {
      const list = node('[data-testid="chat-list"]');
      const header = node('[data-testid="chatlist-header"]');
      const search = node('[data-testid="search-container"]');
      if (manualList && mainSignature() !== manualListMain && mainComposer()) manualList = false;
      if (list && header && search) return manualList ? 'list' : (node('#main') && mainComposer() ? 'conversation' : 'list');
      if (node('[data-testid="wa-logo"]') && node('canvas')) return 'qr';
      return 'unsupported';
    };
    const render = () => {
      const current = mode();
      root.setAttribute(attribute, version);
      root.setAttribute('data-orca-whatsapp-mode', current);
      let back = document.getElementById(id);
      if (current === 'conversation' && !back) {
        back = document.createElement('button');
        back.id = id;
        back.type = 'button';
        back.setAttribute('aria-label', 'Back to chats');
        back.textContent = 'Back';
        back.addEventListener('click', () => { manualList = true; manualListMain = mainSignature(); render(); });
        document.body.append(back);
      }
      if (back) back.hidden = current !== 'conversation';
      let unsupported = document.getElementById(unsupportedId);
      if (current === 'unsupported' && !unsupported) {
        unsupported = document.createElement('div');
        unsupported.id = unsupportedId;
        unsupported.setAttribute('role', 'status');
        unsupported.textContent = 'WhatsApp Web layout is not supported here. Open full view.';
        document.body.append(unsupported);
      }
      if (unsupported) unsupported.hidden = current !== 'unsupported';
      return current;
    };
    const releaseList = (target) => {
      if (node('[data-testid="chat-list"]')?.contains(target)) {
        manualList = false;
        render();
      }
    };
    const onClick = (event) => releaseList(event.target);
    const onKeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') releaseList(event.target);
    };
    window.__orcaWhatsAppFastResponseCleanup?.();
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeydown, true);
    window.__orcaWhatsAppFastResponseObserver?.disconnect();
    window.__orcaWhatsAppFastResponseObserver = new MutationObserver(render);
    window.__orcaWhatsAppFastResponseObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-testid'] });
    window.__orcaWhatsAppFastResponseCleanup = () => {
      window.__orcaWhatsAppFastResponseObserver?.disconnect();
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeydown, true);
    };
    return render();
  })()`
}

export async function applyCompactWhatsAppAdapter(
  webContents: Pick<
    WebContents,
    'executeJavaScript' | 'executeJavaScriptInIsolatedWorld' | 'insertCSS' | 'removeInsertedCSS'
  >,
  previousCssKey: string | null
): Promise<{ cssKey: string; mode: CompactWhatsAppMode }> {
  if (previousCssKey) {
    await webContents.removeInsertedCSS(previousCssKey).catch(() => {})
  }
  const cssKey = await webContents.insertCSS(compactWhatsAppCss)
  const script = buildCompactWhatsAppScript()
  const mode = await webContents.executeJavaScriptInIsolatedWorld(999, [{ code: script }], false)
  if (!isCompactWhatsAppMode(mode)) {
    throw new Error('whatsapp_fast_response_adapter_invalid')
  }
  return { cssKey, mode }
}

export function isCompactWhatsAppMode(value: unknown): value is CompactWhatsAppMode {
  return value === 'qr' || value === 'list' || value === 'conversation' || value === 'unsupported'
}
