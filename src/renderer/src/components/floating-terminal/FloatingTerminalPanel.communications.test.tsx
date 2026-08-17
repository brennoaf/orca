import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ReactModule from 'react'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import type { BrowserTab } from '../../../../shared/browser-workspace-types'
import type { Tab } from '../../../../shared/tab-types'
import {
  storeBox,
  type FloatingPanelStoreState
} from './floating-terminal-panel-test-fixtures'
import { setupFloatingTerminalPanelTest } from './floating-terminal-panel-test-harness'
import {
  findByClassName,
  findByTypeName,
  renderPanel,
  runEffects,
  type ReactElementLike
} from './floating-terminal-panel-render-probe'

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof ReactModule>('react')
  const { createReactHookOverrides } = await import('./floating-terminal-panel-test-module-mocks')
  return { ...actual, ...createReactHookOverrides() }
})

vi.mock('@/store', async () => {
  return (await import('./floating-terminal-panel-test-module-mocks')).createAppStoreModule()
})

vi.mock('@/components/tab-bar/TabBar', async () => {
  return (await import('./floating-terminal-panel-component-stubs')).createTabBarModule()
})

vi.mock('@/components/terminal-pane/TerminalPane', async () => {
  return (await import('./floating-terminal-panel-component-stubs')).createTerminalPaneModule()
})

vi.mock('@/components/terminal-pane/use-terminal-tab-cold-parking', async () => {
  return (await import('./floating-terminal-panel-test-module-mocks')).createColdParkingModule()
})

vi.mock('@/components/terminal-pane/terminal-parked-tab-watchers', async () => {
  return (
    await import('./floating-terminal-panel-test-module-mocks')
  ).createParkedTabWatchersModule()
})

vi.mock('@/components/terminal-pane/terminal-ime-input-context-refresh', async () => {
  return (
    await import('./floating-terminal-panel-test-module-mocks')
  ).createImeInputContextRefreshModule()
})

vi.mock('@/components/terminal/terminal-tab-actions', async () => {
  return (
    await import('./floating-terminal-panel-test-module-mocks')
  ).createTerminalTabActionsModule()
})

vi.mock('@/store/pinned-tab-close-guard', async () => {
  return (
    await import('./floating-terminal-panel-test-module-mocks')
  ).createPinnedTabCloseGuardModule()
})

vi.mock('@/components/browser-pane/BrowserPane', async () => {
  return (await import('./floating-terminal-panel-component-stubs')).createBrowserPaneModule()
})

vi.mock('@/components/emulator-pane/EmulatorPane', async () => {
  return (await import('./floating-terminal-panel-component-stubs')).createEmulatorPaneModule()
})

vi.mock('@/components/editor/EditorPanel', async () => {
  return (await import('./floating-terminal-panel-component-stubs')).createEditorPanelModule()
})

vi.mock('@/components/ui/button', async () => {
  return (await import('./floating-terminal-panel-component-stubs')).createButtonModule()
})

vi.mock('@/components/contextual-tours/use-contextual-tour', async () => {
  return (await import('./floating-terminal-panel-test-module-mocks')).createContextualTourModule()
})

vi.mock('@/components/ui/dialog', async () => {
  return (await import('./floating-terminal-panel-component-stubs')).createDialogModule()
})

vi.mock('@/components/terminal/useTerminalSaveDialog', async () => {
  return (
    await import('./floating-terminal-panel-test-module-mocks')
  ).createTerminalSaveDialogModule()
})

vi.mock('@/runtime/web-runtime-session', async () => {
  return (
    await import('./floating-terminal-panel-test-module-mocks')
  ).createWebRuntimeSessionModule()
})

vi.mock('@/lib/connection-context', async () => {
  return (
    await import('./floating-terminal-panel-test-module-mocks')
  ).createConnectionContextModule()
})

vi.mock('@/lib/create-untitled-markdown', () => ({
  createUntitledMarkdownFileWithTemplateSelection: vi.fn()
}))

vi.mock('@/lib/ipc-error', async () => {
  return (await import('./floating-terminal-panel-test-module-mocks')).createIpcErrorModule()
})

