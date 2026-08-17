import type { WebContents } from 'electron'
import type { SlackFastResponseContentMode } from '../../shared/slack-fast-response'

const ADAPTER_ATTRIBUTE = 'data-orca-slack-fast-response'
const ADAPTER_VERSION = '1'
const BACK_ID = 'orca-slack-fast-response-back'
const CLEANUP_SCRIPT = 'window.__orcaSlackFastResponseCleanup?.();'
const HYDRATION_TIMEOUT_MS = 20000

export const compactSlackCss = `
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"],html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] body{min-width:0!important;min-height:0!important;overflow:hidden!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-ia4_client,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-client_workspace_wrapper,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-client_workspace,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-client_workspace__layout,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-client_workspace__tabpanel{min-width:0!important;width:100%!important;max-width:100%!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-ia4_client,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-client_workspace_wrapper,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-client_workspace,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-client_workspace__layout,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-view_contents{min-height:0!important;height:100%!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-view_contents{max-height:none!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-client_workspace_wrapper{display:block!important;overflow:hidden!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-client_workspace{padding:0!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-ia4_top_nav,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-ia4_top_nav__container_wrapper,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-tab_rail,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-control_strip{display:none!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"] .p-client_workspace__tabpanel{grid-template-columns:minmax(0,1fr)!important;border:0!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="list"] .p-ia4_sidebar_header{height:40px!important;min-height:40px!important;padding-inline:6px!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="list"] .p-sidebar_text_filter_input_header{margin-inline:6px!important;padding-bottom:2px!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="list"] [data-qa="sidebar-text-filter-input"]{height:26px!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="list"] .p-view_contents--primary,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="list"] .p-workspace__primary_view{display:none!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="list"] .p-view_contents--sidebar,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="list"] .p-channel_sidebar,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="list"] .p-channel_sidebar__list{min-width:0!important;width:100%!important;max-width:100%!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="list"] .p-view_contents--sidebar,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="list"] .p-channel_sidebar,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="conversation"] .p-view_contents--primary,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="conversation"] .p-workspace__primary_view{grid-column:1!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="conversation"] .p-view_contents--sidebar,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="conversation"] .p-channel_sidebar{display:none!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="conversation"] .p-view_contents--primary,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="conversation"] .p-workspace__primary_view,html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="conversation"] .p-workspace__primary_view_body{min-width:0!important;width:100%!important;max-width:100%!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="conversation"] .p-workspace__primary_view_body{overflow-y:auto!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="conversation"] [data-qa="view_header"]{min-width:0!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="conversation"] [data-qa="view_header"] [data-qa="avatar_stack"]{height:28px!important;flex:0 0 auto!important;padding:2px 6px!important}
html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="conversation"] [data-qa="view_header"] [data-qa="entity-header-star-button"],html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="conversation"] [data-qa="view_header"] [data-qa="huddle_channel_header_button__start_button"],html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="conversation"] [data-qa="view_header"] [data-qa="huddle_channel_header_button"],html[${ADAPTER_ATTRIBUTE}="${ADAPTER_VERSION}"][data-orca-slack-mode="conversation"] [data-qa="view_header"] [data-qa="unstyled-button"]:has([data-qa="ellipsis-vertical-filled"]){display:none!important}
#orca-slack-fast-response-back{align-items:center;justify-content:center;flex:0 0 28px!important;width:28px;height:28px;border:0;border-radius:8px;padding:0;background:transparent;color:inherit;cursor:pointer}
#orca-slack-fast-response-back svg{width:16px;height:16px}
`

export function slackContentModeForUrl(value: string): SlackFastResponseContentMode {
  try {
    const url = new URL(value)
    if (url.hostname !== 'app.slack.com') {
      return 'login'
    }
    if (
      url.pathname === '/' ||
      url.pathname.startsWith('/signin') ||
      url.pathname.startsWith('/workspace-signin') ||
      url.pathname.startsWith('/sso') ||
      url.pathname.startsWith('/auth')
    ) {
      return 'login'
    }
    return url.pathname.startsWith('/client') ? 'unsupported' : 'loading'
  } catch {
    return 'unsupported'
  }
}

