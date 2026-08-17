import type { WebContents } from 'electron'
import type { CompactWhatsAppMode } from './compact-dom-adapter'

export const adapterAttribute = 'data-orca-whatsapp-fast-response'
export const adapterVersion = '1'
export const legacyUnsupportedId = 'orca-wa-fast-response-unsupported'
export const attentionAttribute = 'data-orca-whatsapp-has-unread'

export const compactWhatsAppCss = `
html[${adapterAttribute}="${adapterVersion}"],html[${adapterAttribute}="${adapterVersion}"] body{min-width:0!important;overflow:hidden!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="loading"],html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="loading"] body,html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="qr"],html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="qr"] body{background:#fff!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="loading"] body *,html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="qr"] body *{visibility:hidden!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="loading"] body [data-orca-whatsapp-login-spinner],html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="loading"] body [data-orca-whatsapp-login-spinner] *{visibility:visible!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="qr"] body [data-orca-whatsapp-login-qr-source],html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="qr"] body svg[data-orca-whatsapp-login-qr-source],html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="qr"] body svg[data-orca-whatsapp-login-qr-source] *{visibility:visible!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="loading"] body [data-orca-whatsapp-login-spinner],html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="qr"] body [data-orca-whatsapp-login-qr-source]{position:fixed!important;inset:0!important;margin:auto!important;z-index:2147483647!important;max-width:100%!important;max-height:100%!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="loading"] body [data-orca-whatsapp-login-spinner]{width:40px!important;height:40px!important}
html[${adapterAttribute}="${adapterVersion}"] [data-testid="wa-web-main-screen"],html[${adapterAttribute}="${adapterVersion}"] [data-testid="wa-web-main-screen"]>div{min-width:0!important;width:100%!important;max-width:100%!important;overflow:hidden!important}
html[${adapterAttribute}="${adapterVersion}"] [data-testid="drawer-left"],html[${adapterAttribute}="${adapterVersion}"] [data-testid="drawer-middle"]{border-inline-start:0!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"] [data-testid="wa-web-main-screen"]>div>div:has(>#side){flex:0 0 100%!important;width:100%!important;max-width:100%!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"] [data-testid="chatlist-header"]{display:none!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"][data-orca-whatsapp-hide-archived="true"] [data-testid="chatlist-panel-archived-button"]{display:none!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"] #app,html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"] [data-testid="chat-list"],html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"] #side,html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"] #pane-side{min-width:0!important;width:100%!important;max-width:100%!important;overflow-x:hidden!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"] [data-testid="wa-web-main-screen"]>div:has(>div>#side),html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"] [data-testid="wa-web-main-screen"]>div:has(>div>#side)>div:has(>#side),html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"] #side,html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"] #pane-side{height:100%!important;min-height:0!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"] [data-testid="wa-web-main-screen"]>div:has(>div>#side),html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"] [data-testid="wa-web-main-screen"]>div:has(>div>#side)>div:has(>#side),html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"] #side{overflow:hidden!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"] #side{display:flex!important;flex:1 1 auto!important;flex-direction:column!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"] #pane-side{flex:1 1 auto!important;overflow-y:auto!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"][data-orca-whatsapp-list-tools-expanded="false"] [data-orca-whatsapp-list-tools-source]{display:none!important}
#orca-wa-fast-response-list-tools{display:flex!important;flex:0 0 32px!important;align-items:center!important;justify-content:space-between!important;height:32px!important;min-height:0!important;margin:0!important;padding:0 12px!important}
#orca-wa-fast-response-list-tools button{display:flex!important;align-items:center!important;justify-content:center!important;width:28px!important;height:28px!important;border:0!important;border-radius:8px!important;padding:0!important;background:transparent!important;color:inherit!important;cursor:pointer!important}
#orca-wa-fast-response-list-tools button:focus-visible{outline:2px solid currentColor!important;outline-offset:2px!important}
#orca-wa-fast-response-list-tools svg{display:block!important;width:16px!important;height:16px!important}
#orca-wa-fast-response-list-tools [data-orca-whatsapp-archived-attention]{margin-inline-start:2px!important;font-weight:700!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"] [data-orca-whatsapp-native-archived]{display:none!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="list"] #main{display:none!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-archived="true"] [data-testid="drawer-left"]{display:none!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-archived="true"] [data-testid="drawer-fullscreen"]{flex:0 0 100%!important;min-width:0!important;width:100%!important;height:100%!important;min-height:0!important;max-width:100%!important;overflow:hidden!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-archived="true"] [data-testid="archived-chatlist"]{min-width:0!important;width:100%!important;height:100%!important;min-height:0!important;overflow-y:auto!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] [data-testid="wa-web-main-screen"]>div>div:has(>#side){display:none!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] [data-testid="wa-web-main-screen"]>.two{display:flex!important;height:100%!important;min-height:0!important;max-height:none!important;overflow:hidden!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] #app>div,html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] #app>div>div{min-width:0!important;min-height:0!important;width:100%!important;height:100%!important;max-width:100%!important;overflow:hidden!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] [data-testid="wa-web-main-screen"]>.two>div:has(>#main){flex:0 0 100%!important;min-width:0!important;width:100%!important;height:100%!important;min-height:0!important;max-width:100%!important;max-height:none!important;overflow:hidden!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] #app,html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] #main{display:flex!important;flex:1 1 auto!important;min-width:0!important;min-height:0!important;width:100%!important;max-width:100%!important;overflow:hidden!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] [data-testid="chatlist-header"],html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] #side [role="tablist"]{display:none!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] #side,html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] #pane-side,html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] [data-testid="chat-list"],html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] [data-testid="chat-list-search-container"],html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] [data-testid="search-container"]{display:none!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] #main [data-testid="conversation-header"],html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] #main header{position:sticky!important;top:0!important;z-index:1!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] #main [data-testid="conversation-header"] [data-testid="conversation-info-header"]{flex:0 1 124px!important;min-width:0!important;max-width:124px!important;overflow:hidden!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] #main [data-testid="conversation-header"] [data-testid="conversation-info-header-chat-title"]{display:block!important;min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] #main [data-testid="conversation-header"] [data-testid="chat-subtitle"]{min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
html[${adapterAttribute}="${adapterVersion}"][data-orca-whatsapp-mode="conversation"] [data-orca-whatsapp-header-action-hidden]{display:none!important}
#orca-wa-fast-response-back{flex:0 0 auto!important;align-self:center!important;border:0;border-radius:8px;padding:6px 8px;background:transparent;color:inherit;font:inherit;cursor:pointer}
#orca-wa-fast-response-back svg{display:block;width:18px;height:18px}
`

export async function applyCompactWhatsAppAdapterPresentation(
  webContents: Pick<
    WebContents,
    'executeJavaScriptInIsolatedWorld' | 'insertCSS' | 'removeInsertedCSS'
  >,
  previousCssKey: string | null,
  script: string,
  isCurrent: () => boolean = () => true
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

export async function clearCompactWhatsAppAdapterPresentation(
  webContents: Pick<WebContents, 'executeJavaScriptInIsolatedWorld' | 'removeInsertedCSS'>,
  cssKey: string | null
): Promise<void> {
  await webContents.executeJavaScriptInIsolatedWorld(
    999,
    [{ code: 'window.__orcaWhatsAppFastResponseCleanup?.();' }],
    false
  )
  if (cssKey) {
    await webContents.removeInsertedCSS(cssKey)
  }
}

export function isCompactWhatsAppMode(value: unknown): value is CompactWhatsAppMode {
  return value === 'loading' || value === 'qr' || value === 'list' || value === 'conversation'
}
