import { DISCORD_WEB_COMPACT_INTENT_EVENT } from '../../shared/discord-web-fast-response'

export const DISCORD_COMPACT_DOM = {
  attribute: 'data-orca-discord-fast-response',
  modeAttribute: 'data-orca-discord-fast-response-mode',
  tabAttribute: 'data-orca-discord-fast-response-tab',
  contentAttribute: 'data-orca-discord-fast-response-content',
  dedicatedPathAttribute: 'data-orca-discord-dedicated-path',
  managerId: 'orca-discord-fast-response-manager',
  styleId: 'orca-discord-fast-response-style',
  intentEvent: DISCORD_WEB_COMPACT_INTENT_EVENT
} as const

const { attribute, modeAttribute, contentAttribute, dedicatedPathAttribute, managerId } =
  DISCORD_COMPACT_DOM

export const compactDiscordCss = `
html[${attribute}="1"],html[${attribute}="1"] body{height:100%!important;overflow:hidden!important}
html[${attribute}="1"] #${managerId}{position:fixed;inset:0;z-index:2147483000;display:none;box-sizing:border-box;overflow:auto;background:var(--background-base-lower,#111214);color:var(--text-normal,#dbdee1);font:500 13px/1.35 var(--font-primary,Arial,sans-serif);scrollbar-width:thin}
html[${attribute}="1"][${modeAttribute}="manager"] #${managerId},html[${attribute}="1"][${modeAttribute}="server-channels"] #${managerId}{display:block}
html[${attribute}="1"] #${managerId} *{box-sizing:border-box}
html[${attribute}="1"] #${managerId} .orca-discord-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(116px,1fr));gap:8px;padding:12px}
html[${attribute}="1"] #${managerId} .orca-discord-manager-tabs{position:sticky;top:0;z-index:1;display:grid;width:100%;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;overflow:visible;border-bottom:1px solid var(--background-modifier-accent,rgba(255,255,255,.08));padding:8px;background:var(--background-base-lower,#111214)}
html[${attribute}="1"] #${managerId} .orca-discord-manager-tab{display:inline-flex;min-width:0;min-height:40px;align-items:center;justify-content:center;border:0;border-radius:6px;background:transparent;color:inherit;font:inherit;cursor:pointer;padding:6px 8px}
html[${attribute}="1"] #${managerId} .orca-discord-manager-tab[aria-selected="true"],html[${attribute}="1"] #${managerId} .orca-discord-manager-tab:hover,html[${attribute}="1"] #${managerId} .orca-discord-manager-tab:focus-visible{outline:0;background:var(--background-modifier-hover,rgba(255,255,255,.08))}
html[${attribute}="1"] #${managerId} .orca-discord-list{display:flex;min-height:100%;flex-direction:column;gap:2px;padding:8px}
html[${attribute}="1"] #${managerId} .orca-discord-card,html[${attribute}="1"] #${managerId} .orca-discord-row,html[${attribute}="1"] #${managerId} .orca-discord-back{border:0;background:transparent;color:inherit;font:inherit;cursor:pointer}
html[${attribute}="1"] #${managerId} .orca-discord-card{display:flex;min-width:0;flex-direction:column;align-items:center;gap:8px;border-radius:8px;padding:12px 8px;text-align:center}
html[${attribute}="1"] #${managerId} .orca-discord-card:hover,html[${attribute}="1"] #${managerId} .orca-discord-card:focus-visible,html[${attribute}="1"] #${managerId} .orca-discord-row:hover,html[${attribute}="1"] #${managerId} .orca-discord-row:focus-visible,html[${attribute}="1"] #${managerId} .orca-discord-back:hover,html[${attribute}="1"] #${managerId} .orca-discord-back:focus-visible{outline:0;background:var(--background-modifier-hover,rgba(255,255,255,.08))}
html[${attribute}="1"] #${managerId} .orca-discord-card img,html[${attribute}="1"] #${managerId} .orca-discord-avatar{display:grid;width:48px;height:48px;flex:0 0 48px;place-items:center;border-radius:16px;object-fit:cover;background:var(--background-modifier-active,rgba(255,255,255,.12))}
html[${attribute}="1"] #${managerId} .orca-discord-card span,html[${attribute}="1"] #${managerId} .orca-discord-row span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
html[${attribute}="1"] #${managerId} .orca-discord-row{display:flex;width:100%;min-width:0;align-items:center;gap:10px;border-radius:6px;padding:8px;text-align:left}
html[${attribute}="1"] #${managerId} .orca-discord-row .orca-discord-avatar{width:32px;height:32px;flex-basis:32px;border-radius:50%}
html[${attribute}="1"] #${managerId} .orca-discord-channel{min-height:36px}
html[${attribute}="1"] #${managerId} .orca-discord-channel::before{content:'#';width:18px;flex:0 0 18px;color:var(--channels-default,#949ba4);font-size:18px;text-align:center}
html[${attribute}="1"] #${managerId} .orca-discord-channel[data-orca-voice="1"]::before{content:'◖';font-size:16px}
html[${attribute}="1"] #${managerId} .orca-discord-toolbar{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:8px;min-height:40px;border-bottom:1px solid var(--background-modifier-accent,rgba(255,255,255,.08));padding:6px 8px;background:var(--background-base-lower,#111214)}
html[${attribute}="1"] #${managerId} .orca-discord-back{display:inline-flex;width:28px;height:28px;align-items:center;justify-content:center;border-radius:6px;font-size:22px;line-height:1}
html[${attribute}="1"] #${managerId} .orca-discord-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:650}
html[${attribute}="1"] #${managerId} .orca-discord-empty{display:flex;min-height:180px;align-items:center;justify-content:center;padding:20px;color:var(--text-muted,#949ba4);text-align:center}
html[${attribute}="1"][${modeAttribute}="manager"] [${contentAttribute}="1"],html[${attribute}="1"][${modeAttribute}="server-channels"] [${contentAttribute}="1"]{visibility:hidden!important}
html[${attribute}="1"][${modeAttribute}="dedicated"] #${managerId}{display:block;inset:0 0 auto;overflow:visible;background:transparent}
html[${attribute}="1"][${modeAttribute}="dedicated"] #${managerId} .orca-discord-toolbar{background:var(--background-base-lower,#111214)}
html[${attribute}="1"][${modeAttribute}="dedicated"] [${dedicatedPathAttribute}="1"]>:not([${dedicatedPathAttribute}="1"]):not([${contentAttribute}="1"]):not(#${managerId}){display:none!important}
html[${attribute}="1"][${modeAttribute}="dedicated"] [${contentAttribute}="1"]{position:fixed!important;inset:40px 0 0!important;z-index:2147482999!important;display:flex!important;width:auto!important;height:auto!important;min-width:0!important}
html[${attribute}="1"] [${contentAttribute}="1"]{min-width:0!important;flex:1 1 auto!important}
`
