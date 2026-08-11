import type { WebContents } from 'electron'

export type CompactWhatsAppMode = 'loading' | 'qr' | 'list' | 'conversation'

export type CompactWhatsAppStructure = {
  chatList: boolean
  chatlistHeader: boolean
  search: boolean
  main: boolean
  composer: boolean
  qrLogo: boolean
  qrCanvas: boolean
  qrReference: boolean
  manualList: boolean
}

const ADAPTER_ATTRIBUTE = 'data-orca-whatsapp-fast-response'
const ADAPTER_VERSION = '1'
const LEGACY_UNSUPPORTED_ID = 'orca-wa-fast-response-unsupported'
const ATTENTION_ATTRIBUTE = 'data-orca-whatsapp-has-unread'

export const compactWhatsAppCss = `
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"],html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] body{min-width:0!important;overflow:hidden!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="qr"] body{display:grid!important;min-height:100%!important;place-items:center!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="qr"] body [data-orca-whatsapp-qr-visible]{max-width:100%!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="qr"] body *:not([data-orca-whatsapp-qr-visible]){display:none!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] [data-testid="wa-web-main-screen"],html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] [data-testid="wa-web-main-screen"]>div{min-width:0!important;width:100%!important;max-width:100%!important;overflow:hidden!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] [data-testid="wa-web-main-screen"]>div{transform:none!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="list"] [data-testid="wa-web-main-screen"]>div>div:has(>#side),html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="conversation"] [data-testid="wa-web-main-screen"]>div>div:has(>#main){flex:0 0 100%!important;width:100%!important;max-width:100%!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="list"] [data-testid="chatlist-header"]{display:none!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="list"][data-orca-whatsapp-hide-archived="true"] [data-testid="chatlist-panel-archived-button"]{display:none!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="list"] #app,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="list"] [data-testid="chat-list"],html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="list"] #side,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="list"] #pane-side{min-width:0!important;width:100%!important;max-width:100%!important;overflow-x:hidden!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="list"] #side{display:flex!important;flex:1 1 auto!important;flex-direction:column!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="list"] #pane-side{flex:1 1 auto!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="list"] #side [role="tablist"]{display:none!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="list"] #main{display:none!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="conversation"] #app,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="conversation"] #main{display:flex!important;flex:1 1 auto!important;min-width:0!important;width:100%!important;max-width:100%!important;overflow-x:hidden!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="conversation"] [data-testid="chatlist-header"],html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="conversation"] #side [role="tablist"]{display:none!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="conversation"] #side,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="conversation"] #pane-side,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="conversation"] [data-testid="chat-list"],html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="conversation"] [data-testid="chat-list-search-container"],html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-whatsapp-mode="conversation"] [data-testid="search-container"]{display:none!important}
#orca-wa-fast-response-back{position:fixed;z-index:2147483647;top:8px;left:8px;border:0;border-radius:8px;padding:6px 8px;background:#111b21;color:#fff;font:inherit;cursor:pointer}
`

export function compactWhatsAppModeFor(value: CompactWhatsAppStructure): CompactWhatsAppMode {
  if (value.chatList && value.chatlistHeader && value.search) {
    return value.manualList || !value.main || !value.composer ? 'list' : 'conversation'
  }
  return value.qrLogo && (value.qrCanvas || value.qrReference) ? 'qr' : 'loading'
}

