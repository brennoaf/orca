import type { WebContentsView } from 'electron'
import type {
  WhatsAppFastResponseAttention,
  WhatsAppFastResponseSnapshot,
  WhatsAppFastResponseState
} from '../../shared/whatsapp-fast-response'
import { sendToTrustedUIRenderer } from '../ipc/ui'

type CompactWhatsAppAttentionDependencies = {
  isCurrent: (view: WebContentsView, revision: number) => boolean
  isFocused: () => boolean
  onUnread: () => void
  publish: (state: WhatsAppFastResponseState) => void
}

export class CompactWhatsAppAttentionPolling {
  private timer: ReturnType<typeof setTimeout> | null = null

  schedule({
    view,
    delay,
    isCurrent,
    onAttention
  }: {
    view: WebContentsView
    delay: number
    isCurrent: () => boolean
    onAttention: (hasUnread: boolean) => void
  }): void {
    this.stop()
    if (!isCurrent()) {
      return
    }
    this.timer = setTimeout(() => {
      this.timer = null
      void this.read({ view, delay, isCurrent, onAttention })
    }, delay)
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private async read({
    view,
    delay,
    isCurrent,
    onAttention
  }: {
    view: WebContentsView
    delay: number
    isCurrent: () => boolean
    onAttention: (hasUnread: boolean) => void
  }): Promise<void> {
    if (!isCurrent()) {
      return
    }
    const result = await view.webContents
      .executeJavaScriptInIsolatedWorld(
        999,
        [
          {
            code: "document.documentElement.getAttribute('data-orca-whatsapp-has-unread') === 'true'"
          }
        ],
        false
      )
      .then(
        (value) => ({ ok: true as const, value }),
        () => ({ ok: false as const })
      )
    if (result.ok && isCurrent()) {
      onAttention(result.value === true)
    }
    if (isCurrent()) {
      this.schedule({ view, delay, isCurrent, onAttention })
    }
  }
}

export class CompactWhatsAppAttention {
  private hasUnreadValue = false
  private hasSample = false
  private readonly polling = new CompactWhatsAppAttentionPolling()

  constructor(private readonly dependencies: CompactWhatsAppAttentionDependencies) {}

  get hasUnread(): boolean {
    return this.hasUnreadValue
  }

  snapshot(): WhatsAppFastResponseAttention {
    return { hasUnread: this.hasUnreadValue }
  }

  hostSnapshot([attached, crashed, loaded, visible]: readonly [
    boolean,
    boolean,
    boolean,
    boolean
  ]): WhatsAppFastResponseSnapshot {
    return { attention: this.snapshot(), attached, crashed, loaded, visible }
  }

  schedule(view: WebContentsView, visible: boolean, revision: number): void {
    this.polling.schedule({
      view,
      delay: visible ? 2000 : 7000,
      isCurrent: () => this.dependencies.isCurrent(view, revision),
      onAttention: (hasUnread) => this.set(hasUnread)
    })
  }

  stop(): void {
    this.polling.stop()
  }

  reset(): void {
    const hadUnread = this.hasUnreadValue
    this.hasUnreadValue = false
    this.hasSample = false
    if (!hadUnread) {
      return
    }
    this.publish('loading')
  }

  private set(hasUnread: boolean): void {
    const hadSample = this.hasSample
    this.hasSample = true
    if (hasUnread === this.hasUnreadValue) {
      return
    }
    const becameUnread = hadSample && hasUnread
    this.hasUnreadValue = hasUnread
    this.publish('ready')
    if (becameUnread && !this.dependencies.isFocused()) {
      this.dependencies.onUnread()
    }
  }

  private publish(state: WhatsAppFastResponseState): void {
    this.dependencies.publish(state)
    sendToTrustedUIRenderer('whatsappFastResponse:attentionChanged', this.snapshot())
  }
}

export function createCompactWhatsAppAttentionController(
  dependencies: CompactWhatsAppAttentionDependencies
): CompactWhatsAppAttention {
  return new CompactWhatsAppAttention(dependencies)
}
