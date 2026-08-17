import {
  adapterAttribute as ADAPTER_ATTRIBUTE,
  adapterVersion as ADAPTER_VERSION,
  applyCompactWhatsAppAdapterPresentation,
  attentionAttribute as ATTENTION_ATTRIBUTE,
  clearCompactWhatsAppAdapterPresentation,
  legacyUnsupportedId as LEGACY_UNSUPPORTED_ID
} from './compact-dom-adapter-presentation'

export { compactWhatsAppCss, isCompactWhatsAppMode } from './compact-dom-adapter-presentation'

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
    const listToolsId = 'orca-wa-fast-response-list-tools';
    const legacyUnsupportedId = ${JSON.stringify(LEGACY_UNSUPPORTED_ID)};
    const hideArchivedChats = ${JSON.stringify(hideArchivedChats)};
    const attentionAttribute = ${JSON.stringify(ATTENTION_ATTRIBUTE)};
    let manualList = false;
    let manualListMain = '';
    let listToolsExpanded = false;
    let loginShell = null;
    const node = (selector) => document.querySelector(selector);
    const mainComposer = () => node('#main [contenteditable="true"]');
    const search = () => node('[data-testid="search-container"],[data-testid="chat-list-search-container"]');
    const isVisible = (element) => {
      if (!element || element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const archivedChatList = () => {
      const list = node('[data-testid="archived-chatlist"]');
      const drawer = list?.closest('[data-testid="drawer-fullscreen"]');
      return isVisible(list) && (!drawer || isVisible(drawer)) ? list : null;
    };
    const conversationHeader = () => node('#main [data-testid="conversation-header"],#main header');
    const profileControls = () => {
      const header = conversationHeader();
      if (!header) return [];
      const avatar = header.querySelector('img')?.closest('div[role="button"]');
      const title = header.querySelector('div[role="button"][data-testid="conversation-info-header"]');
      return [avatar, title].filter(Boolean);
    };
    const markHeaderActions = () => conversationHeader()?.querySelectorAll('button[aria-label="Video call"],button[aria-label="Voice call"],button[aria-label="Group video call"],button[aria-label="Search"],button[aria-label="Subgroup switcher"]').forEach((control) => {
      control.setAttribute('data-orca-whatsapp-header-action-hidden', '');
    });
    const loadingSpinner = () => node('[data-testid="loading-spinner"]');
    const updateLoginShell = () => {
      const shell = loadingSpinner()?.parentElement;
      if (shell && shell !== document.body && shell !== root && shell.childElementCount === 1) loginShell = shell;
      return loginShell?.isConnected ? loginShell : null;
    };
    const qrSource = () => {
      const exact = node('[data-testid="link-device-qr-code"][data-ref] canvas[role="img"]');
      if (exact) return exact;
      const shell = updateLoginShell();
      const candidate = shell?.querySelector('canvas,[data-ref]');
      if (!candidate) return null;
      if (candidate.matches('canvas,img,svg')) return candidate;
      return candidate.querySelector('canvas,img,svg') ?? candidate;
    };
    const clearLogin = () => {
      document.querySelectorAll('[data-orca-whatsapp-login-spinner]').forEach((element) => element.removeAttribute('data-orca-whatsapp-login-spinner'));
      document.querySelectorAll('[data-orca-whatsapp-login-qr-source]').forEach((element) => element.removeAttribute('data-orca-whatsapp-login-qr-source'));
    };
    const listToolsSources = () => {
      const side = node('#side');
      const searchContainer = search();
      if (!side || !searchContainer || !side.contains(searchContainer)) return [];
      const searchSource = [...side.children].find((child) => child === searchContainer || child.contains(searchContainer));
      const filters = [...side.children].find((child) => child.getAttribute('role') === 'tablist');
      return [...new Set([searchSource, filters].filter(Boolean))];
    };
    const archivedButton = () => node('#pane-side [data-testid="chatlist-panel-archived-button"]');
    const archivedHasAttention = (button) => Boolean(button?.querySelector('[data-testid="icon-unread-count"],[data-icon="mention"],[aria-label*="@"]'));
    const clearListTools = () => {
      document.getElementById(listToolsId)?.remove();
      document.querySelectorAll('[data-orca-whatsapp-list-tools-source]').forEach((element) => element.removeAttribute('data-orca-whatsapp-list-tools-source'));
      document.querySelectorAll('[data-orca-whatsapp-native-archived]').forEach((element) => element.removeAttribute('data-orca-whatsapp-native-archived'));
      root.removeAttribute('data-orca-whatsapp-list-tools-expanded');
    };
    const renderListTools = (current, archived) => {
      if (current !== 'list' || archived) {
        listToolsExpanded = false;
        clearListTools();
        return;
      }
      const side = node('#side');
      const pane = node('#pane-side');
      const sources = listToolsSources();
      if (!side || sources.length === 0) {
        clearListTools();
        return;
      }
      document.querySelectorAll('[data-orca-whatsapp-list-tools-source]').forEach((element) => {
        if (!sources.includes(element)) element.removeAttribute('data-orca-whatsapp-list-tools-source');
      });
      sources.forEach((element) => element.setAttribute('data-orca-whatsapp-list-tools-source', ''));
      const nativeArchived = archivedButton();
      nativeArchived?.setAttribute('data-orca-whatsapp-native-archived', '');
      let toolbar = document.getElementById(listToolsId);
      if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.id = listToolsId;
        const archive = document.createElement('button');
        archive.type = 'button';
        archive.dataset.action = 'archived';
        archive.addEventListener('click', () => archivedButton()?.click());
        const searchButton = document.createElement('button');
        searchButton.type = 'button';
        searchButton.dataset.action = 'search';
        searchButton.addEventListener('click', () => {
          listToolsExpanded = !listToolsExpanded;
          renderListTools('list', false);
        });
        toolbar.append(archive, searchButton);
      }
      const archive = toolbar.querySelector('[data-action="archived"]');
      const button = toolbar.querySelector('[data-action="search"]');
      archive.setAttribute('aria-label', 'Archived chats');
      archive.title = 'Archived chats';
      if (archive.dataset.attention !== String(archivedHasAttention(nativeArchived))) {
        archive.dataset.attention = String(archivedHasAttention(nativeArchived));
        archive.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path><path d="M10 12h4"></path></svg>' + (archivedHasAttention(nativeArchived) ? '<span data-orca-whatsapp-archived-attention aria-hidden="true">@</span>' : '');
      }
      const label = listToolsExpanded ? 'Hide search and filters' : 'Show search and filters';
      if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
      button.setAttribute('aria-expanded', String(listToolsExpanded));
      button.title = label;
      const state = listToolsExpanded ? 'expanded' : 'collapsed';
      if (button.dataset.state !== state) {
        button.dataset.state = state;
        button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>';
      }
      if (pane?.parentElement === side) side.insertBefore(toolbar, pane); else side.append(toolbar);
      root.setAttribute('data-orca-whatsapp-list-tools-expanded', String(listToolsExpanded));
    };
    const removeOwn = () => {
      document.querySelectorAll('#' + id).forEach((element) => element.remove());
      document.querySelectorAll('#' + legacyUnsupportedId).forEach((element) => element.remove());
      document.querySelectorAll('[data-orca-whatsapp-header-action-hidden]').forEach((element) => element.removeAttribute('data-orca-whatsapp-header-action-hidden'));
      clearListTools();
      clearLogin();
      root.removeAttribute(attribute);
      root.removeAttribute('data-orca-whatsapp-mode');
      root.removeAttribute('data-orca-whatsapp-archived');
      root.removeAttribute('data-orca-whatsapp-hide-archived');
      root.removeAttribute(attentionAttribute);
    };
    const isOwnNode = (value) => value.nodeType === 1 && (value.id === id || value.id === listToolsId || value.closest?.('#' + listToolsId));
    const isOwnMutation = (record) => {
      if (record.type === 'attributes') {
        return isOwnNode(record.target) || record.attributeName?.startsWith('data-orca-whatsapp-');
      }
      if (record.type !== 'childList') return false;
      if (isOwnNode(record.target)) return true;
      const changed = [...record.addedNodes, ...record.removedNodes];
      return changed.length > 0 && changed.every(isOwnNode);
    };
    const presentLogin = (current) => {
      clearLogin();
      if (current === 'qr') {
        qrSource()?.setAttribute('data-orca-whatsapp-login-qr-source', '');
        return;
      }
      if (current === 'loading') {
        const spinner = loadingSpinner();
        spinner?.setAttribute('data-orca-whatsapp-login-spinner', '');
      }
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
      if (qrSource()) return 'qr';
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
      const archived = current === 'list' && Boolean(archivedChatList());
      if (archived) root.setAttribute('data-orca-whatsapp-archived', 'true'); else root.removeAttribute('data-orca-whatsapp-archived');
      if (hideArchivedChats) root.setAttribute('data-orca-whatsapp-hide-archived', 'true'); else root.removeAttribute('data-orca-whatsapp-hide-archived');
      presentLogin(current);
      renderListTools(current, archived);
      let back = document.getElementById(id);
      const header = current === 'conversation' ? conversationHeader() : null;
      if (!header) {
        back?.remove();
        back = null;
      }
      if (header && !back) {
        back = document.createElement('button');
        back.id = id;
        back.type = 'button';
        back.setAttribute('aria-label', 'Back to chats');
        back.title = 'Back to chats';
        back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path></svg>';
        back.addEventListener('click', () => { manualList = true; manualListMain = mainSignature(); render(); });
        header.prepend(back);
      }
      if (header && back) header.prepend(back);
      if (current === 'conversation') markHeaderActions();
      updateAttention();
      return current;
    };
    const onReadyStateChange = () => render();
    const releaseList = (target) => {
      if (node('[data-testid="chat-list"]')?.contains(target) || archivedChatList()?.contains(target)) {
        manualList = false;
        render();
      }
    };
    const blocksProfile = (event) => {
      if (!profileControls().some((control) => control.contains(event.target))) return false;
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return false;
      event.preventDefault();
      event.stopPropagation();
      return true;
    };
    const onPointerdown = (event) => {
      blocksProfile(event);
    };
    const onClick = (event) => {
      if (!blocksProfile(event)) releaseList(event.target);
    };
    const onKeydown = (event) => {
      if (blocksProfile(event)) return;
      if (event.key === 'Enter' || event.key === ' ') releaseList(event.target);
    };
    window.__orcaWhatsAppFastResponseCleanup?.();
    removeOwn();
    document.addEventListener('pointerdown', onPointerdown, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeydown, true);
    window.__orcaWhatsAppFastResponseObserver?.disconnect();
    window.__orcaWhatsAppFastResponseObserver = new MutationObserver((records) => {
      if (records.length > 0 && records.every(isOwnMutation)) return;
      render();
    });
    window.__orcaWhatsAppFastResponseObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-testid', 'data-icon', 'aria-label', 'style', 'hidden', 'aria-hidden'] });
    document.addEventListener('readystatechange', onReadyStateChange);
    window.__orcaWhatsAppFastResponseCleanup = () => {
      window.__orcaWhatsAppFastResponseObserver?.disconnect();
      document.removeEventListener('pointerdown', onPointerdown, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeydown, true);
      document.removeEventListener('readystatechange', onReadyStateChange);
      removeOwn();
    };
    return render();
  })()`
}

export async function applyCompactWhatsAppAdapter(
  webContents: Parameters<typeof applyCompactWhatsAppAdapterPresentation>[0],
  previousCssKey: string | null,
  isCurrent: () => boolean = () => true,
  hideArchivedChats = false
): Promise<{ cssKey: string; mode: CompactWhatsAppMode } | null> {
  return applyCompactWhatsAppAdapterPresentation(
    webContents,
    previousCssKey,
    buildCompactWhatsAppScript(hideArchivedChats),
    isCurrent
  )
}

export async function clearCompactWhatsAppAdapter(
  webContents: Parameters<typeof clearCompactWhatsAppAdapterPresentation>[0],
  cssKey: string | null
): Promise<void> {
  return clearCompactWhatsAppAdapterPresentation(webContents, cssKey)
}
