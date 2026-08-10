import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'

export function ZApiUnreadBadge({
  count,
  className
}: {
  count: number
  className?: string
}): React.JSX.Element | null {
  if (count <= 0) {
    return null
  }
  const label = translate(
    'communicationRail.zApi.unreadCount',
    '{{count}} unread WhatsApp messages',
    { count }
  )
  return (
    <span
      aria-label={label}
      className={cn(
        'inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-4 text-destructive-foreground',
        className
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
