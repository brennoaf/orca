import type { FloatingWorkspaceAppCategoryId } from '../../../shared/floating-workspace-apps'
import { translate } from '@/i18n/i18n'

const CATEGORY_LABELS: Record<FloatingWorkspaceAppCategoryId, () => string> = {
  communications: () =>
    translate('auto.lib.floating.workspace.app.labels.communications', 'Communications')
}

export function getFloatingWorkspaceAppCategoryLabel(
  categoryId: FloatingWorkspaceAppCategoryId
): string {
  return CATEGORY_LABELS[categoryId]()
}
