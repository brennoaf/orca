export const interfaceThemeDefinitions = [
  {
    id: 'default',
    name: 'Default',
    chrome: 'default',
    preview: [
      'var(--background)',
      'var(--sidebar)',
      'var(--card)',
      'var(--accent)',
      'var(--foreground)',
      'var(--muted-foreground)'
    ]
  },
  {
    id: 'blue-fantasy',
    name: 'Blue Fantasy',
    chrome: 'glass',
    preview: ['#10243d', '#0b1c31', '#173555', '#5ba4e5', '#e5f2ff', '#9db9d3']
  },
  {
    id: 'dragon-heir',
    name: 'Dragon Heir',
    chrome: 'ink',
    preview: ['#241817', '#19100f', '#392421', '#d58b43', '#f7e9d1', '#c9aa8a']
  },
  {
    id: 'miku',
    name: 'Miku',
    chrome: 'music',
    preview: ['#102a2d', '#0b2022', '#164146', '#42d7c8', '#e1fffb', '#98d5d0']
  },
  {
    id: 'minecraft',
    name: 'Minecraft',
    chrome: 'voxel',
    preview: ['#292e24', '#20251b', '#3a4630', '#8eb34f', '#edf2dc', '#bac9a2']
  },
  {
    id: 'qq98',
    name: 'QQ98',
    chrome: 'crystal',
    preview: ['#e6f2ff', '#c9e2fb', '#ffffff', '#2684df', '#17395f', '#5a7da2']
  },
  {
    id: 'ths',
    name: 'THS',
    chrome: 'terminal',
    preview: ['#191a22', '#12131a', '#272936', '#b399ff', '#f0edff', '#b7b2ce']
  },
  {
    id: 'trading',
    name: 'Trading',
    chrome: 'ticker',
    preview: ['#101923', '#0b1219', '#172634', '#36c98a', '#e2fff3', '#9acbb7']
  },
  {
    id: 'whale-song',
    name: 'Whale Song',
    chrome: 'ocean',
    preview: ['#142238', '#0d192a', '#1e3451', '#70b7ed', '#e8f5ff', '#a9c8df']
  },
  {
    id: 'xp',
    name: 'XP',
    chrome: 'luna',
    preview: ['#eaf4ff', '#245edb', '#ffffff', '#3f8b28', '#173b83', '#5272ad']
  }
] as const

export type InterfaceTheme = (typeof interfaceThemeDefinitions)[number]['id']
export type CustomInterfaceTheme = Exclude<InterfaceTheme, 'default'>

export type InterfaceThemeMode = 'dark' | 'light'

export type InterfaceThemeSurfacePalette = {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
  selectionForeground: string
}

