import type { BrowserWindow, WebContents } from 'electron'
import type { CommunicationsDockIdentity } from '../../shared/communications-dock'

export function isCommunicationsDockSender(args: {
  window: BrowserWindow | null
  sender: WebContents
  generation: number
  revision: number
  identity?: CommunicationsDockIdentity
}): boolean {
  return Boolean(
    args.window &&
    !args.window.isDestroyed() &&
    args.window.webContents === args.sender &&
    !args.sender.isDestroyed() &&
    (!args.identity ||
      (args.identity.generation === args.generation && args.identity.revision === args.revision))
  )
}

export function requireCommunicationsDockSender(args: {
  window: BrowserWindow | null
  sender: WebContents
  generation: number
  revision: number
  identity?: CommunicationsDockIdentity
  error: string
}): void {
  if (!isCommunicationsDockSender(args)) {
    throw new Error(args.error)
  }
}
