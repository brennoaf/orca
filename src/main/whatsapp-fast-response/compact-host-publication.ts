import type {
  WhatsAppFastResponseAttention,
  WhatsAppFastResponseState
} from '../../shared/whatsapp-fast-response'
import type { WhatsAppFastResponseOwner } from './compact-host-identities'

export function publishCompactWhatsAppState(
  owner: WhatsAppFastResponseOwner | null,
  attention: WhatsAppFastResponseAttention,
  state: WhatsAppFastResponseState
): void {
  if (!owner || owner.sender.isDestroyed()) {
    return
  }
  owner.sender.send('whatsappFastResponse:stateChanged', {
    attention,
    identity: owner.request,
    state,
    recoverable: state !== 'ready'
  })
}
