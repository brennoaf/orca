import type { WebContentsView } from 'electron'
import type {
  CompactDiscordAdapterState,
  CompactDiscordMode,
  CompactDiscordModeState
} from './compact-dom-mode'
import { DiscordWebFastResponseRuntimeLifecycle } from './compact-host-runtime-lifecycle'

const DISCORD_ORIGIN = 'https://discord.com'
const SERVER_ROUTE_PATTERN = /^\/channels\/\d{17,20}(?:\/\d{17,20})?$/
const DIRECT_MESSAGE_ROUTE_PATTERN = /^\/channels\/@me\/(\d{17,20})$/

type DiscordCompactNavigationOwner = {
  originalUrl: string
  ownerIdentity: string
  revision: number
  returnMode: CompactDiscordMode | null
}

type DiscordCompactSpaNavigation =
  | { phase: 'idle' }
  | (DiscordCompactNavigationOwner & { phase: 'entering-home' })
  | (DiscordCompactNavigationOwner & {
      phase: 'home'
      pendingDirectMessage: { href: string; name: string } | null
    })
  | (DiscordCompactNavigationOwner & { phase: 'returning'; returnMode: CompactDiscordMode })

type DiscordCompactNavigationCommand =
  | { kind: 'open-home' }
  | { kind: 'open-direct-message'; href: string }

export abstract class DiscordWebFastResponseSpaNavigation extends DiscordWebFastResponseRuntimeLifecycle {
  private compactSpaNavigation: DiscordCompactSpaNavigation = { phase: 'idle' }

  protected abstract applyCompactMode(mode: CompactDiscordMode): Promise<CompactDiscordModeState>
  protected abstract projectCompactMode(
    view: WebContentsView,
    expectedRevision: number
  ): Promise<CompactDiscordAdapterState>
  protected abstract reinstallCompactAdapter(view: WebContentsView, url: string): Promise<void>

  protected async selectMessagesManager(): Promise<CompactDiscordModeState> {
    const view = this.view
    const owner = this.owner
    if (!view || !owner || !this.isCompactIntentAvailable()) {
      return 'unsupported'
    }
    const navigation = this.compactSpaNavigation
    if (navigation.phase === 'entering-home' || navigation.phase === 'returning') {
      return 'navigating'
    }
    const route = sanitizedDiscordRoute(view.webContents.getURL())
    if (!route) {
      this.clearCompactReturnMode()
      return 'unsupported'
    }
    if (route.pathname === '/channels/@me' || DIRECT_MESSAGE_ROUTE_PATTERN.test(route.pathname)) {
      return this.applyCompactMode({ kind: 'manager', tab: 'messages' })
    }
    if (navigation.phase === 'home') {
      return this.applyCompactMode({ kind: 'manager', tab: 'messages' })
    }
    if (route.pathname !== '/app' && !SERVER_ROUTE_PATTERN.test(route.pathname)) {
      this.clearCompactReturnMode()
      return 'unsupported'
    }
    const entering: DiscordCompactSpaNavigation = {
      phase: 'entering-home',
      originalUrl: route.url,
      ownerIdentity: owner.identity,
      revision: this.revision,
      returnMode: this.compactReturnMode
    }
    this.compactSpaNavigation = entering
    const projected = await this.applyCompactMode({ kind: 'manager', tab: 'messages' })
    if (!this.isCurrentCompactNavigation(entering) || projected !== 'installed') {
      this.compactSpaNavigation = { phase: 'idle' }
      return projected
    }
    this.compactIntentAvailability.disable(view)
    const result = await this.runCompactNavigation(view, { kind: 'open-home' })
    if (!this.isCurrentCompactNavigation(entering)) {
      return 'unsupported'
    }
    if (result === 'clicked') {
      return 'navigating'
    }
    this.compactSpaNavigation = { phase: 'idle' }
    this.compactIntentAvailability.refresh(view, this.isCompactIntentAvailable())
    return 'unsupported'
  }

  protected async openDirectMessageAfterConfirmation(
    href: string,
    name: string
  ): Promise<CompactDiscordModeState> {
    const view = this.view
    const navigation = this.compactSpaNavigation
    const route = view ? sanitizedDiscordRoute(view.webContents.getURL()) : null
    if (
      !view ||
      navigation.phase !== 'home' ||
      navigation.pendingDirectMessage ||
      route?.pathname !== '/channels/@me' ||
      this.compactMode.kind !== 'manager' ||
      this.compactMode.tab !== 'messages' ||
      !this.isCurrentCompactNavigation(navigation)
    ) {
      return 'unsupported'
    }
    const pending: DiscordCompactSpaNavigation = {
      ...navigation,
      pendingDirectMessage: { href, name }
    }
    this.compactSpaNavigation = pending
    this.compactIntentAvailability.disable(view)
    const result = await this.runCompactNavigation(view, { kind: 'open-direct-message', href })
    if (!this.isCurrentCompactNavigation(pending)) {
      return 'unsupported'
    }
    if (result === 'clicked') {
      return 'navigating'
    }
    this.compactSpaNavigation = { ...navigation, pendingDirectMessage: null }
    await this.projectCompactMode(view, this.revision)
    this.compactIntentAvailability.refresh(view, this.isCompactIntentAvailable())
    return 'unsupported'
  }

