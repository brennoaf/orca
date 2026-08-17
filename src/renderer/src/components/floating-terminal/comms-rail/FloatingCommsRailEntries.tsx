import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { CommunicationsDockPresence } from '../../../../../shared/communications-dock'
import type {
  FloatingCommsSessionState,
  FloatingCommsSurfaceIdentity
} from '../../../../../shared/floating-comms-surface'
import type {
  FloatingWorkspaceApp,
  FloatingWorkspaceAppId
} from '../../../../../shared/floating-workspace-apps'
import {
  createCommunicationManagerSessionSnapshot,
  createCommunicationManagerSessionState
} from './communication-managers'
import type { listEnabledCommunicationManagers } from './communication-managers'
import { FloatingCommsRailItem } from './FloatingCommsRailItem'
import {
  reportFloatingCommsError,
  sameFloatingCommsIdentity
} from './use-floating-comms-presentations'
import type { DiscordWebFastResponseHostBinding } from './use-discord-web-fast-response-host'
import type { SlackFastResponseHostBinding } from './use-slack-fast-response-host'
import type { WhatsAppFastResponseHostBinding } from './use-whatsapp-fast-response-host'

export function FloatingCommsRailEntries({
  entries,
  attachedIdentity,
  attachedHeight,
  dockPresence,
  whatsappHasUnread,
  panelDocument,
  buttonRefs,
  pendingSessions,
  attachedIdentityRef,
  presenceSequenceRef,
  operationRevisionRef,
  setDockPresence,
  openAttachedApp,
  releaseAttached,
  closeAttached,
  onOpenApp
}: {
  entries: ReturnType<typeof listEnabledCommunicationManagers>
  attachedIdentity: FloatingCommsSurfaceIdentity | null
  attachedHeight: number
  dockPresence: CommunicationsDockPresence | null
  whatsappHasUnread: boolean
  panelDocument: Document | null
  buttonRefs: MutableRefObject<Map<FloatingWorkspaceAppId, HTMLButtonElement>>
  pendingSessions: Map<FloatingWorkspaceAppId, FloatingCommsSessionState>
  attachedIdentityRef: MutableRefObject<FloatingCommsSurfaceIdentity | null>
  presenceSequenceRef: MutableRefObject<number>
  operationRevisionRef: MutableRefObject<number>
  setDockPresence: Dispatch<SetStateAction<CommunicationsDockPresence | null>>
  openAttachedApp: (appId: FloatingWorkspaceAppId) => void
  releaseAttached: (identity?: FloatingCommsSurfaceIdentity) => void
  closeAttached: () => void
  onOpenApp: (app: FloatingWorkspaceApp) => void
}): React.JSX.Element {
  return (
    <>
      {entries.map(({ app, manager }) => {
        const docked = dockPresence?.location === 'dock'
        const attached = attachedIdentity?.appId === app.id
        const domAttached = attached && attachedIdentity.mode === 'attached-dom'
        const whatsappHost: WhatsAppFastResponseHostBinding | undefined =
          app.id === 'whatsapp-web' && attachedIdentity?.mode === 'attached-dom'
            ? {
                identity: {
                  target: 'attached',
                  appId: 'whatsapp-web',
                  requestId: attachedIdentity.requestId,
                  surfaceId: attachedIdentity.surfaceId,
                  mode: attachedIdentity.mode
                },
                visible: attached
              }
            : undefined
        const slackHost: SlackFastResponseHostBinding | undefined =
          app.id === 'slack' && attachedIdentity?.mode === 'attached-dom'
            ? {
                identity: {
                  target: 'attached',
                  appId: 'slack',
                  requestId: attachedIdentity.requestId,
                  surfaceId: attachedIdentity.surfaceId,
                  mode: attachedIdentity.mode
                },
                visible: attached
              }
            : undefined
        const discordWebHost: DiscordWebFastResponseHostBinding | undefined =
          app.id === 'discord' && attachedIdentity?.mode === 'attached-dom'
            ? {
                identity: {
                  target: 'attached',
                  appId: 'discord',
                  requestId: attachedIdentity.requestId,
                  surfaceId: attachedIdentity.surfaceId,
                  mode: attachedIdentity.mode
                },
                visible: attached
              }
            : undefined
        return (
          <FloatingCommsRailItem
            key={app.id}
            app={app}
            manager={manager}
            attached={attached}
            domAttached={domAttached}
            detached={docked}
            hasUnread={app.id === 'whatsapp-web' && whatsappHasUnread}
            initialSessionState={
              pendingSessions.get(app.id) ?? createCommunicationManagerSessionState(app.id)
            }
            portalContainer={panelDocument?.body ?? null}
            whatsappHost={whatsappHost}
            slackHost={slackHost}
            discordWebHost={discordWebHost}
            resizeIdentity={attached ? attachedIdentity : undefined}
            attachedHeight={
              (app.id === 'whatsapp-web' || app.id === 'slack') && attached
                ? attachedHeight
                : undefined
            }
            buttonRef={(element) => {
              if (element) {
                buttonRefs.current.set(app.id, element)
              } else {
                buttonRefs.current.delete(app.id)
              }
            }}
            onSessionStateChange={(sessionState) => {
              pendingSessions.set(app.id, sessionState)
            }}
            onSelect={() => {
              if (docked) {
                const presenceSequence = presenceSequenceRef.current
                void window.api.floatingCommsDock
                  .openOrFocus({ appId: app.id })
                  .then((snapshot) => {
                    if (presenceSequenceRef.current === presenceSequence) {
                      presenceSequenceRef.current += 1
                      setDockPresence({
                        exists: true,
                        visible: snapshot.visible,
                        location: 'dock',
                        activeAppId: app.id
                      })
                    }
                  })
                  .catch((error: unknown) =>
                    reportFloatingCommsError('focus communication dock', error)
                  )
                return
              }
              if (!dockPresence) {
                return
              }
              openAttachedApp(app.id)
            }}
            onDetach={(sessionState) => {
              if (
                !attachedIdentity ||
                attachedIdentity.appId !== app.id ||
                attachedIdentity.mode !== 'attached-dom'
              ) {
                return
              }
              pendingSessions.set(app.id, sessionState)
              const sessions = createCommunicationManagerSessionSnapshot(entries, pendingSessions)
              const presenceSequence = presenceSequenceRef.current
              const detachRevision = operationRevisionRef.current + 1
              operationRevisionRef.current = detachRevision
              void window.api.floatingCommsDock
                .detach({ appId: app.id, identity: attachedIdentity, sessionState, sessions })
                .then((snapshot) => {
                  const currentAttached = attachedIdentityRef.current
                  if (
                    presenceSequenceRef.current === presenceSequence &&
                    operationRevisionRef.current === detachRevision &&
                    (!currentAttached ||
                      sameFloatingCommsIdentity(currentAttached, attachedIdentity))
                  ) {
                    releaseAttached(attachedIdentity)
                    presenceSequenceRef.current += 1
                    setDockPresence({
                      exists: true,
                      visible: snapshot.visible,
                      location: 'dock',
                      activeAppId: app.id
                    })
                  }
                })
                .catch((error: unknown) => reportFloatingCommsError('detach', error))
            }}
            onOpenApp={() => {
              closeAttached()
              onOpenApp(app)
            }}
          />
        )
      })}
    </>
  )
}
