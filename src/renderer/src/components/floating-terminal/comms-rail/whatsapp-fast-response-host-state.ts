import type {
  WhatsAppFastResponseAttach,
  WhatsAppFastResponseSnapshot,
  WhatsAppFastResponseVisibility
} from '../../../../../shared/whatsapp-fast-response'

export type WhatsAppFastResponseHostBinding = {
  identity: WhatsAppFastResponseVisibility
  visible: boolean
  collapsed?: boolean
}

export type WhatsAppFastResponseHostState =
  | { kind: 'inactive' }
  | { kind: 'loading'; contentMode: WhatsAppFastResponseSnapshot['contentMode'] }
  | { kind: 'ready'; contentMode: WhatsAppFastResponseSnapshot['contentMode'] }
  | { kind: 'crashed'; recoverable: boolean }
  | { kind: 'error'; recoverable: boolean }

export function whatsappFastResponseIdentityKey(identity: WhatsAppFastResponseVisibility): string {
  return identity.target === 'attached'
    ? `attached:${identity.requestId}:${identity.surfaceId}:${identity.mode}`
    : identity.target === 'dock'
      ? `dock:${identity.generation}:${identity.revision}:${identity.tabId}`
      : `browser:${identity.browserTabId}:${identity.browserPageId}:${identity.workspaceId}:${identity.registrationToken}:${identity.revision}`
}

export function whatsappFastResponseSnapshotState(
  snapshot: WhatsAppFastResponseSnapshot
): WhatsAppFastResponseHostState {
  if (snapshot.crashed) {
    return { kind: 'crashed', recoverable: true }
  }
  return snapshot.loaded
    ? { kind: 'ready', contentMode: snapshot.contentMode }
    : { kind: 'loading', contentMode: snapshot.contentMode }
}

export function whatsappFastResponseGeometryKey(request: WhatsAppFastResponseAttach): string {
  const { x, y, width, height } = request.rectCss
  return `${whatsappFastResponseIdentityKey(request)}:${x}:${y}:${width}:${height}:${request.rendererZoomFactor}`
}
