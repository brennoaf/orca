import { ExternalLink } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { CommunicationProviderId } from '../../../../shared/communication-integrations'
import type { FloatingCommsSessionState } from '../../../../shared/floating-comms-surface'
import type { FloatingWorkspaceAppId } from '../../../../shared/floating-workspace-apps'
import type { WhatsAppFastResponseHostBinding } from '@/components/floating-terminal/comms-rail/use-whatsapp-fast-response-host'
import type { SlackFastResponseHostBinding } from '@/components/floating-terminal/comms-rail/use-slack-fast-response-host'
import type { DiscordWebFastResponseHostBinding } from '@/components/floating-terminal/comms-rail/use-discord-web-fast-response-host'
import { FLOATING_WORKSPACE_APPS } from '../../../../shared/floating-workspace-apps'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import {
  COMMUNICATION_MANAGER_REGISTRY,
  createCommunicationManagerSessionState
} from '@/components/floating-terminal/comms-rail/communication-managers'

export function ManagerHost({
  appId,
  target,
  visible,
  initialSessionState,
  onSessionStateChange,
  onOpenApp,
  whatsappHost,
  slackHost,
  discordWebHost,
  headerActionsTarget
}: {
  appId: FloatingWorkspaceAppId
  target: HTMLDivElement | null
  visible: boolean
  initialSessionState: FloatingCommsSessionState
  onSessionStateChange: (sessionState: FloatingCommsSessionState) => void
  onOpenApp: (appId: FloatingWorkspaceAppId) => void
  whatsappHost?: WhatsAppFastResponseHostBinding
  slackHost?: SlackFastResponseHostBinding
  discordWebHost?: DiscordWebFastResponseHostBinding
  headerActionsTarget?: HTMLDivElement | null
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
      whatsappHost={appId === 'whatsapp-web' ? whatsappHost : undefined}
      slackHost={appId === 'slack' ? slackHost : undefined}
      discordWebHost={appId === 'discord' ? discordWebHost : undefined}
    >
      {(presentation) => {
        const openAppLabel = translate('communicationRail.openApp', 'Open {{app}}', {
          app: app.label
        })
        const content = (
          <div
            className={`flex h-full min-h-0 flex-col ${presentation.minimal ? 'bg-white' : ''}`}
            inert={!visible}
            aria-hidden={!visible}
          >
            <div key="content" className="min-h-0 flex-1">
              {presentation.content}
            </div>
            {presentation.minimal || presentation.hideFooter ? null : (
              <div key="footer" className="border-t border-border/60 p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => onOpenApp(appId)}
                >
                  <ExternalLink className="size-4" />
                  {openAppLabel}
                </Button>
              </div>
            )}
          </div>
        )
        return (
          <>
            {target ? createPortal(content, target) : <div hidden>{content}</div>}
            {headerActionsTarget && (presentation.headerActions || presentation.hideFooter)
              ? createPortal(
                  <div className="flex w-max shrink-0 items-center gap-1">
                    {presentation.headerActions}
                    {presentation.hideFooter ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={openAppLabel}
                            onClick={() => onOpenApp(appId)}
                          >
                            <ExternalLink />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" sideOffset={4}>
                          {openAppLabel}
                        </TooltipContent>
                      </Tooltip>
                    ) : null}
                  </div>,
                  headerActionsTarget
                )
              : null}
          </>
        )
      }}
    </Manager>
  )
}

export function CommunicationsDockManagerHosts({
  targets,
  visibleApps,
  sessions,
  onSessionStateChange,
  onOpenApp,
  whatsappHost,
  slackHost,
  discordWebHost,
  headerActionsTarget,
  headerActionsAppId
}: {
  targets: ReadonlyMap<FloatingWorkspaceAppId, HTMLDivElement>
  visibleApps: ReadonlySet<FloatingWorkspaceAppId>
  sessions: Partial<Record<FloatingWorkspaceAppId, FloatingCommsSessionState>>
  onSessionStateChange: (sessionState: FloatingCommsSessionState) => void
  onOpenApp: (appId: FloatingWorkspaceAppId) => void
  whatsappHost?: WhatsAppFastResponseHostBinding
  slackHost?: SlackFastResponseHostBinding
  discordWebHost?: DiscordWebFastResponseHostBinding
  headerActionsTarget?: HTMLDivElement | null
  headerActionsAppId?: FloatingWorkspaceAppId
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
          whatsappHost={whatsappHost}
          slackHost={slackHost}
          discordWebHost={discordWebHost}
          headerActionsTarget={app.id === headerActionsAppId ? headerActionsTarget : null}
        />
      ))}
    </>
  )
}

export function appIdForCommunicationProvider(
  provider: CommunicationProviderId
): FloatingWorkspaceAppId {
  return provider
}
