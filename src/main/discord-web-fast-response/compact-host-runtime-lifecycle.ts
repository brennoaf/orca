import type { BrowserWindow, WebContents, WebContentsView } from 'electron'
import type { Store } from '../persistence'
import type {
  DiscordWebFastResponseContentMode,
  DiscordWebFastResponseState,
  DiscordWebFastResponseVisibility
} from '../../shared/discord-web-fast-response'
import type { CompactDiscordAdapterState, CompactDiscordMode } from './compact-dom-mode'
import { CompactDiscordAdapterHydration } from './compact-adapter-hydration'
import {
  getDiscordVoiceSnapshot,
  onDiscordVoiceSnapshotChanged
} from '../messaging/discord-voice-service'
import { isDiscordVoiceSelectionAvailable } from './voice-selection-availability'
import { DiscordCompactIntentAvailability } from './compact-intent-availability'

export type DiscordWebFastResponseOwner = {
  identity: string
  request: DiscordWebFastResponseVisibility
  sender: WebContents
  senderId: number
  window: BrowserWindow
  closed: () => void
}

export abstract class DiscordWebFastResponseRuntimeLifecycle {
  protected view: WebContentsView | null = null
  protected owner: DiscordWebFastResponseOwner | null = null
  protected loaded = false
  protected crashed = false
  protected visible = false
  protected contentMode: DiscordWebFastResponseContentMode = 'loading'
  protected serial: Promise<void> = Promise.resolve()
  protected revision = 0
  protected compactMode: CompactDiscordMode = { kind: 'manager', tab: 'servers' }
  protected compactReturnMode: CompactDiscordMode | null = null
  protected adapterState: CompactDiscordAdapterState = 'unsupported'
  protected voiceRevision = 0
  protected readonly compactIntentAvailability = new DiscordCompactIntentAvailability()
  protected readonly adapterHydration = new CompactDiscordAdapterHydration()
  private voiceAvailable = false
  private readonly removeVoiceSnapshotListener: () => void

  constructor(protected readonly store: Store) {
    this.removeVoiceSnapshotListener = onDiscordVoiceSnapshotChanged(() => {
      this.refreshVoiceSelectionAvailability()
    })
  }

  protected abstract compactHubCanClose(): boolean
  protected abstract clearCompactReturnMode(): void

  protected enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.serial.then(operation, operation)
    this.serial = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  protected detach(): void {
    const owner = this.owner
    if (!owner) {
      return
    }
    if (this.view) {
      this.adapterHydration.cancel(this.view)
    }
    if (this.view) {
      this.disableVoiceSelection(this.view)
    }
    if (this.view) {
      this.compactIntentAvailability.disable(this.view)
    }
    owner.window.removeListener('closed', owner.closed)
    if (this.view && !owner.window.isDestroyed()) {
      owner.window.contentView.removeChildView(this.view)
    }
    this.owner = null
  }

  protected handleOwnerDestroyed(window: BrowserWindow): void {
    if (this.owner?.window !== window) {
      return
    }
    if (this.view) {
      this.adapterHydration.cancel(this.view)
    }
    if (this.view) {
      this.disableVoiceSelection(this.view)
    }
    if (this.view) {
      this.compactIntentAvailability.disable(this.view)
    }
    this.owner = null
    this.clearCompactReturnMode()
    this.visible = false
    this.view?.setVisible(false)
  }

  protected publish(state: DiscordWebFastResponseState): void {
    if (!this.owner || this.owner.sender.isDestroyed()) {
      return
    }
    this.owner.sender.send('discordWebFastResponse:stateChanged', {
      contentMode: this.contentMode,
      identity: this.owner.request,
      state,
      recoverable: state !== 'ready' && state !== 'login'
    })
  }

  protected publishCompactMode(): void {
    if (!this.owner || this.owner.sender.isDestroyed()) {
      return
    }
    this.owner.sender.send('discordWebFastResponse:compactModeChanged', {
      canClose: this.compactHubCanClose(),
      mode: this.compactMode
    })
  }

  protected isVoiceSelectionAvailable(): boolean {
    return Boolean(
      this.owner &&
      this.visible &&
      this.loaded &&
      this.contentMode === 'ready' &&
      this.adapterState === 'installed' &&
      isDiscordVoiceSelectionAvailable(getDiscordVoiceSnapshot()) &&
      this.view &&
      !this.view.webContents.isDestroyed()
    )
  }

  protected refreshVoiceSelectionAvailability(): void {
    const view = this.view
    if (!view || view.webContents.isDestroyed()) {
      return
    }
    const available = this.isVoiceSelectionAvailable()
    if (available === this.voiceAvailable) {
      return
    }
    this.voiceAvailable = available
    this.voiceRevision += 1
    view.webContents.send('discordWebFastResponse:voiceAvailability', {
      available,
      revision: this.voiceRevision
    })
  }

  protected disableVoiceSelection(view: WebContentsView): void {
    this.voiceAvailable = false
    this.voiceRevision += 1
    if (view.webContents.isDestroyed()) {
      return
    }
    view.webContents.send('discordWebFastResponse:voiceAvailability', {
      available: false,
      revision: this.voiceRevision
    })
  }

  protected invalidateVoiceSelection(): void {
    this.voiceAvailable = false
    this.voiceRevision += 1
  }

  protected isCompactIntentAvailable(): boolean {
    return Boolean(
      this.owner &&
      this.visible &&
      this.loaded &&
      this.contentMode === 'ready' &&
      this.adapterState === 'installed' &&
      this.view &&
      !this.view.webContents.isDestroyed()
    )
  }

  protected removeVoiceSelectionListener(): void {
    this.removeVoiceSnapshotListener()
  }
}
