import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import type { WebContents } from 'electron'
import type {
  CommunicationsDockAckRequest,
  CommunicationsDockAction,
  CommunicationsDockIdentity,
  CommunicationsDockNavbarHeightRequest,
  CommunicationsDockSetCollapsedRequest,
  CommunicationsDockSnapshot,
  CommunicationsDockUpdateSessionRequest
} from '../../shared/communications-dock'
import type { FloatingCommsSessionState } from '../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../shared/floating-workspace-apps'
import { CommunicationsDockLayoutStore } from './communications-dock-layout'
import { focusCommunicationsDockApp } from './communications-dock-state'
import { createCommunicationsDockWindow } from './communications-dock-window'
import { CommunicationsDockCollapseController } from './communications-dock-collapse'
import { communicationsDockPresence } from './communications-dock-presence'
import { communicationsDockSnapshot } from './communications-dock-snapshot'
import { applyCommunicationsDockLayoutOperation } from './communications-dock-layout-operation'
import {
  isCommunicationsDockSender,
  requireCommunicationsDockSender
} from './communications-dock-sender'
import { isCommunicationsDockAppFocusedVisible } from './communications-dock-focus'
import {
  requireCommunicationsDockWindow,
  showCommunicationsDockWindow
} from './communications-dock-visibility'
import {
  notifyCommunicationsDockPresence,
  sendCommunicationsDockSnapshot
} from './communications-dock-publication'
import { destroyCommunicationsDockWindow } from './communications-dock-shutdown'
import { recoverCommunicationsDockAfterCrash } from './communications-dock-crash'
import { CommunicationsDockWindowState } from './communications-dock-window-state'
import {
  createCommunicationsDockLayoutCommands,
  type CommunicationsDockLayoutCommand
} from './communications-dock-layout-commands'
import {
  defaultCommunicationsDockHost,
  defaultCommunicationsDockSession,
  type CommunicationsDockHost
} from './communications-dock-host'
import { FloatingCommsSessionRegistry } from './floating-comms-session-registry'
import { returnCommunicationsDockSessions } from './communications-dock-return'

