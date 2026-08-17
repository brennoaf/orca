import { describe, expect, it } from 'vitest'
import type { BrowserTab } from '../../../shared/browser-workspace-types'
import { buildDuplicatedBrowserTabOptions } from './duplicate-browser-tab-options'

describe('buildDuplicatedBrowserTabOptions', () => {
  it('does not copy the canonical floating app identity', () => {
    const source: BrowserTab = {
      id: 'browser-1',
      worktreeId: 'global-floating-terminal',
      floatingWorkspaceAppId: 'discord',
      sessionProfileId: 'profile-1',
      sessionPartition: 'persist:profile-1',
      url: 'https://discord.com/app',
      title: 'Discord',
      loading: false,
      faviconUrl: null,
      canGoBack: false,
      canGoForward: false,
      loadError: null,
      createdAt: 1
    }

    expect(buildDuplicatedBrowserTabOptions(source)).toEqual({
      title: 'Discord',
      sessionProfileId: 'profile-1',
      sessionPartition: 'persist:profile-1'
    })
  })
})
