import { app, BrowserWindow, nativeTheme } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import type { Store } from '../persistence'
import type { KeybindingOverrides } from '../../shared/keybindings'
import { nativeZoomCommandMatchesKeybindings } from '../../shared/window-shortcut-policy'
import { installPrivilegedWindowNavigationPolicy } from './privileged-window-navigation'
import { rectHasVisibleAreaOnAnyDisplay } from './window-bounds-validation'
import { applyWindowZoomStep, resolveWindowZoomShortcut } from './window-zoom-shortcuts'
import {
  readDiscordVoiceOverlayLayout,
  updateDiscordVoiceOverlayLayout,
  type DiscordVoiceOverlayBounds
} from './discord-voice-overlay-layout'
import {
  isDiscordVoiceInCall,
  onDiscordVoiceCallStateChanged
} from '../messaging/discord-voice-service'

const MIN_WIDTH = 280
const MIN_HEIGHT = 240
const DEFAULT_WIDTH = 360
const DEFAULT_HEIGHT = 520
const COMPACT_WIDTH = 240
const COMPACT_HEIGHT = 48
const BOUNDS_SAVE_DEBOUNCE_MS = 500
const DISCORD_VOICE_PARTITION = 'orca-discord-voice'

type DiscordVoiceOverlayHost = {
  store: Store | null
  getKeybindings?: () => KeybindingOverrides | undefined
}

let overlayHost: DiscordVoiceOverlayHost = { store: null }

export function registerDiscordVoiceOverlayHost(host: DiscordVoiceOverlayHost): void {
  overlayHost = host
}

let discordVoiceWindow: BrowserWindow | null = null
let releaseOverlay: (() => void) | null = null

