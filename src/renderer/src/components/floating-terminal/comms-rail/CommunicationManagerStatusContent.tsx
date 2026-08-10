import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

export function CommunicationManagerStatusLoadingContent({
  providerName
}: {
  providerName: string
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" />
      {translate('communicationRail.integrationLoading', 'Loading {{provider}} status…', {
        provider: providerName
      })}
    </div>
  )
}

export function CommunicationManagerStatusErrorContent({
  error,
  onRetry
}: {
  error: string
  onRetry: () => void
}): React.JSX.Element {
  return (
    <div className="space-y-3 px-3 py-3">
      <p className="text-xs text-destructive" role="alert">
        {error}
      </p>
      <Button type="button" variant="ghost" size="sm" onClick={onRetry}>
        {translate('communicationRail.retryStatus', 'Retry')}
      </Button>
    </div>
  )
}