export function buildCompactSlackScript(hydrationTimeoutMs = HYDRATION_TIMEOUT_MS): string {
  return `(() => {
    const root = document.documentElement;
    const attribute = ${JSON.stringify(ADAPTER_ATTRIBUTE)};
    const version = ${JSON.stringify(ADAPTER_VERSION)};
    const backId = ${JSON.stringify(BACK_ID)};
    let manualList = false;
    let manualListPathname = null;
    let settleHydration = null;
    let hydrationTimer = null;
    const node = (selector) => document.querySelector(selector);
    const structure = () => ({ client: node('.p-ia4_client'), sidebar: node('.p-view_contents--sidebar, .p-channel_sidebar'), primary: node('.p-view_contents--primary, .p-workspace__primary_view'), header: node('[data-qa="view_header"]'), composer: node('[role="textbox"][data-qa="texty_input"]') });
    const removeOwn = () => { document.querySelectorAll('#' + backId).forEach((element) => element.remove()); root.removeAttribute(attribute); root.removeAttribute('data-orca-slack-mode'); };
    const settle = (mode) => { const resolve = settleHydration; if (!resolve) return; settleHydration = null; if (hydrationTimer !== null) window.clearTimeout(hydrationTimer); hydrationTimer = null; resolve(mode); };
    const releaseListAfterNavigation = () => { if (manualList && manualListPathname !== null && window.location.pathname !== manualListPathname) { manualList = false; manualListPathname = null; } };
    const recognizedMode = () => { const current = structure(); return current.client && current.sidebar && current.primary && current.header ? (manualList || !current.composer ? 'list' : 'conversation') : null; };
    const render = () => {
      releaseListAfterNavigation();
      const mode = recognizedMode();
      if (!mode) { removeOwn(); return 'unsupported'; }
      root.setAttribute(attribute, version);
      root.setAttribute('data-orca-slack-mode', mode);
      let back = document.getElementById(backId);
      const header = structure().header;
      if (mode !== 'conversation' || !header) { back?.remove(); return mode; }
      if (!back) { back = document.createElement('button'); back.id = backId; back.type = 'button'; back.setAttribute('aria-label', 'Back to conversations'); back.title = 'Back to conversations'; back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path></svg>'; back.addEventListener('click', () => { manualList = true; manualListPathname = window.location.pathname; render(); }); }
      if (back.parentElement !== header || header.firstElementChild !== back) header.prepend(back);
      return mode;
    };
    window.__orcaSlackFastResponseCleanup?.();
    removeOwn();
    const observer = new MutationObserver(() => { const mode = render(); if (mode !== 'unsupported') settle(mode); });
    window.__orcaSlackFastResponseObserver = observer;
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'role', 'data-qa'] });
    window.__orcaSlackFastResponseCleanup = () => { observer.disconnect(); removeOwn(); settle('unsupported'); };
    const initialMode = render();
    if (initialMode !== 'unsupported') return initialMode;
    return new Promise((resolve) => { settleHydration = resolve; hydrationTimer = window.setTimeout(() => window.__orcaSlackFastResponseCleanup?.(), ${hydrationTimeoutMs}); });
  })()`
}

export async function applyCompactSlackAdapter(
  webContents: Pick<
    WebContents,
    'executeJavaScriptInIsolatedWorld' | 'insertCSS' | 'removeInsertedCSS'
  >,
  previousCssKey: string | null
): Promise<{ cssKey: string; mode: 'list' | 'conversation' } | null> {
  if (previousCssKey) {
    await webContents.removeInsertedCSS(previousCssKey).catch(() => {})
  }
  const cssKey = await webContents.insertCSS(compactSlackCss)
  try {
    const mode = await webContents.executeJavaScriptInIsolatedWorld(
      999,
      [{ code: buildCompactSlackScript() }],
      false
    )
    if (mode !== 'list' && mode !== 'conversation') {
      await webContents
        .executeJavaScriptInIsolatedWorld(999, [{ code: CLEANUP_SCRIPT }], false)
        .catch(() => {})
      await webContents.removeInsertedCSS(cssKey).catch(() => {})
      return null
    }
    return { cssKey, mode }
  } catch (error) {
    await webContents.removeInsertedCSS(cssKey).catch(() => {})
    throw error
  }
}

export async function detectSlackContentMode(
  webContents: Pick<
    WebContents,
    'getURL' | 'executeJavaScriptInIsolatedWorld' | 'insertCSS' | 'removeInsertedCSS'
  >,
  previousCssKey: string | null
): Promise<SlackFastResponseContentMode> {
  const routeMode = slackContentModeForUrl(webContents.getURL())
  if (routeMode !== 'unsupported') {
    return routeMode
  }
  return (await applyCompactSlackAdapter(webContents, previousCssKey)) ? 'compact' : 'unsupported'
}

export async function clearCompactSlackAdapter(
  webContents: Pick<WebContents, 'executeJavaScriptInIsolatedWorld' | 'removeInsertedCSS'>,
  cssKey: string | null
): Promise<void> {
  await webContents.executeJavaScriptInIsolatedWorld(999, [{ code: CLEANUP_SCRIPT }], false)
  if (cssKey) {
    await webContents.removeInsertedCSS(cssKey)
  }
}
