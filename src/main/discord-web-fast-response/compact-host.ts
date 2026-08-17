import { BrowserWindow } from 'electron'
import type { WebContents } from 'electron'
import type { Store } from '../persistence'
import type {
  DiscordWebFastResponseAttach,
  DiscordWebFastResponseSnapshot,
  DiscordWebFastResponseVisibility,
  DiscordWebCompactIntent,
  DiscordWebVoiceSelection
} from '../../shared/discord-web-fast-response'
import type { CompactDiscordMode, CompactDiscordModeState } from './compact-dom-mode'
import { DiscordWebFastResponseHostLifecycle } from './compact-host-lifecycle'
import {
  discordWebFastResponseContentBounds,
  discordWebFastResponseOwnerIdentity,
  discordWebFastResponseVisibilityIdentity
} from './compact-host-attachment'
import { handleDiscordCompactIntent, managerTabForMode } from './compact-intent-transitions'
import {
  recordDiscordVoiceSelectionFailure,
  selectDiscordVoiceChannel
} from '../messaging/discord-voice-service'

export class DiscordWebFastResponseHost extends DiscordWebFastResponseHostLifecycle {
  constructor(store: Store) {
    super(store)
  }

  attach(
    sender: WebContents,
    request: DiscordWebFastResponseAttach
  ): Promise<DiscordWebFastResponseSnapshot> {
    const candidateWindow = BrowserWindow.fromWebContents(sender)
    if (!candidateWindow || candidateWindow.isDestroyed()) {
      return Promise.reject(new Error('discord_web_fast_response_owner_denied'))
    }
    if (this.view) {
      this.adapterHydration.cancel(this.view)
    }
    return this.enqueue(async () => {
      const window = BrowserWindow.fromWebContents(sender)
      if (!window || window.isDestroyed()) {
        throw new Error('discord_web_fast_response_owner_denied')
      }
      const view = this.ensureView()
      const bounds = discordWebFastResponseContentBounds(window.getContentBounds(), request)
      this.clearCompactReturnMode()
      this.disableVoiceSelection(view)
      this.compactIntentAvailability.disable(view)
      await this.clearCompactAdapter(view)
      view.setVisible(false)
      this.detach()
      window.contentView.addChildView(view)
      view.setBounds(bounds)
      const closed = () => this.handleOwnerDestroyed(window)
      window.once('closed', closed)
      this.owner = {
        identity: discordWebFastResponseOwnerIdentity(request),
        request: discordWebFastResponseVisibilityIdentity(request),
        sender,
        senderId: sender.id,
        window,
        closed
      }
      if (this.loaded && this.contentMode === 'ready') {
        await this.installCompactAdapter(view, this.revision)
      }
      this.visible = true
      view.setVisible(true)
      this.refreshVoiceSelectionAvailability()
      this.compactIntentAvailability.refresh(view, this.isCompactIntentAvailable())
      this.publishCompactMode()
      this.publish(this.crashed ? 'crashed' : this.loaded ? this.contentMode : 'loading')
      if (!this.loaded) {
        this.scheduleReadyDocument(view, this.revision)
      }
      return this.snapshot()
    })
  }

  update(
    sender: WebContents,
    request: DiscordWebFastResponseAttach
  ): DiscordWebFastResponseSnapshot {
    this.assertOwner(sender, request)
    const window = BrowserWindow.fromWebContents(sender)
    if (!window || window.isDestroyed()) {
      throw new Error('discord_web_fast_response_owner_denied')
    }
    this.view?.setBounds(discordWebFastResponseContentBounds(window.getContentBounds(), request))
    return this.snapshot()
  }

  show(
    sender: WebContents,
    request: DiscordWebFastResponseVisibility
  ): Promise<DiscordWebFastResponseSnapshot> {
    this.assertOwner(sender, request)
    return this.enqueue(async () => {
      this.assertOwner(sender, request)
      const view = this.view
      if (view && this.loaded && this.contentMode === 'ready') {
        await this.installCompactAdapter(view, this.revision)
      }
      this.visible = true
      view?.setVisible(true)
      this.refreshVoiceSelectionAvailability()
      if (view) {
        this.compactIntentAvailability.refresh(view, this.isCompactIntentAvailable())
      }
      return this.snapshot()
    })
  }

  hide(
    sender: WebContents,
    request: DiscordWebFastResponseVisibility
  ): Promise<DiscordWebFastResponseSnapshot> {
    this.assertOwner(sender, request)
    if (this.view) {
      this.adapterHydration.cancel(this.view)
    }
    return this.enqueue(async () => {
      this.assertOwner(sender, request)
      const view = this.view
      if (view) {
        this.disableVoiceSelection(view)
        this.compactIntentAvailability.disable(view)
        await this.clearCompactAdapter(view)
      }
      this.visible = false
      view?.setVisible(false)
      return this.snapshot()
    })
  }