export function buildCompactWhatsAppScript(hideArchivedChats = false): string {
  return `(() => {
    const attribute = ${JSON.stringify(ADAPTER_ATTRIBUTE)};
    const version = ${JSON.stringify(ADAPTER_VERSION)};
    const root = document.documentElement;
    const id = 'orca-wa-fast-response-back';
    const legacyUnsupportedId = ${JSON.stringify(LEGACY_UNSUPPORTED_ID)};
    const hideArchivedChats = ${JSON.stringify(hideArchivedChats)};
    const attentionAttribute = ${JSON.stringify(ATTENTION_ATTRIBUTE)};
    let manualList = false;
    let manualListMain = '';
    let qrContainer = null;
    const node = (selector) => document.querySelector(selector);
    const mainComposer = () => node('#main [contenteditable="true"]');
    const search = () => node('[data-testid="search-container"],[data-testid="chat-list-search-container"]');
    const qrSource = () => node('canvas,[data-ref]');
    const clearQr = () => {
      document.querySelectorAll('[data-orca-whatsapp-qr-visible]').forEach((element) => element.removeAttribute('data-orca-whatsapp-qr-visible'));
      qrContainer = null;
    };
    const removeOwn = () => {
      document.querySelectorAll('#' + id).forEach((element) => element.remove());
      document.querySelectorAll('#' + legacyUnsupportedId).forEach((element) => element.remove());
      clearQr();
      root.removeAttribute(attribute);
      root.removeAttribute('data-orca-whatsapp-mode');
      root.removeAttribute(attentionAttribute);
    };
    const isOwnNode = (value) => value.nodeType === 1 && value.id === id;
    const isOwnMutation = (record) => {
      if (record.type !== 'childList') return false;
      const changed = [...record.addedNodes, ...record.removedNodes];
      return changed.length > 0 && changed.every(isOwnNode);
    };
    const isolateQr = () => {
      const container = qrSource()?.parentElement;
      if (!container || container === qrContainer) return;
      clearQr();
      document.body.querySelectorAll('*').forEach((element) => {
        if (element === container || element.contains(container) || container.contains(element)) element.setAttribute('data-orca-whatsapp-qr-visible', '');
      });
      qrContainer = container;
    };
    const mainSignature = () => {
      const main = node('#main');
      return main ? main.childElementCount + ':' + main.querySelectorAll('[contenteditable="true"]').length : '';
    };
    const recognizedMode = () => {
      const list = node('[data-testid="chat-list"]');
      const header = node('[data-testid="chatlist-header"]');
      const searchContainer = search();
      if (manualList && mainSignature() !== manualListMain && mainComposer()) manualList = false;
      if (list && header && searchContainer) return manualList ? 'list' : (node('#main') && mainComposer() ? 'conversation' : 'list');
      if ((node('[data-testid="wa-logo"],[data-testid="wa-wordmark"]')) && qrSource()) return 'qr';
      return null;
    };
    const updateAttention = () => {
      const unread = [...document.querySelectorAll('#side [data-testid="icon-unread-count"]')].some((badge) =>
        !hideArchivedChats || !badge.closest('[data-testid="chatlist-panel-archived-button"]')
      );
      root.setAttribute(attentionAttribute, unread ? 'true' : 'false');
    };
    const render = () => {
      const recognized = recognizedMode();
      const current = recognized ?? 'loading';
      root.setAttribute(attribute, version);
      root.setAttribute('data-orca-whatsapp-mode', current);
      if (hideArchivedChats) root.setAttribute('data-orca-whatsapp-hide-archived', 'true'); else root.removeAttribute('data-orca-whatsapp-hide-archived');
      if (current === 'qr') isolateQr(); else clearQr();
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
      updateAttention();
      return current;
    };
    const onReadyStateChange = () => render();
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
    removeOwn();
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeydown, true);
    window.__orcaWhatsAppFastResponseObserver?.disconnect();
    window.__orcaWhatsAppFastResponseObserver = new MutationObserver((records) => {
      if (records.length > 0 && records.every(isOwnMutation)) return;
      render();
    });
    window.__orcaWhatsAppFastResponseObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-testid'] });
    document.addEventListener('readystatechange', onReadyStateChange);
    window.__orcaWhatsAppFastResponseCleanup = () => {
      window.__orcaWhatsAppFastResponseObserver?.disconnect();
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeydown, true);
      document.removeEventListener('readystatechange', onReadyStateChange);
      removeOwn();
    };
    return render();
  })()`
}

export async function applyCompactWhatsAppAdapter(
  webContents: Pick<
    WebContents,
    'executeJavaScriptInIsolatedWorld' | 'insertCSS' | 'removeInsertedCSS'
  >,
  previousCssKey: string | null,
  isCurrent: () => boolean = () => true,
  hideArchivedChats = false
): Promise<{ cssKey: string; mode: CompactWhatsAppMode } | null> {
  if (previousCssKey) {
    await webContents.removeInsertedCSS(previousCssKey).catch(() => {})
  }
  const cssKey = await webContents.insertCSS(compactWhatsAppCss)
  if (!isCurrent()) {
    await webContents.removeInsertedCSS(cssKey).catch(() => {})
    return null
  }
  try {
    const script = buildCompactWhatsAppScript(hideArchivedChats)
    const mode = await webContents.executeJavaScriptInIsolatedWorld(999, [{ code: script }], false)
    if (!isCompactWhatsAppMode(mode)) {
      throw new Error('whatsapp_fast_response_adapter_invalid')
    }
    if (!isCurrent()) {
      await webContents.removeInsertedCSS(cssKey).catch(() => {})
      return null
    }
    return { cssKey, mode }
  } catch (error) {
    await webContents.removeInsertedCSS(cssKey).catch(() => {})
    throw error
  }
}

export function isCompactWhatsAppMode(value: unknown): value is CompactWhatsAppMode {
  return value === 'loading' || value === 'qr' || value === 'list' || value === 'conversation'
}