export class CommunicationsDockController extends CommunicationsDockWindowState {
  private store: CommunicationsDockLayoutStore | null = null
  private readonly sessions = new FloatingCommsSessionRegistry()
  private collapse: CommunicationsDockCollapseController | null = null
  readonly layoutCommands = createCommunicationsDockLayoutCommands({
    run: (sender, request) => this.runLayoutCommand(sender, request),
    createTabId: () => `communications-${randomUUID()}`
  })
  constructor(private readonly host: CommunicationsDockHost) {
    super()
  }
  openOrFocus(
    appId: FloatingWorkspaceAppId,
    sessionState?: FloatingCommsSessionState,
    sessionStates?: Partial<Record<FloatingWorkspaceAppId, FloatingCommsSessionState>>
  ): CommunicationsDockSnapshot {
    const nextSessions = { ...this.sessions.getSessions(), ...sessionStates }
    nextSessions[appId] =
      sessionState ?? nextSessions[appId] ?? defaultCommunicationsDockSession(appId)
    this.sessions.enterDock(appId, nextSessions)
    this.setLayout(focusCommunicationsDockApp(this.layout().get(), appId))
    this.desiredVisible = true
    this.ensureWindow()
    if (this.ready && this.window && !this.window.isDestroyed()) {
      this.sendSnapshot()
      showCommunicationsDockWindow(this.window)
      this.emitSnapshot()
    }
    return this.snapshot()
  }
  readyForSender(sender: WebContents, generation: number): CommunicationsDockSnapshot {
    this.requireWindowSender(sender)
    if (generation !== this.generation || !this.loaded) {
      throw new Error('communications_dock_ready_stale')
    }
    this.ready = true
    const snapshot = this.snapshot()
    sender.send('floatingCommsDock:snapshotChanged', snapshot)
    return snapshot
  }
  acknowledge(sender: WebContents, request: CommunicationsDockAckRequest): void {
    this.requireCurrentSender(sender, request)
    if (!this.desiredVisible || !this.window || this.window.isDestroyed()) {
      return
    }
    showCommunicationsDockWindow(this.window)
    this.emitSnapshot()
  }
  getSnapshotForSender(sender: WebContents): CommunicationsDockSnapshot {
    this.requireWindowSender(sender)
    return this.snapshot()
  }
  getPresence() {
    return communicationsDockPresence(
      this.window,
      this.store?.get() ?? null,
      this.sessions.getLocation()
    )
  }
  isAppFocusedVisible(sender: WebContents | null, appId: FloatingWorkspaceAppId): boolean {
    return isCommunicationsDockAppFocusedVisible({
      window: this.window,
      sender,
      appId,
      layout: this.layout().get()
    })
  }
  setCollapsed(
    sender: WebContents,
    request: CommunicationsDockSetCollapsedRequest
  ): CommunicationsDockSnapshot {
    this.requireCurrentSender(sender, request)
    const window = requireCommunicationsDockWindow(this.window)
    this.setLayout(
      this.collapseController().setCollapsed(window, this.layout().get(), request.collapsed)
    )
    return this.publish()
  }
  setNavbarHeight(
    sender: WebContents,
    request: CommunicationsDockNavbarHeightRequest
  ): CommunicationsDockSnapshot {
    this.requireCurrentSender(sender, request)
    this.collapseController().setNavbarHeight(
      requireCommunicationsDockWindow(this.window),
      this.layout().get(),
      request.height
    )
    return this.publish()
  }
  updateSession(
    sender: WebContents,
    request: CommunicationsDockUpdateSessionRequest
  ): CommunicationsDockSnapshot {
    this.requireCurrentSender(sender, request)
    this.sessions.update(request.sessionState)
    return this.publish()
  }
  reattach(sender: WebContents, identity: CommunicationsDockIdentity): void {
    this.requireCurrentSender(sender, identity)
    this.returnToPanel()
  }
  isSender(sender: WebContents, identity?: CommunicationsDockIdentity): boolean {
    return isCommunicationsDockSender({
      window: this.window,
      sender,
      generation: this.generation,
      revision: this.revision,
      identity
    })
  }
  handleAction(sender: WebContents, action: CommunicationsDockAction): void {
    this.requireCurrentSender(sender, action)
    this.host.action(action)
  }
  async shutdown(): Promise<void> {
    this.desiredVisible = false
    const window = this.window
    this.window = null
    destroyCommunicationsDockWindow(window)
    await this.layout().flush()
  }
  private ensureWindow(): void {
    if (this.window && !this.window.isDestroyed()) {
      return
    }
    this.generation += 1
    this.revision = 1
    this.loaded = false
    this.ready = false
    const generation = this.generation
    this.window = createCommunicationsDockWindow(this.layout().get().bounds, {
      boundsChanged: (bounds) => {
        if (generation !== this.generation) {
          return
        }
        this.collapseController().boundsChanged(bounds, this.layout().get().collapsed)
        this.setLayout({ ...this.layout().get(), bounds: this.collapseController().getBounds() })
        this.publish()
      },
      closed: () => {
        if (generation === this.generation) {
          this.window = null
        }
      },
      crashed: () => this.handleCrash(generation),
      hideRequested: () => this.returnToPanel(),
      loaded: () => {
        if (generation === this.generation) {
          this.loaded = true
        }
      }
    })
    this.collapse = new CommunicationsDockCollapseController(this.layout().get().bounds)
    this.collapse.applyInitialState(this.window, this.layout().get())
  }
  private handleCrash(generation: number): void {
    recoverCommunicationsDockAfterCrash({
      generation,
      currentGeneration: this.generation,
      window: this.window,
      desiredVisible: this.desiredVisible,
      clearWindow: () => {
        this.window = null
        this.loaded = false
        this.ready = false
      },
      recreate: () => this.ensureWindow()
    })
  }
  private setLayout(layout: ReturnType<CommunicationsDockLayoutStore['get']>): void {
    this.layout().set(layout)
    this.bumpRevision()
  }
  private bumpRevision(): void {
    if (this.revision >= Number.MAX_SAFE_INTEGER) {
      throw new Error('communications_dock_revision_exhausted')
    }
    this.revision += 1
  }
  private publish(): CommunicationsDockSnapshot {
    const snapshot = this.snapshot()
    this.sendSnapshot()
    this.emitSnapshot()
    return snapshot
  }
  private runLayoutCommand(
    sender: WebContents,
    request: CommunicationsDockLayoutCommand
  ): CommunicationsDockSnapshot {
    this.requireCurrentSender(sender, 'operation' in request ? request.request : request)
    this.setLayout(applyCommunicationsDockLayoutOperation(this.layout().get(), request))
    return this.publish()
  }
  private sendSnapshot(): void {
    sendCommunicationsDockSnapshot(this.ready, this.window, this.snapshot())
  }
  private emitSnapshot(): void {
    notifyCommunicationsDockPresence(this.getPresence())
  }
  private snapshot(): CommunicationsDockSnapshot {
    return communicationsDockSnapshot({
      generation: this.generation,
      revision: this.revision,
      layout: this.layout().get(),
      sessions: this.sessions.getSessions(),
      visible: Boolean(this.window && !this.window.isDestroyed() && this.window.isVisible())
    })
  }
  private returnToPanel(): void {
    if (!returnCommunicationsDockSessions(this.sessions, this.host)) {
      return
    }
    this.desiredVisible = false
    this.window?.hide()
    this.bumpRevision()
    this.emitSnapshot()
  }
  private requireWindowSender(sender: WebContents): void {
    this.requireSender(sender, undefined, 'communications_dock_sender_denied')
  }
  private requireCurrentSender(sender: WebContents, identity: CommunicationsDockIdentity): void {
    this.requireSender(sender, identity, 'communications_dock_stale')
  }
  private requireSender(
    sender: WebContents,
    identity: CommunicationsDockIdentity | undefined,
    error: string
  ): void {
    requireCommunicationsDockSender({
      window: this.window,
      sender,
      generation: this.generation,
      revision: this.revision,
      identity,
      error
    })
  }
  private layout(): CommunicationsDockLayoutStore {
    this.store ??= new CommunicationsDockLayoutStore(app.getPath('userData'))
    return this.store
  }
  private collapseController(): CommunicationsDockCollapseController {
    if (!this.collapse) {
      throw new Error('communications_dock_collapse_unavailable')
    }
    return this.collapse
  }
}

export const communicationsDockController = new CommunicationsDockController(
  defaultCommunicationsDockHost
)
