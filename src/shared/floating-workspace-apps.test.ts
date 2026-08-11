import { describe, expect, it } from 'vitest'
import {
  getFloatingWorkspaceAppPreference,
  normalizeFloatingWorkspaceAppPreferences
} from './floating-workspace-apps'

describe('floating workspace app preferences', () => {
  it('defaults archived chat visibility to enabled', () => {
    expect(getFloatingWorkspaceAppPreference(undefined, 'whatsapp-web').hideArchivedChats).toBe(
      false
    )
  })

  it('normalizes only an explicit archived chats boolean true', () => {
    expect(
      normalizeFloatingWorkspaceAppPreferences({
        'whatsapp-web': { hideArchivedChats: true },
        slack: { hideArchivedChats: 'true' }
      })
    ).toMatchObject({
      'whatsapp-web': { hideArchivedChats: true },
      slack: { hideArchivedChats: false }
    })
  })
})
