import { ExternalLink } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { CommunicationProviderId } from '../../../../shared/communication-integrations'
import type { FloatingCommsSessionState } from '../../../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../../../shared/floating-workspace-apps'
import { FLOATING_WORKSPACE_APPS } from '../../../../shared/floating-workspace-apps'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import {
  COMMUNICATION_MANAGER_REGISTRY,
  createCommunicationManagerSessionState
} from '@/components/floating-terminal/comms-rail/communication-managers'

function ManagerHost({
  appId,
  target,
  visible,
  initialSessionState,
  onSessionStateChange,
  onOpenApp
}: {
  appId: FloatingWorkspaceAppId
  target: HTMLDivElement | null
  visible: boolean
  initialSessionState: FloatingCommsSessionState
  onSessionStateChange: (sessionState: FloatingCommsSessionState) => void
  onOpenApp: (appId: FloatingWorkspaceAppId) => void
}): React.JSX.Element {
  const app = FLOATING_WORKSPACE_APPS.find((candidate) => candidate.id === appId)
  if (!app) {
    throw new Error('communications_dock_app_invalid')
  }
  const Manager = COMMUNICATION_MANAGER_REGISTRY[appId].Presentation
  return (
    <Manager
      isPopoverOpen={visible}
      initialSessionState={initialSessionState}
      onSessionStateChange={onSessionStateChange}
    >
      {(presentation) => {
        const content = (
          <div className="flex min-h-full flex-col" inert={!visible} aria-hidden={!visible}>
            <div className="min-h-0 flex-1">{presentation.content}</div>
            <div className="border-t border-border/60 p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => onOpenApp(appId)}
              >
                <ExternalLink className="size-4" />
                {translate('communicationRail.openApp', 'Open {{app}}', { app: app.label })}
              </Button>
            </div>
          </div>
        )
        return target ? createPortal(content, target) : <div hidden>{content}</div>
      }}
    </Manager>
  )
}

export function CommunicationsDockManagerHosts({
  targets,
  visibleApps,
  sessions,
  onSessionStateChange,
  onOpenApp
}: {
  targets: ReadonlyMap<FloatingWorkspaceAppId, HTMLDivElement>
  visibleApps: ReadonlySet<FloatingWorkspaceAppId>
  sessions: Partial<Record<FloatingWorkspaceAppId, FloatingCommsSessionState>>
  onSessionStateChange: (sessionState: FloatingCommsSessionState) => void
  onOpenApp: (appId: FloatingWorkspaceAppId) => void
}): React.JSX.Element {
  return (
    <>
      {FLOATING_WORKSPACE_APPS.map((app) => (
        <ManagerHost
          key={app.id}
          appId={app.id}
          target={targets.get(app.id) ?? null}
          visible={visibleApps.has(app.id)}
          initialSessionState={sessions[app.id] ?? createCommunicationManagerSessionState(app.id)}
          onSessionStateChange={onSessionStateChange}
          onOpenApp={onOpenApp}
        />
      ))}
    </>
  )
}

export function appIdForCommunicationProvider(
  provider: CommunicationProviderId
): FloatingWorkspaceAppId {
  if (provider === 'z-api') {
    return 'whatsapp-web'
  }
  return provider
}
