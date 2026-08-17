import { compactDiscordCss, DISCORD_COMPACT_DOM } from './compact-dom-adapter-css'
import { compactDiscordNativeDataScript } from './compact-dom-native-data-script'
import { compactDiscordManagerScript } from './compact-dom-manager-script'

export { compactDiscordModeFor } from './compact-dom-mode'

const HYDRATION_TIMEOUT_MS = 20000

const {
  attribute,
  modeAttribute,
  tabAttribute,
  contentAttribute,
  dedicatedPathAttribute,
  managerId,
  styleId,
  intentEvent
} = DISCORD_COMPACT_DOM

export { compactDiscordCss }

export function buildCompactDiscordScript(hydrationTimeoutMs = HYDRATION_TIMEOUT_MS): string {
  return `(() => {
    const root = document.documentElement;
    const attribute = ${JSON.stringify(attribute)};
    const modeAttribute = ${JSON.stringify(modeAttribute)};
    const tabAttribute = ${JSON.stringify(tabAttribute)};
    const contentAttribute = ${JSON.stringify(contentAttribute)};
    const dedicatedPathAttribute = ${JSON.stringify(dedicatedPathAttribute)};
    const managerId = ${JSON.stringify(managerId)};
    const styleId = ${JSON.stringify(styleId)};
    const intentEvent = ${JSON.stringify(intentEvent)};
    const guildPattern = /^guildsnav___(\\d{17,20})$/;
    const channelPattern = /^channels___(\\d{17,20})$/;
    const dmPattern = /^\\/channels\\/@me\\/(\\d{17,20})$/;
    const serverChannelPattern = /^\\/channels\\/(\\d{17,20})\\/(\\d{17,20})$/;
    const css = ${JSON.stringify(compactDiscordCss)};
    let current = { kind: 'manager', tab: 'servers' };
    let scheduled = false;
    let disposed = false;
    let settleHydration = null;
    let hydrationTimer = null;
    let lastSignature = '';
    const guildTree = () => document.querySelector('[role="tree"][data-list-id="guildsnav"]');
    const main = () => document.querySelector('main');
    const supported = () => Boolean(guildTree() && main());
    const manager = () => document.getElementById(managerId);
    const normalizedText = (value) => value.replace(/\\s+/g, ' ').trim();
    const elementName = (element, fallback) => {
      const image = element.querySelector('img');
      const imageName = image?.tagName === 'IMG' ? normalizedText(image.alt) : '';
      if (imageName) return imageName;
      const text = Array.from(element.querySelectorAll('span')).map((span) => normalizedText(span.textContent || '')).find(Boolean);
      return text || fallback;
    };
    const channelName = (element, fallback) => {
      const text = Array.from(element.querySelectorAll('span[data-text-variant]')).map((span) => normalizedText(span.textContent || '')).find(Boolean);
      return text || fallback;
    };
    const imageSource = (element) => {
      const image = element.querySelector('img');
      return image?.tagName === 'IMG' && image.src.startsWith('https://') ? image.src : null;
    };
    const createImage = (source, name, className) => {
      if (!source) {
        const fallback = document.createElement('span');
        fallback.className = className;
        fallback.textContent = name.slice(0, 2).toUpperCase();
        fallback.setAttribute('aria-hidden', 'true');
        return fallback;
      }
      const image = document.createElement('img');
      image.className = className;
      image.src = source;
      image.alt = '';
      return image;
    };
    const createLabel = (name) => {
      const label = document.createElement('span');
      label.textContent = name;
      return label;
    };
    const emitIntent = (detail) => document.dispatchEvent(new window.CustomEvent(intentEvent, { detail }));
    const markContent = () => {
      document.querySelectorAll('[' + contentAttribute + '="1"]').forEach((element) => element.removeAttribute(contentAttribute));
      document.querySelectorAll('[' + dedicatedPathAttribute + '="1"]').forEach((element) => element.removeAttribute(dedicatedPathAttribute));
      const content = main();
      content?.setAttribute(contentAttribute, '1');
      let ancestor = content?.parentElement || null;
      while (ancestor) {
        ancestor.setAttribute(dedicatedPathAttribute, '1');
        if (ancestor === document.body) break;
        ancestor = ancestor.parentElement;
      }
      return content;
    };
    const ensureStyle = () => {
      let style = document.getElementById(styleId);
      if (style?.tagName !== 'STYLE') {
        style = document.createElement('style');
        style.id = styleId;
        document.head.append(style);
      }
      if (style.textContent !== css) style.textContent = css;
    };
    const ensureManager = () => {
      let element = manager();
      if (element?.tagName !== 'DIV') {
        element = document.createElement('div');
        element.id = managerId;
        element.setAttribute('role', 'region');
        document.body.append(element);
      }
      return element;
    };
    const settle = (state) => {
      const resolve = settleHydration;
      if (!resolve) return;
      settleHydration = null;
      if (hydrationTimer !== null) window.clearTimeout(hydrationTimer);
      hydrationTimer = null;
      resolve(state);
    };
${compactDiscordNativeDataScript}
${compactDiscordManagerScript}
    const schedule = () => {
      if (disposed || scheduled) return;
      if (root.getAttribute(attribute) !== '1') {
        const state = publish(current);
        if (state === 'installed') settle(state);
        return;
      }
      scheduled = true;
      queueMicrotask(render);
    };
    const publish = (mode) => {
      if (disposed || !supported()) return 'unsupported';
      current = mode;
      ensureStyle();
      ensureManager();
      markContent();
      root.setAttribute(attribute, '1');
      root.setAttribute(modeAttribute, mode.kind);
      if (mode.kind === 'manager') root.setAttribute(tabAttribute, mode.tab); else root.removeAttribute(tabAttribute);
      lastSignature = '';
      schedule();
      return 'installed';
    };
    const setMode = (mode) => publish(mode);
    const navigate = (command) => {
      if (command?.kind === 'open-home') {
        const home = discordHome();
        if (!home) return 'missing';
        home.click();
        return 'clicked';
      }
      if (command?.kind === 'open-direct-message' && dmPattern.test(command.href)) {
        const link = directMessageLink(command.href);
        if (!link) return 'missing';
        link.click();
        return 'clicked';
      }
      return 'denied';
    };
    const selected = (event) => {
      const target = event.target instanceof window.Element ? event.target : null;
      const surface = target?.closest('#' + managerId);
      if (!target || !surface) return;
      const back = target.closest('[data-orca-action="back"]');
      if (back) {
        event.preventDefault();
        emitIntent({ kind: 'back' });
        return;
      }
      const managerTab = target.closest('[data-orca-manager-tab]')?.getAttribute('data-orca-manager-tab');
      if (managerTab === 'servers' || managerTab === 'messages' || managerTab === 'friends') {
        event.preventDefault();
        emitIntent({ kind: 'select-manager-tab', tab: managerTab });
        return;
      }
      const guildButton = target.closest('[data-orca-guild-id]');
      const guildId = guildButton?.getAttribute('data-orca-guild-id');
      const serverName = guildButton?.getAttribute('data-orca-guild-name');
      if (guildId && serverName) {
        event.preventDefault();
        emitIntent({ kind: 'select-server', serverId: guildId, serverName });
        document.querySelector('[role="treeitem"][data-list-item-id="guildsnav___' + guildId + '"]')?.click();
        return;
      }
      const channel = target.closest('[data-orca-channel-id]');
      const channelId = channel?.getAttribute('data-orca-channel-id');
      const channelName = channel?.getAttribute('data-orca-channel-name');
      if (channelId && channelName && channel?.getAttribute('data-orca-voice') !== '1' && current.kind === 'server-channels') {
        emitIntent({ kind: 'open-text-channel', serverId: current.serverId, serverName: current.serverName, channelId, channelName });
        return;
      }
      const dm = target.closest('a[href^="/channels/@me/"]');
      const href = dm?.getAttribute('href');
      const name = dm?.getAttribute('data-orca-dm-name');
      if (href && name && dmPattern.test(href)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        emitIntent({ kind: 'open-direct-message', href, name });
      }
    };
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      document.removeEventListener('click', selected, true);
      root.removeAttribute(attribute);
      root.removeAttribute(modeAttribute);
      root.removeAttribute(tabAttribute);
      document.querySelectorAll('[' + contentAttribute + '="1"]').forEach((element) => element.removeAttribute(contentAttribute));
      document.querySelectorAll('[' + dedicatedPathAttribute + '="1"]').forEach((element) => element.removeAttribute(dedicatedPathAttribute));
      document.getElementById(managerId)?.remove();
      document.getElementById(styleId)?.remove();
      delete window.__orcaDiscordFastResponse;
      delete window.__orcaDiscordFastResponseCleanup;
      settle('unsupported');
    };
    window.__orcaDiscordFastResponseCleanup?.();
    const observer = new MutationObserver(schedule);
    window.__orcaDiscordFastResponse = { navigate, setMode, mode: () => current, state: () => root.getAttribute(attribute) === '1' ? 'installed' : 'unsupported' };
    window.__orcaDiscordFastResponseCleanup = cleanup;
    document.addEventListener('click', selected, true);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const initialState = publish(current);
    if (initialState === 'installed') return initialState;
    return new Promise((resolve) => {
      settleHydration = resolve;
      hydrationTimer = window.setTimeout(cleanup, ${hydrationTimeoutMs});
    });
  })()`
}
