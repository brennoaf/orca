import { ChevronDown, ChevronUp, Minimize2 } from 'lucide-react'
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { CommunicationProviderId } from '../../../../shared/communication-integrations'
import type {
  CommunicationsDockDiscordCommand,
  CommunicationsDockIdentity,
  CommunicationsDockSnapshot
} from '../../../../shared/communications-dock'
import { listCommunicationsDockApps } from '../../../../shared/communications-dock'
import type { DiscordVoiceSnapshot } from '../../../../shared/discord-voice'
import type { FloatingWorkspaceAppId } from '../../../../shared/floating-workspace-apps'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  CommunicationManagerRuntimeProvider,
  LOCAL_Z_API_COMMUNICATION_MANAGER_CLIENT,
  type CommunicationManagerRuntime
} from '@/components/floating-terminal/comms-rail/communication-managers'
import { translate } from '@/i18n/i18n'
import { CommunicationsDockDragLayer } from './CommunicationsDockDragLayer'
import {
  appIdForCommunicationProvider,
  CommunicationsDockManagerHosts
} from './CommunicationsDockManagerHosts'
import { CommunicationsDockNavbar } from './CommunicationsDockNavbar'
import { CommunicationsDockSplitLayout } from './CommunicationsDockSplitLayout'
import { useCommunicationsDockBridge } from './useCommunicationsDockBridge'

const DRAG = { WebkitAppRegion: 'drag' } as CSSProperties
const NO_DRAG = { WebkitAppRegion: 'no-drag' } as CSSProperties

function readBooleanParam(params: unknown, key: 'muted' | 'deafened'): boolean {
  if (params && typeof params === 'object' && key in params && typeof params[key] === 'boolean') {
    return params[key]
  }
  throw new Error(`communications_dock_invalid_${key}`)
}

function discordCommand(
  identity: CommunicationsDockIdentity,
  method: string,
  params?: unknown
): CommunicationsDockDiscordCommand {
  const base = { ...identity, appId: 'discord' as const }
  if (method === 'discordVoice.setSelfMute') {
    return { ...base, method: 'set-self-mute', muted: readBooleanParam(params, 'muted') }
  }
  if (method === 'discordVoice.setSelfDeaf') {
    return { ...base, method: 'set-self-deaf', deafened: readBooleanParam(params, 'deafened') }
  }
  if (method === 'discordVoice.leaveCall') {
    return { ...base, method: 'leave-call' }
  }
  if (method === 'discordVoice.reconnect') {
    return { ...base, method: 'reconnect' }
  }
  throw new Error(`communications_dock_unknown_discord_command:${method}`)
}

function IconAction({
  label,
  onClick,
  children
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export function CommunicationsDockRoot({
  initialSnapshot,
  reportError
}: {
  initialSnapshot: CommunicationsDockSnapshot
  reportError: (operation: string, error: unknown) => void
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

  useLayoutEffect(() => {
    if (!ready) {
      return
    }
    const header = headerRef.current
    if (!header) {
      return
    }
    const publishHeight = (): void => {
      const height = Math.round(header.getBoundingClientRect().height)
      run('resize dock navbar', (current) =>
        window.api.floatingCommsDock.setNavbarHeight({ ...current, height })
      )
    }
    publishHeight()
    const observer = new ResizeObserver(publishHeight)
    observer.observe(header)
    return () => observer.disconnect()
  }, [ready, run])

  const runtime = useMemo<CommunicationManagerRuntime>(
    () => ({
      commandDiscord: (method: string, params?: unknown): Promise<DiscordVoiceSnapshot> =>
        method === 'discordVoice.getState'
          ? window.api.floatingCommsDock.getDiscordState({ ...identity, appId: 'discord' })
          : window.api.floatingCommsDock.discordCommand(discordCommand(identity, method, params)),
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
      },
      zApi: LOCAL_Z_API_COMMUNICATION_MANAGER_CLIENT
    }),
    [identity, overlayOpen, reportError]
  )

  const collapseLabel = snapshot.layout.collapsed
    ? translate('communicationsDock.show', 'Show dock content')
    : translate('communicationsDock.collapse', 'Collapse dock')
  const reattachLabel = translate('communicationsDock.reattach', 'Back to panel')

  return (
    <CommunicationManagerRuntimeProvider runtime={runtime}>
      <CommunicationsDockDragLayer
        tabs={snapshot.layout.tabs}
        onMoveApp={(request) =>
          run('move communication app', (current) =>
            window.api.floatingCommsDock.moveApp({ ...current, ...request })
          )
        }
        onReorderTab={(tabId, index) =>
          run('reorder communication tabs', (current) =>
            window.api.floatingCommsDock.reorderTab({ ...current, tabId, index })
          )
        }
      >
        <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground">
          <header
            ref={headerRef}
            className="flex min-h-10 shrink-0 items-center gap-1 border-b border-border bg-card px-1"
            data-drag-region
            style={DRAG}
          >
            <div className="flex min-w-0 flex-1" data-no-drag style={NO_DRAG}>
              <CommunicationsDockNavbar
                tabs={snapshot.layout.tabs}
                activeTabId={snapshot.layout.activeTabId}
                onActivateTab={(tabId) =>
                  run('activate communication tab', (current) =>
                    window.api.floatingCommsDock.activateTab({ ...current, tabId })
                  )
                }
                onActivateLeaf={(tabId, appId) =>
                  run('activate communication app', (current) =>
                    window.api.floatingCommsDock.activateLeaf({ ...current, tabId, appId })
                  )
                }
              />
            </div>
            <div className="flex shrink-0 items-center" data-no-drag style={NO_DRAG}>
              <IconAction
                label={collapseLabel}
                onClick={() => {
                  const collapsed = !snapshot.layout.collapsed
                  setLiveMessage(
                    collapsed
                      ? translate(
                          'communicationsDock.collapsedStatus',
                          'Communication dock collapsed'
                        )
                      : translate(
                          'communicationsDock.expandedStatus',
                          'Communication dock expanded'
                        )
                  )
                  run('toggle communication dock', (current) =>
                    window.api.floatingCommsDock.setCollapsed({ ...current, collapsed })
                  )
                }}
              >
                {snapshot.layout.collapsed ? <ChevronDown /> : <ChevronUp />}
              </IconAction>
              <IconAction
                label={reattachLabel}
                onClick={() =>
                  runVoid('reattach communication dock', (current) =>
                    window.api.floatingCommsDock.reattachDock(current)
                  )
                }
              >
                <Minimize2 />
              </IconAction>
            </div>
          </header>
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
                      run('activate communication app', (current) =>
                        window.api.floatingCommsDock.activateLeaf({ ...current, tabId, appId })
                      )
                    }
                    onUpdateRatio={(request) =>
                      run('resize communication split', (current) =>
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
            onSessionStateChange={(sessionState) =>
              run('update communication session', (current) =>
                window.api.floatingCommsDock.updateSession({ ...current, sessionState })
              )
            }
            onOpenApp={(appId) =>
              runVoid('open communication app', (current) =>
                window.api.floatingCommsDock.action({ ...current, type: 'open-app', appId })
              )
            }
          />
          <div role="status" aria-live="polite" className="sr-only">
            {liveMessage}
          </div>
        </div>
      </CommunicationsDockDragLayer>
    </CommunicationManagerRuntimeProvider>
  )
}
