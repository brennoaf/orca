type AttachedIdentity = {
  requestId: number
  surfaceId: number
  mode: 'attached-dom' | 'attached-native'
}

const hiddenAttachedOwners = new Set<string>()

function key(identity: AttachedIdentity): string {
  return `${identity.requestId}:${identity.surfaceId}:${identity.mode}`
}

export function markWhatsAppFastResponseViewportHidden(identity: AttachedIdentity): void {
  hiddenAttachedOwners.add(key(identity))
}

export function clearWhatsAppFastResponseViewportHidden(identity: AttachedIdentity): void {
  hiddenAttachedOwners.delete(key(identity))
}

export function isWhatsAppFastResponseViewportHidden(identity: AttachedIdentity): boolean {
  return hiddenAttachedOwners.has(key(identity))
}
