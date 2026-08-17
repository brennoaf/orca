import type {
  WhatsAppFastResponseAttention,
  WhatsAppFastResponseContentMode,
  WhatsAppFastResponseState
} from '../../shared/whatsapp-fast-response'
import type { WhatsAppFastResponseOwner } from './compact-host-identities'

export function publishCompactWhatsAppState(
  owner: WhatsAppFastResponseOwner | null,
  attention: WhatsAppFastResponseAttention,
  contentMode: WhatsAppFastResponseContentMode,
  state: WhatsAppFastResponseState
): void {
  if (!owner || owner.sender.isDestroyed()) {
    return
  }
  owner.sender.send('whatsappFastResponse:stateChanged', {
    attention,
    contentMode,
    identity: owner.request,
    state,
    recoverable: state !== 'ready'
  })
}
