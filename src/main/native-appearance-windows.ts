import type { BrowserWindow, WebContents } from 'electron'

type Registration = { cleanup: () => void; window: BrowserWindow }

const registrations = new Map<WebContents, Registration>()

export function registerNativeAppearanceWindow(window: BrowserWindow): () => void {
  const contents = window.webContents
  const existing = registrations.get(contents)
  if (existing) {
    return existing.cleanup
  }
  const cleanup = (): void => {
    if (registrations.get(contents)?.cleanup !== cleanup) {
      return
    }
    registrations.delete(contents)
    window.removeListener('closed', cleanup)
    contents.removeListener('destroyed', cleanup)
  }
  registrations.set(contents, { cleanup, window })
  window.once('closed', cleanup)
  contents.once('destroyed', cleanup)
  return cleanup
}

export function isNativeAppearanceWindow(contents: WebContents): boolean {
  return registrations.has(contents) && !contents.isDestroyed()
}

export function sendToNativeAppearanceWindows(channel: string, payload: unknown): void {
  for (const [contents, registration] of registrations) {
    if (registration.window.isDestroyed() || contents.isDestroyed()) {
      registration.cleanup()
    } else {
      contents.send(channel, payload)
    }
  }
}

export function clearNativeAppearanceWindows(): void {
  for (const registration of registrations.values()) {
    registration.cleanup()
  }
}
