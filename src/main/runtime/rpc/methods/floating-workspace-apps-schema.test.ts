import { describe, expect, it } from 'vitest'
import { FloatingWorkspaceApps } from './floating-workspace-apps-schema'

describe('FloatingWorkspaceApps', () => {
  it('requires archived chat visibility at the RPC boundary', () => {
    expect(
      FloatingWorkspaceApps.safeParse({
        'whatsapp-web': {
          enabled: true,
          sessionProfileIdOverride: null,
          dedicatedSessionProfileId: null
        }
      }).success
    ).toBe(false)
  })
})
