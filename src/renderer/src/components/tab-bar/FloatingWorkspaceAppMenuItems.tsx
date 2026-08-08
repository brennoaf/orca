import { useMemo } from 'react'
import {
  groupFloatingWorkspaceAppsByCategory,
  listEnabledFloatingWorkspaceApps,
  type FloatingWorkspaceApp
} from '../../../../shared/floating-workspace-apps'
import { useAppStore } from '../../store'
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu'
import { getFloatingWorkspaceAppCategoryLabel } from '@/lib/floating-workspace-app-labels'
import { FLOATING_WORKSPACE_APP_ICONS } from '@/lib/floating-workspace-app-icons'

type FloatingWorkspaceAppMenuItemsProps = {
  onSelectApp: (app: FloatingWorkspaceApp) => void
}

export function FloatingWorkspaceAppMenuItems({
  onSelectApp
}: FloatingWorkspaceAppMenuItemsProps): React.JSX.Element | null {
  const floatingWorkspaceApps = useAppStore((s) => s.floatingWorkspaceApps)
  const categoryGroups = useMemo(
    () =>
      groupFloatingWorkspaceAppsByCategory(listEnabledFloatingWorkspaceApps(floatingWorkspaceApps)),
    [floatingWorkspaceApps]
  )

  if (categoryGroups.length === 0) {
    return null
  }

  return (
    <>
      {categoryGroups.map((group) => (
        <DropdownMenuGroup key={group.categoryId}>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
            {getFloatingWorkspaceAppCategoryLabel(group.categoryId)}
          </DropdownMenuLabel>
          {group.apps.map((app) => {
            const Icon = FLOATING_WORKSPACE_APP_ICONS[app.id]
            return (
              <DropdownMenuItem
                key={app.id}
                onSelect={() => onSelectApp(app)}
                className="gap-2 rounded-[7px] px-2 py-1.5 text-[12px] leading-5 font-medium"
              >
                <Icon className="size-4 text-muted-foreground" />
                {app.label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
      ))}
    </>
  )
}
