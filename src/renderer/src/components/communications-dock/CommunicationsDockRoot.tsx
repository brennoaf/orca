import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CommunicationProviderId } from '../../../../shared/communication-integrations'
import type {
  CommunicationsDockIdentity,
  CommunicationsDockSnapshot
} from '../../../../shared/communications-dock'
import { listCommunicationsDockApps } from '../../../../shared/communications-dock'
import type { DiscordVoiceSnapshot } from '../../../../shared/discord-voice'
import type { FloatingWorkspaceAppId } from '../../../../shared/floating-workspace-apps'
import {
  CommunicationManagerRuntimeProvider,
  type CommunicationManagerRuntime
} from '@/components/floating-terminal/comms-rail/communication-managers'
import { translate } from '@/i18n/i18n'
import { CommunicationsDockDragLayer } from './CommunicationsDockDragLayer'
import {
  appIdForCommunicationProvider,
  CommunicationsDockManagerHosts
} from './CommunicationsDockManagerHosts'
import { CommunicationsDockHeader } from './CommunicationsDockHeader'
import { CommunicationsDockSplitLayout } from './CommunicationsDockSplitLayout'
import { useCommunicationsDockBridge } from './useCommunicationsDockBridge'
import { useCommunicationsDockNavbarHeight } from './useCommunicationsDockNavbarHeight'
import { communicationsDockDiscordCommand } from './communications-dock-discord-command'

