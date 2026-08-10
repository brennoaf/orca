import type { BrowserWindow } from 'electron'

export function recoverCommunicationsDockAfterCrash(args: {
  generation: number
  currentGeneration: number
  window: BrowserWindow | null
  desiredVisible: boolean
  clearWindow: () => void
  recreate: () => void
}): void {
  if (args.generation !== args.currentGeneration) {
    return
  }
  args.clearWindow()
  if (args.window && !args.window.isDestroyed()) {
    args.window.destroy()
  }
  if (args.desiredVisible) {
    args.recreate()
  }
}