vi.mock('sonner', async () => {
  return (await import('./floating-terminal-panel-test-module-mocks')).createSonnerModule()
})

vi.mock('@/lib/focus-terminal-tab-surface', async () => {
  return (
    await import('./floating-terminal-panel-test-module-mocks')
  ).createFocusTerminalTabSurfaceModule()
})

vi.mock('@/lib/orchestration-setup-state', async () => {
  return (
    await import('./floating-terminal-panel-test-module-mocks')
  ).createOrchestrationSetupStateModule()
})

vi.mock('./FloatingTerminalOrchestrationDialog', async () => {
  return (
    await import('./floating-terminal-panel-component-stubs')
  ).createOrchestrationDialogModule()
})

vi.mock('./FloatingTerminalResizeHandles', async () => {
  return (await import('./floating-terminal-panel-component-stubs')).createResizeHandlesModule()
})

vi.mock('./FloatingTerminalToggleButton', async () => {
  return (await import('./floating-terminal-panel-component-stubs')).createToggleButtonModule()
})

vi.mock('./FloatingTerminalWindowControls', async () => {
  return (await import('./floating-terminal-panel-component-stubs')).createWindowControlsModule()
})

vi.mock('@/components/ShortcutKeyCombo', async () => {
  return (await import('./floating-terminal-panel-component-stubs')).createShortcutKeyComboModule()
})

function setFloatingBrowserTab(): void {
  const state = storeBox.state as FloatingPanelStoreState
  const groupId = 'floating-group'
  const browserTab: BrowserTab = {
    id: 'browser-1',
    worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
    activePageId: 'page-1',
    pageIds: ['page-1'],
    url: 'https://discord.com/app',
    title: 'Discord',
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 1
  }
  const unifiedTab: Tab = {
    id: 'unified-browser-1',
    entityId: browserTab.id,
    groupId,
    worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
    contentType: 'browser',
    label: browserTab.title,
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
  state.browserTabsByWorktree = { [FLOATING_TERMINAL_WORKTREE_ID]: [browserTab] }
  state.unifiedTabsByWorktree = { [FLOATING_TERMINAL_WORKTREE_ID]: [unifiedTab] }
  state.groupsByWorktree = {
    [FLOATING_TERMINAL_WORKTREE_ID]: [
      {
        id: groupId,
        worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
        activeTabId: unifiedTab.id,
        tabOrder: [unifiedTab.id],
        recentTabIds: [unifiedTab.id]
      }
    ]
  }
  state.activeGroupIdByWorktree = { [FLOATING_TERMINAL_WORKTREE_ID]: groupId }
  state.tabBarOrderByWorktree = { [FLOATING_TERMINAL_WORKTREE_ID]: [unifiedTab.id] }
}

describe('FloatingTerminalPanel communications', () => {
  beforeEach(setupFloatingTerminalPanelTest)

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('locks browser input while a manager is open and clears it when the panel closes', async () => {
    setFloatingBrowserTab()
    let element = await renderPanel(true)
    const rail = findByTypeName(element, 'FloatingCommsRail')
    ;(rail.props.onOpenAppIdChange as (appId: string | null) => void)('discord')

    element = await renderPanel(true)
    expect(findByTypeName(element, 'FloatingBrowserSlot').props.inputLocked).toBe(true)

    await renderPanel(false)
    runEffects()
    element = await renderPanel(false)

    expect(findByTypeName(element, 'FloatingBrowserSlot').props.inputLocked).toBe(false)
    expect(findByTypeName(element, 'FloatingCommsRail').props.openAppId).toBeNull()
  })

  it('mounts the communications rail on the left of workspace content', async () => {
    const element = await renderPanel(true)
    const contentRow = findByClassName(element, 'flex min-h-0 flex-1')
    const children = Array.isArray(contentRow.props.children)
      ? contentRow.props.children
      : [contentRow.props.children]
    const rail = children[0] as ReactElementLike
    const workspace = children[1] as ReactElementLike
    const railName =
      typeof rail.type === 'function' ? (rail.type as { name?: string }).name : rail.type

    expect(railName).toBe('FloatingCommsRail')
    expect(workspace.props.className).toContain('min-w-0 flex-1')
  })
})
