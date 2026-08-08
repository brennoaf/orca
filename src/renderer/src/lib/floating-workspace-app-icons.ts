import { Hash, MessageCircle, MessageSquare, type LucideIcon } from 'lucide-react'
import type { FloatingWorkspaceAppId } from '../../../shared/floating-workspace-apps'

export const FLOATING_WORKSPACE_APP_ICONS: Record<FloatingWorkspaceAppId, LucideIcon> = {
  'whatsapp-web': MessageCircle,
  slack: Hash,
  discord: MessageSquare
}