export const interfaceThemeSurfacePalettes = {
  'blue-fantasy': {
    light: {
      background: '#e8ecf5',
      foreground: '#1d2539',
      cursor: '#4a5fa8',
      cursorAccent: '#ffffff',
      selectionBackground: '#4a5fa8',
      selectionForeground: '#ffffff'
    },
    dark: {
      background: '#101624',
      foreground: '#dbe2f2',
      cursor: '#7f96d2',
      cursorAccent: '#10141f',
      selectionBackground: '#7f96d2',
      selectionForeground: '#10141f'
    }
  },
  'dragon-heir': {
    light: {
      background: '#f4efe4',
      foreground: '#262319',
      cursor: '#c3272b',
      cursorAccent: '#ffffff',
      selectionBackground: '#c3272b',
      selectionForeground: '#ffffff'
    },
    dark: {
      background: '#12161f',
      foreground: '#eef1f6',
      cursor: '#c8a24a',
      cursorAccent: '#12161f',
      selectionBackground: '#c8a24a',
      selectionForeground: '#12161f'
    }
  },
  miku: {
    light: {
      background: '#eef5ff',
      foreground: '#1d2f52',
      cursor: '#2e9bff',
      cursorAccent: '#0a1430',
      selectionBackground: '#2e9bff',
      selectionForeground: '#ffffff'
    },
    dark: {
      background: '#0a1430',
      foreground: '#c2d4f0',
      cursor: '#2e9bff',
      cursorAccent: '#0a1430',
      selectionBackground: '#2e9bff',
      selectionForeground: '#ffffff'
    }
  },
  minecraft: {
    light: {
      background: '#2b3427',
      foreground: '#f2ead9',
      cursor: '#ffffa0',
      cursorAccent: '#000000',
      selectionBackground: '#ffffa0',
      selectionForeground: '#000000'
    },
    dark: {
      background: '#060a07',
      foreground: '#e7ead7',
      cursor: '#ffffa0',
      cursorAccent: '#000000',
      selectionBackground: '#ffffa0',
      selectionForeground: '#000000'
    }
  },
  qq98: {
    light: {
      background: '#eef4fa',
      foreground: '#0e2f5e',
      cursor: '#2b7cd9',
      cursorAccent: '#ffffff',
      selectionBackground: '#2b7cd9',
      selectionForeground: '#ffffff'
    },
    dark: {
      background: '#15233a',
      foreground: '#c2d6ec',
      cursor: '#6aa8f0',
      cursorAccent: '#081a33',
      selectionBackground: '#2b7cd9',
      selectionForeground: '#ffffff'
    }
  },
  ths: {
    light: {
      background: '#e9edf2',
      foreground: '#1f2733',
      cursor: '#e60012',
      cursorAccent: '#ffffff',
      selectionBackground: '#f5c3c7',
      selectionForeground: '#1f2733'
    },
    dark: {
      background: '#10151d',
      foreground: '#d7dde6',
      cursor: '#ff5a5a',
      cursorAccent: '#10151d',
      selectionBackground: '#593039',
      selectionForeground: '#ffffff'
    }
  },
  trading: {
    light: {
      background: '#eef1f5',
      foreground: '#1b2431',
      cursor: '#13a36f',
      cursorAccent: '#ffffff',
      selectionBackground: '#bfe7d7',
      selectionForeground: '#1b2431'
    },
    dark: {
      background: '#0a0e15',
      foreground: '#dbe2ec',
      cursor: '#13a36f',
      cursorAccent: '#0a0e15',
      selectionBackground: '#244c3f',
      selectionForeground: '#ffffff'
    }
  },
  'whale-song': {
    light: {
      background: '#d0e8f8',
      foreground: '#0a1e4a',
      cursor: '#4d8fd4',
      cursorAccent: '#ffffff',
      selectionBackground: '#4d8fd4',
      selectionForeground: '#ffffff'
    },
    dark: {
      background: '#081a40',
      foreground: '#d8e5f5',
      cursor: '#8ab4de',
      cursorAccent: '#081a40',
      selectionBackground: '#8ab4de',
      selectionForeground: '#081a40'
    }
  },
  xp: {
    light: {
      background: '#ffffff',
      foreground: '#000000',
      cursor: '#0a246a',
      cursorAccent: '#ffffff',
      selectionBackground: '#316ac5',
      selectionForeground: '#ffffff'
    },
    dark: {
      background: '#0d0f12',
      foreground: '#e8eaed',
      cursor: '#7d9dbc',
      cursorAccent: '#0d0f12',
      selectionBackground: '#316ac5',
      selectionForeground: '#ffffff'
    }
  }
} as const satisfies Record<
  CustomInterfaceTheme,
  Record<InterfaceThemeMode, InterfaceThemeSurfacePalette>
>

export const interfaceThemes = interfaceThemeDefinitions.map(({ id }) => id)
export const customInterfaceThemes = interfaceThemes.filter(
  (theme): theme is CustomInterfaceTheme => theme !== 'default'
)

export function getInterfaceThemeSurfacePalette(
  theme: CustomInterfaceTheme,
  mode: InterfaceThemeMode
): InterfaceThemeSurfacePalette {
  return interfaceThemeSurfacePalettes[theme][mode]
}

export function normalizeInterfaceTheme(value: unknown): InterfaceTheme {
  return typeof value === 'string' && interfaceThemes.includes(value as InterfaceTheme)
    ? (value as InterfaceTheme)
    : 'default'
}
