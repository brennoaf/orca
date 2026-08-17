import { shell, type WebContents } from 'electron'

type IsInternalUrl = (url: string) => boolean

function isExternalHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function openExternal(url: string): void {
  void shell.openExternal(url).catch((error: unknown) => {
    console.warn('[communication-web] failed to open external link', error)
  })
}

function openInternal(webContents: WebContents, url: string): void {
  void webContents.loadURL(url).catch((error: unknown) => {
    console.warn('[communication-web] failed to open internal popup', error)
  })
}

export function configureCommunicationWebNavigation(
  webContents: WebContents,
  isInternalUrl: IsInternalUrl
): void {
  webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalUrl(url)) {
      openInternal(webContents, url)
      return { action: 'deny' }
    }
    if (isExternalHttpUrl(url)) {
      openExternal(url)
    }
    return { action: 'deny' }
  })
  const handleNavigation = (event: Electron.Event, url: string): void => {
    if (isInternalUrl(url)) {
      return
    }
    event.preventDefault()
    if (isExternalHttpUrl(url)) {
      openExternal(url)
    }
  }
  webContents.on('will-navigate', handleNavigation)
  webContents.on('will-redirect', handleNavigation)
}