function loadDiscordVoiceOverlay(window: BrowserWindow): void {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/discord-voice.html`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/discord-voice.html'))
  }
}

function resolveRestoredBounds(): DiscordVoiceOverlayBounds | null {
  const raw = readDiscordVoiceOverlayLayout().bounds
  if (
    raw &&
    raw.width >= MIN_WIDTH &&
    raw.height >= MIN_HEIGHT &&
    rectHasVisibleAreaOnAnyDisplay(raw, MIN_WIDTH / 2, MIN_HEIGHT / 2)
  ) {
    return raw
  }
  if (raw) {
    console.warn('[discord-voice] Discarding off-screen/near-min overlay bounds:', raw)
  }
  return null
}

function applyCompactMode(window: BrowserWindow, compact: boolean): void {
  const { x, y } = window.getBounds()
  if (compact) {
    window.setResizable(false)
    window.setMinimumSize(COMPACT_WIDTH, COMPACT_HEIGHT)
    window.setBounds({ x, y, width: COMPACT_WIDTH, height: COMPACT_HEIGHT })
    return
  }
  const expanded = readDiscordVoiceOverlayLayout().bounds
  window.setMinimumSize(MIN_WIDTH, MIN_HEIGHT)
  window.setResizable(true)
  window.setBounds({
    x,
    y,
    width: expanded?.width ?? DEFAULT_WIDTH,
    height: expanded?.height ?? DEFAULT_HEIGHT
  })
}

export function setDiscordVoiceOverlayCompact(compact: boolean): boolean {
  const window = discordVoiceWindow
  if (!window || window.isDestroyed()) {
    return readDiscordVoiceOverlayLayout().compact
  }
  updateDiscordVoiceOverlayLayout({ compact })
  applyCompactMode(window, compact)
  return compact
}

export function getDiscordVoiceOverlayCompact(): boolean {
  return readDiscordVoiceOverlayLayout().compact
}

export function getDiscordVoiceOverlayState(): { open: boolean } {
  return { open: discordVoiceWindow !== null && !discordVoiceWindow.isDestroyed() }
}

export function createOrFocusDiscordVoiceWindow(): BrowserWindow {
  if (discordVoiceWindow && !discordVoiceWindow.isDestroyed()) {
    if (discordVoiceWindow.isMinimized()) {
      discordVoiceWindow.restore()
    }
    if (isDiscordVoiceInCall()) {
      discordVoiceWindow.show()
    }
    return discordVoiceWindow
  }

  const layout = readDiscordVoiceOverlayLayout()
  const savedBounds = resolveRestoredBounds()
  const compact = layout.compact
  const store = overlayHost.store
  const getKeybindings = overlayHost.getKeybindings

  const window = new BrowserWindow({
    width: compact ? COMPACT_WIDTH : (savedBounds?.width ?? DEFAULT_WIDTH),
    height: compact ? COMPACT_HEIGHT : (savedBounds?.height ?? DEFAULT_HEIGHT),
    ...(savedBounds ? { x: savedBounds.x, y: savedBounds.y } : {}),
    minWidth: compact ? COMPACT_WIDTH : MIN_WIDTH,
    minHeight: compact ? COMPACT_HEIGHT : MIN_HEIGHT,
    resizable: !compact,
    title: 'Orca Discord Call',
    show: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      partition: DISCORD_VOICE_PARTITION,
      webviewTag: false
    }
  })
  installPrivilegedWindowNavigationPolicy(window.webContents)
  window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false)
  )
  window.webContents.session.setPermissionCheckHandler(() => false)
  discordVoiceWindow = window

  window.webContents.on('dom-ready', () => {
    if (!window.isDestroyed()) {
      window.webContents.setZoomLevel(store?.getUI().uiZoomLevel ?? 0)
    }
  })
  let lastFollowedZoomLevel = store?.getUI().uiZoomLevel ?? 0
  const unsubscribeUIChanged = store?.onUIChanged((ui) => {
    const level = ui.uiZoomLevel ?? 0
    if (level === lastFollowedZoomLevel) {
      return
    }
    lastFollowedZoomLevel = level
    if (!window.isDestroyed()) {
      window.webContents.setZoomLevel(level)
    }
  })

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') {
      return
    }
    const direction = resolveWindowZoomShortcut(input, getKeybindings?.())
    if (direction) {
      event.preventDefault()
      applyWindowZoomStep(window, direction)
    }
  })

  window.webContents.on('zoom-changed', (event, direction) => {
    if (
      (direction === 'in' || direction === 'out') &&
      nativeZoomCommandMatchesKeybindings(direction, process.platform, getKeybindings?.(), {
        context: 'app'
      })
    ) {
      event.preventDefault()
      applyWindowZoomStep(window, direction)
    }
  })

  window.once('ready-to-show', () => {
    if (!window.isDestroyed() && isDiscordVoiceInCall()) {
      window.show()
    }
  })

  const unsubscribeCallState = onDiscordVoiceCallStateChanged((inCall) => {
    if (window.isDestroyed()) {
      return
    }
    if (!inCall) {
      window.hide()
      return
    }
    window.showInactive()
  })

  let boundsTimer: ReturnType<typeof setTimeout> | null = null
  let windowClosing = false
  const saveBounds = (): void => {
    if (boundsTimer) {
      clearTimeout(boundsTimer)
    }
    boundsTimer = setTimeout(() => {
      boundsTimer = null
      if (windowClosing || window.isDestroyed() || window.isMinimized()) {
        return
      }
      const bounds = window.getBounds()
      if (readDiscordVoiceOverlayLayout().compact) {
        const expanded = readDiscordVoiceOverlayLayout().bounds
        updateDiscordVoiceOverlayLayout({
          bounds: {
            x: bounds.x,
            y: bounds.y,
            width: expanded?.width ?? DEFAULT_WIDTH,
            height: expanded?.height ?? DEFAULT_HEIGHT
          }
        })
        return
      }
      if (bounds.width < MIN_WIDTH || bounds.height < MIN_HEIGHT) {
        return
      }
      updateDiscordVoiceOverlayLayout({ bounds })
    }, BOUNDS_SAVE_DEBOUNCE_MS)
  }
  window.on('resize', saveBounds)
  window.on('move', saveBounds)

  const freezeBounds = (): void => {
    windowClosing = true
    if (boundsTimer) {
      clearTimeout(boundsTimer)
      boundsTimer = null
    }
  }
  window.on('close', freezeBounds)
  app.on('before-quit', freezeBounds)

  let released = false
  const release = (): void => {
    if (released) {
      return
    }
    released = true
    releaseOverlay = null
    app.removeListener('before-quit', freezeBounds)
    freezeBounds()
    unsubscribeUIChanged?.()
    unsubscribeCallState()
    if (discordVoiceWindow === window) {
      discordVoiceWindow = null
    }
  }
  releaseOverlay = release
  window.on('closed', release)

  loadDiscordVoiceOverlay(window)
  return window
}

export function closeDiscordVoiceWindow(): void {
  const window = discordVoiceWindow
  const release = releaseOverlay
  discordVoiceWindow = null
  release?.()
  if (window && !window.isDestroyed()) {
    window.close()
  }
}
