import type { WebContentsView } from 'electron'

export class DiscordCompactIntentAvailability {
  private available = false
  private revision = 0

  admits(revision: number): boolean {
    return this.available && revision === this.revision
  }

  refresh(view: WebContentsView, available: boolean): void {
    if (available === this.available) {
      return
    }
    this.available = available
    this.revision += 1
    this.publish(view)
  }

  disable(view: WebContentsView): void {
    this.available = false
    this.revision += 1
    this.publish(view)
  }

  invalidate(): void {
    this.available = false
    this.revision += 1
  }

  private publish(view: WebContentsView): void {
    if (view.webContents.isDestroyed()) {
      return
    }
    view.webContents.send('discordWebFastResponse:compactAvailability', {
      available: this.available,
      revision: this.revision
    })
  }
}
