import type { ReactNode } from 'react'
import { ExternalLink } from 'lucide-react'
import type { FloatingWorkspaceApp } from '../../../../../shared/floating-workspace-apps'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

export function CommunicationManagerSurfaceContent({
  app,
  content,
  onOpenApp
}: {
  app: FloatingWorkspaceApp
  content: ReactNode
  onOpenApp: () => void
}): React.JSX.Element {
  return (
    <>
      <div className="border-b border-border/60 px-3 py-2 text-sm font-semibold">{app.label}</div>
      {content}
      <div className="border-t border-border/60 p-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={onOpenApp}
        >
          <ExternalLink className="size-4" />
          {translate('communicationRail.openApp', 'Open {{app}}', { app: app.label })}
        </Button>
      </div>
    </>
  )
}
