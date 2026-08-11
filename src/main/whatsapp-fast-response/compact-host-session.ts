import type { Store } from '../persistence'
import type { WebContentsView } from 'electron'
import { browserSessionRegistry } from '../browser/browser-session-registry'
import {
  getFloatingWorkspaceAppPreference,
  type FloatingWorkspaceAppPreferences
} from '../../shared/floating-workspace-apps'

export class WhatsAppFastResponsePreferences {
  private hideArchivedChatsValue: boolean
  private readonly unsubscribeUIChanged: () => void

  constructor(store: Store, onHideArchivedChatsChanged: () => void) {
    this.hideArchivedChatsValue = resolveWhatsAppFastResponseHideArchivedChats(
      store.getUI().floatingWorkspaceApps
    )
    this.unsubscribeUIChanged = store.onUIChanged((ui) => {
      const hideArchivedChats = resolveWhatsAppFastResponseHideArchivedChats(
        ui.floatingWorkspaceApps
      )
      if (hideArchivedChats === this.hideArchivedChatsValue) {
        return
      }
      this.hideArchivedChatsValue = hideArchivedChats
      onHideArchivedChatsChanged()
    })
  }

  get hideArchivedChats(): boolean {
    return this.hideArchivedChatsValue
  }

  dispose(): void {
    this.unsubscribeUIChanged()
  }
}

export function resolveWhatsAppFastResponseHideArchivedChats(value: unknown): boolean {
  const preferences = value as FloatingWorkspaceAppPreferences
  return getFloatingWorkspaceAppPreference(preferences, 'whatsapp-web').hideArchivedChats === true
}

export function resolveWhatsAppFastResponsePartition(store: Store): string {
  const preferences = store.getUI().floatingWorkspaceApps as FloatingWorkspaceAppPreferences
  const preference = getFloatingWorkspaceAppPreference(preferences, 'whatsapp-web')
  const profileId = preference.sessionProfileIdOverride ?? preference.dedicatedSessionProfileId
  if (profileId) {
    const partition = browserSessionRegistry.resolveKnownPartition(profileId)
    if (!partition) {
      throw new Error('whatsapp_fast_response_profile_denied')
    }
    return partition
  }
  const profile = browserSessionRegistry.createProfile('isolated', 'WhatsApp Web', {
    userAgentMode: 'clean'
  })
  if (!profile) {
    throw new Error('whatsapp_fast_response_profile_unavailable')
  }
  store.updateUI({
    floatingWorkspaceApps: {
      ...preferences,
      'whatsapp-web': { ...preference, dedicatedSessionProfileId: profile.id }
    }
  })
  return profile.partition
}

export function reapplyWhatsAppFastResponsePreferences({
  view,
  loaded,
  invalidate,
  finish,
  reconcile
}: {
  view: WebContentsView | null
  loaded: boolean
  invalidate: () => void
  finish: () => void
  reconcile: (view: WebContentsView) => void
}): void {
  if (!view || view.webContents.isDestroyed() || !loaded) {
    return
  }
  invalidate()
  finish()
  reconcile(view)
}