  protected startCompactSpaReturn(): CompactDiscordModeState | null {
    const navigation = this.compactSpaNavigation
    if (navigation.phase === 'entering-home' || navigation.phase === 'returning') {
      return 'navigating'
    }
    if (navigation.phase !== 'home') {
      return null
    }
    const view = this.view
    const returnMode = this.compactReturnMode
    const route = view ? sanitizedDiscordRoute(view.webContents.getURL()) : null
    if (
      !view ||
      !returnMode ||
      route?.pathname !== '/channels/@me' ||
      !this.isCurrentCompactNavigation(navigation) ||
      !view.webContents.canGoBack()
    ) {
      this.clearCompactReturnMode()
      this.publishCompactMode()
      return 'unsupported'
    }
    this.compactSpaNavigation = { ...navigation, phase: 'returning', returnMode }
    this.compactIntentAvailability.disable(view)
    try {
      view.webContents.goBack()
      return 'navigating'
    } catch {
      this.clearCompactReturnMode()
      this.publishCompactMode()
      this.compactIntentAvailability.refresh(view, this.isCompactIntentAvailable())
      return 'unsupported'
    }
  }

  protected compactHubCanClose(): boolean {
    return Boolean(
      this.compactMode.kind === 'manager' &&
      this.compactReturnMode &&
      this.compactSpaNavigation.phase !== 'entering-home' &&
      this.compactSpaNavigation.phase !== 'returning' &&
      (this.compactSpaNavigation.phase !== 'home' ||
        this.compactSpaNavigation.pendingDirectMessage === null)
    )
  }

  protected scheduleInPageNavigation(view: WebContentsView, url: string): void {
    this.enqueue(async () => this.handleInPageNavigation(view, url))
  }

  protected clearCompactReturnMode(): void {
    this.compactReturnMode = null
    this.compactSpaNavigation = { phase: 'idle' }
  }

  private async handleInPageNavigation(view: WebContentsView, url: string): Promise<void> {
    const navigation = this.compactSpaNavigation
    if (navigation.phase === 'idle') {
      return
    }
    const route = sanitizedDiscordRoute(url)
    if (!route || !this.isCurrentCompactNavigation(navigation)) {
      this.clearCompactReturnMode()
      return
    }
    if (navigation.phase === 'entering-home' && route.pathname === '/channels/@me') {
      this.compactSpaNavigation = { ...navigation, phase: 'home', pendingDirectMessage: null }
      await this.reinstallCompactAdapter(view, url)
      return
    }
    if (navigation.phase === 'home') {
      const pending = navigation.pendingDirectMessage
      if (pending && route.pathname === pending.href) {
        this.compactSpaNavigation = { phase: 'idle' }
        this.compactReturnMode = null
        this.compactMode = {
          kind: 'dedicated',
          source: { kind: 'direct-message', href: pending.href, name: pending.name }
        }
        this.publishCompactMode()
        await this.reinstallCompactAdapter(view, url)
        return
      }
      if (!pending && route.pathname === '/channels/@me') {
        await this.reinstallCompactAdapter(view, url)
        return
      }
    }
    if (navigation.phase === 'returning' && route.url === navigation.originalUrl) {
      this.compactSpaNavigation = { phase: 'idle' }
      this.compactReturnMode = null
      this.compactMode = navigation.returnMode
      this.publishCompactMode()
      await this.reinstallCompactAdapter(view, url)
      return
    }
    this.clearCompactReturnMode()
    this.publishCompactMode()
    await this.reinstallCompactAdapter(view, url)
  }

  private async runCompactNavigation(
    view: WebContentsView,
    command: DiscordCompactNavigationCommand
  ): Promise<'clicked' | 'missing' | 'denied'> {
    try {
      const value: unknown = await view.webContents.executeJavaScriptInIsolatedWorld(
        999,
        [{ code: `window.__orcaDiscordFastResponse.navigate(${JSON.stringify(command)})` }],
        false
      )
      return value === 'clicked' || value === 'missing' ? value : 'denied'
    } catch {
      return 'denied'
    }
  }

  private isCurrentCompactNavigation(
    navigation: Exclude<DiscordCompactSpaNavigation, { phase: 'idle' }>
  ): boolean {
    return (
      this.compactSpaNavigation === navigation &&
      this.owner?.identity === navigation.ownerIdentity &&
      this.revision === navigation.revision
    )
  }
}

function sanitizedDiscordRoute(value: string): { pathname: string; url: string } | null {
  try {
    const url = new URL(value)
    if (url.origin !== DISCORD_ORIGIN) {
      return null
    }
    return { pathname: url.pathname, url: `${DISCORD_ORIGIN}${url.pathname}` }
  } catch {
    return null
  }
}