export function CommunicationsDockRoot({
  initialSnapshot,
  reportError,
  onExit
}: {
  initialSnapshot: CommunicationsDockSnapshot
  reportError: (operation: string, error: unknown) => void
  onExit: () => void
}): React.JSX.Element {
  const { snapshot, ready, run, runVoid } = useCommunicationsDockBridge(
    initialSnapshot,
    reportError
  )
  const [targets, setTargets] = useState<ReadonlyMap<FloatingWorkspaceAppId, HTMLDivElement>>(
    new Map()
  )
  const [overlayOpen, setOverlayOpen] = useState(false)
  const [liveMessage, setLiveMessage] = useState('')
  const [whatsappHasUnread, setWhatsappHasUnread] = useState(false)
  const [headerActionsTarget, setHeaderActionsTarget] = useState<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const identity = useMemo(
    () => ({ generation: snapshot.generation, revision: snapshot.revision }),
    [snapshot.generation, snapshot.revision]
  )
  const activeTab =
    snapshot.layout.tabs.find((tab) => tab.id === snapshot.layout.activeTabId) ??
    snapshot.layout.tabs[0]
  const visibleApps = useMemo(
    () =>
      new Set<FloatingWorkspaceAppId>(
        snapshot.layout.collapsed ? [] : listCommunicationsDockApps(activeTab.layout)
      ),
    [activeTab.layout, snapshot.layout.collapsed]
  )
  const whatsappHost = useMemo(
    () => ({
      identity: {
        target: 'dock' as const,
        appId: 'whatsapp-web' as const,
        generation: snapshot.generation,
        revision: snapshot.revision,
        tabId: activeTab.id,
        activeLeafAppId: 'whatsapp-web' as const
      },
      visible: snapshot.visible && !snapshot.layout.collapsed && visibleApps.has('whatsapp-web'),
      collapsed: snapshot.layout.collapsed
    }),
    [activeTab.id, snapshot, visibleApps]
  )
  const slackHost = useMemo(
    () => ({
      identity: {
        target: 'dock' as const,
        appId: 'slack' as const,
        generation: snapshot.generation,
        revision: snapshot.revision,
        tabId: activeTab.id,
        activeLeafAppId: 'slack' as const
      },
      visible: snapshot.visible && !snapshot.layout.collapsed && visibleApps.has('slack')
    }),
    [activeTab.id, snapshot, visibleApps]
  )
  const discordWebHost = useMemo(
    () => ({
      identity: {
        target: 'dock' as const,
        appId: 'discord' as const,
        generation: snapshot.generation,
        revision: snapshot.revision,
        tabId: activeTab.id,
        activeLeafAppId: 'discord' as const
      },
      visible: snapshot.visible && !snapshot.layout.collapsed && visibleApps.has('discord')
    }),
    [activeTab.id, snapshot, visibleApps]
  )
  const visibleHost = useMemo(() => {
    if (activeTab.activeLeafAppId === 'whatsapp-web' && whatsappHost.visible) {
      return {
        hide: (): Promise<unknown> => window.api.whatsappFastResponse.hide(whatsappHost.identity),
        errorOperation: 'hide compact WhatsApp Web'
      }
    }
    if (activeTab.activeLeafAppId === 'slack' && slackHost.visible) {
      return {
        hide: (): Promise<unknown> => window.api.slackFastResponse.hide(slackHost.identity),
        errorOperation: 'hide Slack'
      }
    }
    if (
      activeTab.activeLeafAppId === 'discord' &&
      discordWebHost.visible &&
      window.api.discordWebFastResponse
    ) {
      return {
        hide: (): Promise<unknown> =>
          window.api.discordWebFastResponse.hide(discordWebHost.identity),
        errorOperation: 'hide Discord Web'
      }
    }
    return null
  }, [activeTab.activeLeafAppId, discordWebHost, slackHost, whatsappHost])
  const hideVisibleHostBefore = useCallback(
    (afterHide: () => void): void => {
      if (!visibleHost) {
        afterHide()
        return
      }
      void visibleHost
        .hide()
        .then(afterHide)
        .catch((error: unknown) => reportError(visibleHost.errorOperation, error))
    },
    [reportError, visibleHost]
  )
  const hideVisibleHostBeforeRun = useCallback(
    (
      operation: string,
      request: (identity: CommunicationsDockIdentity) => Promise<CommunicationsDockSnapshot>
    ): void => {
      hideVisibleHostBefore(() => run(operation, request))
    },
    [hideVisibleHostBefore, run]
  )
  const hideVisibleHostBeforeRunVoid = useCallback(
    (operation: string, request: (identity: CommunicationsDockIdentity) => Promise<void>): void => {
      hideVisibleHostBefore(() => runVoid(operation, request))
    },
    [hideVisibleHostBefore, runVoid]
  )

  const setContentTarget = useCallback(
    (appId: FloatingWorkspaceAppId, element: HTMLDivElement | null): void => {
      setTargets((current) => {
        if (current.get(appId) === element || (!element && !current.has(appId))) {
          return current
        }
        const next = new Map(current)
        if (element) {
          next.set(appId, element)
        } else {
          next.delete(appId)
        }
        return next
      })
    },
    []
  )

  useCommunicationsDockNavbarHeight(ready, headerRef, run)

  useLayoutEffect(
    () =>
      window.api.whatsappFastResponse.onStateChanged((event) => {
        if (event.attention) {
          setWhatsappHasUnread(event.attention.hasUnread)
        }
      }),
    []
  )

  const runtime = useMemo<CommunicationManagerRuntime>(
    () => ({
      commandDiscord: (method: string, params?: unknown): Promise<DiscordVoiceSnapshot> =>
        method === 'discordVoice.getState'
          ? window.api.floatingCommsDock.getDiscordState({ ...identity, appId: 'discord' })
          : window.api.floatingCommsDock.discordCommand(
              communicationsDockDiscordCommand(identity, method, params)
            ),
      loadIntegrationStatuses: () => window.api.floatingCommsDock.getIntegrationStatuses(),
      openSettings: (provider: CommunicationProviderId) => {
        void window.api.floatingCommsDock
          .action({
            ...identity,
            type: 'open-settings',
            appId: appIdForCommunicationProvider(provider),
            provider
          })
          .catch((error: unknown) => reportError('open communication settings', error))
      },
      overlayOpen,
      setOverlayOpen: (open: boolean) => {
        void window.api.floatingCommsDock
          .discordCommand({ ...identity, appId: 'discord', method: 'set-overlay-open', open })
          .then(() => setOverlayOpen(open))
          .catch((error: unknown) => reportError('set Discord overlay', error))
      }
    }),
    [identity, overlayOpen, reportError]
  )

  return (
    <CommunicationManagerRuntimeProvider runtime={runtime}>
      <CommunicationsDockDragLayer
        tabs={snapshot.layout.tabs}
        onMoveApp={(request) =>
          hideVisibleHostBeforeRun('move communication app', (current) =>
            window.api.floatingCommsDock.moveApp({ ...current, ...request })
          )
        }
        onMoveTab={(request) =>
          hideVisibleHostBeforeRun('move communication tab', (current) =>
            window.api.floatingCommsDock.moveTab({ ...current, ...request })
          )
        }
        onCreateTab={(request) =>
          hideVisibleHostBeforeRun('create communication tab', (current) =>
            window.api.floatingCommsDock.createTab({ ...current, ...request })
          )
        }
        onReorderTab={(tabId, index) =>
          hideVisibleHostBeforeRun('reorder communication tabs', (current) =>
            window.api.floatingCommsDock.reorderTab({ ...current, tabId, index })
          )
        }
      >
        <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
          <CommunicationsDockHeader
            snapshot={snapshot}
            activeTab={activeTab}
            whatsappHasUnread={whatsappHasUnread}
            headerRef={headerRef}
            setHeaderActionsTarget={setHeaderActionsTarget}
            onActivateTab={(tabId) =>
              hideVisibleHostBeforeRun('activate communication tab', (current) =>
                window.api.floatingCommsDock.activateTab({ ...current, tabId })
              )
            }
            onActivateLeaf={(tabId, appId) =>
              hideVisibleHostBeforeRun('activate communication app', (current) =>
                window.api.floatingCommsDock.activateLeaf({ ...current, tabId, appId })
              )
            }
            onToggle={() => {
              const collapsed = !snapshot.layout.collapsed
              setLiveMessage(
                collapsed
                  ? translate('communicationsDock.collapsedStatus', 'Communication dock collapsed')
                  : translate('communicationsDock.expandedStatus', 'Communication dock expanded')
              )
              hideVisibleHostBeforeRun('toggle communication dock', (current) =>
                window.api.floatingCommsDock.setCollapsed({ ...current, collapsed })
              )
            }}
            onReattach={() => {
              onExit()
              hideVisibleHostBeforeRunVoid('reattach communication dock', (current) =>
                window.api.floatingCommsDock.reattachDock(current)
              )
            }}
          />
          <main
            className={snapshot.layout.collapsed ? 'hidden' : 'flex min-h-0 flex-1'}
            inert={snapshot.layout.collapsed}
          >
            {snapshot.layout.tabs.map((tab) => {
              const selected = tab.id === snapshot.layout.activeTabId
              return (
                <div
                  key={tab.id}
                  role="tabpanel"
                  aria-hidden={!selected}
                  inert={!selected}
                  className={selected ? 'flex min-h-0 min-w-0 flex-1' : 'hidden'}
                >
                  <CommunicationsDockSplitLayout
                    node={tab.layout}
                    tabId={tab.id}
                    activeLeafAppId={tab.activeLeafAppId}
                    setContentTarget={setContentTarget}
                    onActivateLeaf={(tabId, appId) =>
                      hideVisibleHostBeforeRun('activate communication app', (current) =>
                        window.api.floatingCommsDock.activateLeaf({ ...current, tabId, appId })
                      )
                    }
                    onUpdateRatio={(request) =>
                      hideVisibleHostBeforeRun('resize communication split', (current) =>
                        window.api.floatingCommsDock.updateRatio({ ...current, ...request })
                      )
                    }
                  />
                </div>
              )
            })}
          </main>
          <CommunicationsDockManagerHosts
            targets={targets}
            visibleApps={visibleApps}
            sessions={snapshot.sessions}
            whatsappHost={whatsappHost}
            slackHost={slackHost}
            discordWebHost={discordWebHost}
            headerActionsTarget={headerActionsTarget}
            headerActionsAppId={activeTab.activeLeafAppId}
            onSessionStateChange={(sessionState) =>
              run('update communication session', (current) =>
                window.api.floatingCommsDock.updateSession({ ...current, sessionState })
              )
            }
            onOpenApp={(appId) => {
              if (appId === 'whatsapp-web' && whatsappHost.visible) {
                void window.api.whatsappFastResponse
                  .hide(whatsappHost.identity)
                  .then(() =>
                    runVoid('open communication app', (current) =>
                      window.api.floatingCommsDock.action({ ...current, type: 'open-app', appId })
                    )
                  )
                  .catch((error: unknown) => reportError('hide compact WhatsApp Web', error))
                return
              }
              if (appId === 'slack' && slackHost.visible) {
                void window.api.slackFastResponse
                  .hide(slackHost.identity)
                  .then(() =>
                    runVoid('open communication app', (current) =>
                      window.api.floatingCommsDock.action({ ...current, type: 'open-app', appId })
                    )
                  )
                  .catch((error: unknown) => reportError('hide Slack', error))
                return
              }
              if (
                appId === 'discord' &&
                discordWebHost.visible &&
                window.api.discordWebFastResponse
              ) {
                void window.api.discordWebFastResponse
                  .hide(discordWebHost.identity)
                  .then(() =>
                    runVoid('open communication app', (current) =>
                      window.api.floatingCommsDock.action({ ...current, type: 'open-app', appId })
                    )
                  )
                  .catch((error: unknown) => reportError('hide Discord Web', error))
                return
              }
              runVoid('open communication app', (current) =>
                window.api.floatingCommsDock.action({ ...current, type: 'open-app', appId })
              )
            }}
          />
          <div role="status" aria-live="polite" className="sr-only">
            {liveMessage}
          </div>
        </div>
      </CommunicationsDockDragLayer>
    </CommunicationManagerRuntimeProvider>
  )
}
