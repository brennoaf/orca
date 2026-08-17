import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const rendererRoot = join(process.cwd(), 'src/renderer/src')

function readRendererFile(relativePath: string): string {
  return readFileSync(join(rendererRoot, relativePath), 'utf8')
}

describe('interface theme XP styling', () => {
  it('keeps ThemeChrome background-only for every custom theme', () => {
    const themeChrome = readRendererFile('components/ThemeChrome.tsx')
    const mountedSources = [
      readRendererFile('App.tsx'),
      readRendererFile('components/sidebar/index.tsx'),
      readRendererFile('components/settings/SettingsSidebar.tsx'),
      readRendererFile('components/status-bar/StatusBar.tsx')
    ].join('\n')

    expect(themeChrome).toContain('theme-chrome theme-chrome-background')
    expect(themeChrome).not.toMatch(/titlebarSlots|sidebarSlots|statusbarSlots|TradingTape/)
    expect(mountedSources).not.toContain('<ThemeChrome slot=')
    expect(mountedSources.match(/<ThemeChrome \/>/g)).toHaveLength(1)

    for (const theme of [
      'blue-fantasy',
      'dragon-heir',
      'miku',
      'minecraft',
      'qq98',
      'ths',
      'trading',
      'whale-song',
      'xp'
    ]) {
      expect(themeChrome).toMatch(new RegExp(`['"]?${theme}['"]?:`))
    }
  })

  it('uses the verified light and dark XP palette without a global square radius', () => {
    const mainCss = readRendererFile('assets/main.css')

    expect(mainCss).toContain("[data-orca-theme='xp'] {")
    expect(mainCss).toContain('--xp-desktop: #fff;')
    expect(mainCss).toContain('--xp-panel: #f6f4ec;')
    expect(mainCss).toContain('--xp-elevated: #ece9d8;')
    expect(mainCss).toContain('--xp-border: #b3ad95;')
    expect(mainCss).toContain('--xp-input-border: #7f9db9;')
    expect(mainCss).toContain('--xp-desktop: #0d0f12;')
    expect(mainCss).toContain('--xp-panel: #15171b;')
    expect(mainCss).toContain('--xp-elevated: #1b1d21;')
    expect(mainCss).toContain('--xp-border: #3a3d42;')
    expect(mainCss).toContain('--xp-input-border: #4a4e55;')
    expect(mainCss).not.toMatch(/\[data-orca-theme='xp'\][^{]*\{[^}]*--radius:\s*0;/s)
  })

  it('scopes XP components away from protected and embedded surfaces', () => {
    const skinCss = readRendererFile('assets/interface-theme-skins.css')
    const railItem = readRendererFile(
      'components/floating-terminal/comms-rail/FloatingCommsRailItem.tsx'
    )

    expect(skinCss).toContain(":root:has(.app-layout)[data-orca-theme='xp']")
    expect(skinCss).toContain(':not(.plugin-security-chrome *)')
    expect(skinCss).toContain(':not([data-fast-response-surface] *)')
    expect(skinCss).toContain(':not([data-browser-page-pane-id] *)')
    expect(skinCss).toContain(':not([data-browser-page-pane-portal])')
    expect(skinCss).toContain(':not([data-browser-page-pane-portal] *)')
    expect(skinCss).toContain(':not(.monaco-editor *)')
    expect(skinCss).toContain(':not(.xterm *)')
    expect(railItem).toContain('data-fast-response-surface=""')
  })

  it('preserves semantic button variants and checked states', () => {
    const skinCss = readRendererFile('assets/interface-theme-skins.css')

    expect(skinCss).toMatch(
      /\[data-slot='button'\]:not\(\[data-variant='default'\]\):not\(\[data-variant='destructive'\]\)/
    )
    expect(skinCss).toContain("[data-variant='ghost']")
    expect(skinCss).toContain("[data-variant='link']")
    expect(skinCss).toContain("button[role='switch'], button[role='radio']")
    expect(skinCss).toContain("[aria-checked='true']")
    expect(skinCss).toMatch(
      /button\[role='radio'\]\[aria-disabled='true'\][^{]*\{[^}]*border-color: var\(--border\);[^}]*background: var\(--muted\);[^}]*color: var\(--muted-foreground\);[^}]*box-shadow: none;[^}]*cursor: default;/s
    )
  })

  it('preserves worktree selection and browser dropdown provenance', () => {
    const skinCss = readRendererFile('assets/interface-theme-skins.css')
    const browserMenuSources = [
      readRendererFile('components/browser-pane/BrowserPane.tsx'),
      readRendererFile('components/browser-pane/BrowserImportHintButton.tsx'),
      readRendererFile('components/browser-pane/browser-toolbar-menu-dropdown.tsx')
    ]

    expect(skinCss).toContain("[data-worktree-card-active='primary']")
    expect(skinCss).toContain("[data-worktree-card-active='secondary']")
    expect(skinCss).toContain("[data-selected='true']")

    for (const source of browserMenuSources) {
      const menuContents = source.match(/<DropdownMenu(?:Sub)?Content\b[^>]*>/gs) ?? []
      expect(menuContents.length).toBeGreaterThan(0)
      expect(
        menuContents.every((content) => content.includes('data-browser-page-pane-portal=""'))
      ).toBe(true)
    }
  })

  it('uses Zune controls and real XP surface tokens and scrollbars', () => {
    const mainCss = readRendererFile('assets/main.css')
    const skinCss = readRendererFile('assets/interface-theme-skins.css')
    const sharedTheme = readFileSync(join(process.cwd(), 'src/shared/interface-theme.ts'), 'utf8')

    expect(mainCss).toContain('--editor-surface: #0d0f12;')
    expect(mainCss).toContain('--worktree-sidebar: #15171b;')
    expect(mainCss).toContain('--worktree-sidebar-border: #3a3d42;')
    expect(sharedTheme).toMatch(/xp:\s*\{[\s\S]*?dark:\s*\{\s*background: '#0d0f12'/)
    expect(skinCss).toContain(".dark[data-orca-theme='xp'] body .window-controls-btn svg")
    expect(skinCss).toContain(".dark[data-orca-theme='xp'] body .window-controls-close svg")
    expect(skinCss).toContain(
      ':is(.scrollbar-sleek, .scrollbar-sleek-lg, .worktree-sidebar-scrollbar)'
    )
    expect(skinCss).toMatch(
      /:is\(\.scrollbar-sleek, \.scrollbar-sleek-lg, \.worktree-sidebar-scrollbar\)[^{]*:not\(\s*\.plugin-security-chrome\s*\)[^{]*:not\(\s*\.plugin-security-chrome \*\s*\)/s
    )
    expect(skinCss).toContain("[data-file-explorer-row]:not([data-selected='true']):hover")
  })

  it('contains no faux titlebar sidebar or statusbar skin chrome', () => {
    const skinCss = readRendererFile('assets/interface-theme-skins.css')

    expect(skinCss).not.toMatch(
      /theme-chrome-(?:titlebar|sidebar|statusbar)|skin-(?:candles|waveform|xp-tiles|quote-chip|trading-track|xp-start)/
    )
  })

  it('includes the complete XP.css MIT notice', () => {
    const notices = readFileSync(join(process.cwd(), 'THIRD_PARTY_NOTICES.md'), 'utf8')

    expect(notices).toContain('## XP.css')
    expect(notices).toContain('Copyright 2020 Adam Hammad, Jordan Scales')
    expect(notices).toContain(
      'Permission is hereby granted, free of charge, to any person obtaining a copy'
    )
    expect(notices).toContain(
      'THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED'
    )
  })
})
