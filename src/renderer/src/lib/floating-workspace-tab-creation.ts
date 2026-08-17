import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import type {
  FloatingWorkspaceApp,
  FloatingWorkspaceAppId
} from '../../../shared/floating-workspace-apps'
import type { BrowserTab } from '../../../shared/browser-workspace-types'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import { createUntitledMarkdownFileWithTemplateSelection } from './create-untitled-markdown'
import {
  resolveFloatingWorkspaceAppSessionProfile,
  type FloatingWorkspaceAppSessionStore
} from './floating-workspace-app-session-profile'
import { getConnectionId } from './connection-context'
import { detectLanguage } from './language-detect'
import type { AppState } from '@/store/types'
import { focusTerminalTabSurface } from './focus-terminal-tab-surface'
import { translate } from '@/i18n/i18n'
import { assertClientCreationActionAvailable } from './client-creation-action-policy'

type FloatingWorkspaceTerminalStore = Pick<
  AppState,
  'activeGroupIdByWorktree' | 'createTab' | 'activateTab'
>

type FloatingWorkspaceBrowserStore = Pick<
  AppState,
  'activeGroupIdByWorktree' | 'browserDefaultUrl' | 'createBrowserTab'
>

type FloatingWorkspaceAppStore = Pick<AppState, 'activeGroupIdByWorktree' | 'createBrowserTab'> &
  Pick<AppState, 'browserTabsByWorktree' | 'setActiveBrowserTab'> &
  FloatingWorkspaceAppSessionStore

type FloatingWorkspaceMarkdownStore = Pick<AppState, 'activeGroupIdByWorktree' | 'openFile'>

const floatingWorkspaceAppOpenRequests = new Map<
  FloatingWorkspaceAppId,
  Promise<BrowserTab | null>
>()

export async function createFloatingWorkspaceTerminalTab(
  store: FloatingWorkspaceTerminalStore,
  shellOverride?: string
): Promise<TerminalTab | null> {
  const targetGroupId = store.activeGroupIdByWorktree[FLOATING_TERMINAL_WORKTREE_ID]

  // Why: the floating workspace is a local scratchpad; a focused remote runtime
  // must not own its SSH/tmux terminals or prune them via session snapshots.
  const tab = store.createTab(FLOATING_TERMINAL_WORKTREE_ID, targetGroupId, shellOverride, {
    activate: false
  })
  store.activateTab(tab.id)
  focusTerminalTabSurface(tab.id)
  return tab
}

export async function createFloatingWorkspaceBrowserTab(
  store: FloatingWorkspaceBrowserStore
): Promise<BrowserTab | null> {
  assertClientCreationActionAvailable(
    store as AppState,
    FLOATING_TERMINAL_WORKTREE_ID,
    'managed-browser'
  )
  const targetGroupId = store.activeGroupIdByWorktree[FLOATING_TERMINAL_WORKTREE_ID]
  const url = store.browserDefaultUrl ?? 'about:blank'

  // Why: browser tabs in the floating workspace share the same local-only
  // ownership rule as floating terminals.
  return store.createBrowserTab(FLOATING_TERMINAL_WORKTREE_ID, url, {
    title: translate('auto.lib.floating.workspace.tab.creation.f3785eddc2', 'New Browser Tab'),
    focusAddressBar: true,
    targetGroupId,
    browserRuntimeEnvironmentId: null
  })
}

async function openOrFocusFloatingWorkspaceAppTabOnce(
  store: FloatingWorkspaceAppStore,
  app: FloatingWorkspaceApp
): Promise<BrowserTab | null> {
  const existing = (store.browserTabsByWorktree[FLOATING_TERMINAL_WORKTREE_ID] ?? []).find(
    (tab) => tab.floatingWorkspaceAppId === app.id
  )
  if (existing) {
    store.setActiveBrowserTab(existing.id)
    return existing
  }

  const targetGroupId = store.activeGroupIdByWorktree[FLOATING_TERMINAL_WORKTREE_ID]
  const profile = await resolveFloatingWorkspaceAppSessionProfile(store, app)
  if (!profile) {
    return null
  }

  return store.createBrowserTab(FLOATING_TERMINAL_WORKTREE_ID, app.url, {
    title: app.label,
    floatingWorkspaceAppId: app.id,
    targetGroupId,
    sessionProfileId: profile.id,
    sessionPartition: profile.partition,
    browserRuntimeEnvironmentId: null
  })
}

export function openOrFocusFloatingWorkspaceAppTab(
  store: FloatingWorkspaceAppStore,
  app: FloatingWorkspaceApp
): Promise<BrowserTab | null> {
  const pending = floatingWorkspaceAppOpenRequests.get(app.id)
  if (pending) {
    return pending
  }

  const request = openOrFocusFloatingWorkspaceAppTabOnce(store, app)
  floatingWorkspaceAppOpenRequests.set(app.id, request)
  const release = (): void => {
    if (floatingWorkspaceAppOpenRequests.get(app.id) === request) {
      floatingWorkspaceAppOpenRequests.delete(app.id)
    }
  }
  void request.then(release, release)
  return request
}

export async function createFloatingWorkspaceMarkdownTab(
  store: FloatingWorkspaceMarkdownStore,
  markdownDirectory?: string | null
): Promise<void> {
  const targetGroupId = store.activeGroupIdByWorktree[FLOATING_TERMINAL_WORKTREE_ID]
  const floatingMarkdownDirectory =
    markdownDirectory ?? (await window.api.app.getFloatingMarkdownDirectory())
  if (!floatingMarkdownDirectory) {
    return
  }
  const fileInfo = await createUntitledMarkdownFileWithTemplateSelection(
    floatingMarkdownDirectory,
    FLOATING_TERMINAL_WORKTREE_ID,
    getConnectionId(FLOATING_TERMINAL_WORKTREE_ID) ?? undefined,
    { activeRuntimeEnvironmentId: null }
  )
  if (!fileInfo) {
    return
  }
  store.openFile(
    {
      ...fileInfo,
      language: detectLanguage(fileInfo.relativePath)
    },
    {
      preview: false,
      targetGroupId,
      suppressActiveRuntimeFallback: true
    }
  )
}