  release(sender: WebContents, request: DiscordWebFastResponseVisibility): void {
    if (!this.isOwner(sender, request)) {
      return
    }
    if (this.view) {
      this.adapterHydration.cancel(this.view)
    }
    this.enqueue(async () => {
      if (!this.isOwner(sender, request)) {
        return
      }
      const view = this.view
      if (view) {
        this.disableVoiceSelection(view)
        this.compactIntentAvailability.disable(view)
        await this.clearCompactAdapter(view)
      }
      this.visible = false
      this.clearCompactReturnMode()
      view?.setVisible(false)
      this.detach()
    })
  }

  shutdown(): void {
    this.shutdownLifecycle()
  }

  getCompactMode(): CompactDiscordMode {
    return this.compactMode
  }

  setCompactMode(mode: CompactDiscordMode): Promise<CompactDiscordModeState> {
    return this.enqueue(async () => {
      return this.applyCompactMode(mode)
    })
  }

  toggleCompactHub(): Promise<CompactDiscordModeState> {
    return this.enqueue(async () => {
      if (this.compactMode.kind === 'manager') {
        const spaReturn = this.startCompactSpaReturn()
        if (spaReturn) {
          return spaReturn
        }
        const returnMode = this.compactReturnMode
        if (!returnMode) {
          return this.adapterState
        }
        this.clearCompactReturnMode()
        return this.applyCompactMode(returnMode)
      }
      this.compactReturnMode = this.compactMode
      return this.applyCompactMode({ kind: 'manager', tab: managerTabForMode(this.compactMode) })
    })
  }

  canCloseCompactHub(): boolean {
    return this.compactHubCanClose()
  }

  handleCompactIntent(
    sender: WebContents,
    request: DiscordWebCompactIntent
  ): Promise<CompactDiscordModeState> {
    if (
      this.view?.webContents !== sender ||
      !this.compactIntentAvailability.admits(request.revision)
    ) {
      return Promise.reject(new Error('discord_web_compact_intent_denied'))
    }
    return this.enqueue(async () => {
      if (
        this.view?.webContents !== sender ||
        !this.compactIntentAvailability.admits(request.revision)
      ) {
        throw new Error('discord_web_compact_intent_denied')
      }
      return handleDiscordCompactIntent(request.intent, {
        currentMode: () => this.compactMode,
        selectMessagesManager: () => this.selectMessagesManager(),
        applyMode: (mode) => this.applyCompactMode(mode),
        openDirectMessage: (href, name) => this.openDirectMessageAfterConfirmation(href, name)
      })
    })
  }

  async selectVoiceChannel(
    sender: WebContents,
    selection: DiscordWebVoiceSelection
  ): Promise<void> {
    if (this.view?.webContents !== sender) {
      throw new Error('discord_web_voice_selection_denied')
    }
    if (selection.revision !== this.voiceRevision || !this.isVoiceSelectionAvailable()) {
      recordDiscordVoiceSelectionFailure(selection.channelId)
      throw new Error('discord_web_voice_selection_stale')
    }
    await selectDiscordVoiceChannel(selection.channelId)
  }

  snapshot(): DiscordWebFastResponseSnapshot {
    return {
      attached: this.owner !== null,
      contentMode: this.contentMode,
      crashed: this.crashed,
      loaded: this.loaded,
      visible: this.visible
    }
  }

  private isOwner(
    sender: Pick<WebContents, 'id'>,
    request: DiscordWebFastResponseVisibility
  ): boolean {
    return (
      this.owner?.senderId === sender.id &&
      this.owner.identity === discordWebFastResponseOwnerIdentity(request)
    )
  }

  private assertOwner(
    sender: Pick<WebContents, 'id'>,
    request: DiscordWebFastResponseVisibility
  ): void {
    if (!this.isOwner(sender, request)) {
      throw new Error('discord_web_fast_response_stale')
    }
  }

  protected async applyCompactMode(mode: CompactDiscordMode): Promise<CompactDiscordModeState> {
    this.compactMode = mode
    this.publishCompactMode()
    const view = this.view
    if (!view || !this.loaded || this.contentMode !== 'ready') {
      return this.adapterState
    }
    this.disableVoiceSelection(view)
    this.compactIntentAvailability.disable(view)
    const state =
      this.adapterState === 'installed'
        ? await this.projectCompactMode(view, this.revision)
        : await this.installCompactAdapter(view, this.revision)
    if (state === 'cancelled') {
      return this.adapterState
    }
    if (state !== 'installed' && this.view === view) {
      this.contentMode = 'unsupported'
      this.publish('unsupported')
    }
    this.refreshVoiceSelectionAvailability()
    this.compactIntentAvailability.refresh(view, this.isCompactIntentAvailable())
    return state
  }
}
