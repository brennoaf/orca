import { z } from 'zod'
import type {
  CommunicationsDockCreateTabRequest,
  CommunicationsDockMoveAppRequest,
  CommunicationsDockMoveTabRequest,
  CommunicationsDockSplitAppRequest
} from '../../shared/communications-dock'
import { COMMUNICATIONS_DOCK_MAX_APPS } from '../../shared/communications-dock'
import {
  FLOATING_WORKSPACE_APPS,
  type FloatingWorkspaceAppId
} from '../../shared/floating-workspace-apps'
import type { FloatingCommsSessionState } from '../../shared/floating-comms-surface'
import { FLOATING_COMMS_SESSION_DRAFT_MAX_LENGTH } from '../../shared/floating-comms-surface'

const Positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const AppId = z.custom<FloatingWorkspaceAppId>(
  (value) => typeof value === 'string' && FLOATING_WORKSPACE_APPS.some((app) => app.id === value)
)
const Identity = { generation: Positive, revision: Positive }
const VersionedApp = { ...Identity, appId: AppId }
const TabId = z.string().min(1).max(128)
const Side = z.enum(['left', 'right', 'up', 'down'])
const AttachedSurfaceIdentity = z
  .object({
    appId: AppId,
    requestId: Positive,
    surfaceId: Positive,
    mode: z.enum(['attached-native', 'attached-dom'])
  })
  .strict()

export const communicationsDockSchemas = {
  positive: Positive,
  appId: AppId,
  identity: Identity,
  versionedApp: VersionedApp,
  tabId: TabId,
  attachedSurfaceIdentity: AttachedSurfaceIdentity,
  move: z
    .object({ ...VersionedApp, targetTabId: TabId, targetAppId: AppId, side: Side })
    .strict() as z.ZodType<CommunicationsDockMoveAppRequest | CommunicationsDockSplitAppRequest>,
  moveTab: z
    .object({ ...Identity, sourceTabId: TabId, targetTabId: TabId, targetAppId: AppId, side: Side })
    .strict() as z.ZodType<CommunicationsDockMoveTabRequest>,
  createTab: z
    .object({
      ...VersionedApp,
      sourceTabId: TabId,
      index: z.number().int().min(-COMMUNICATIONS_DOCK_MAX_APPS).max(COMMUNICATIONS_DOCK_MAX_APPS)
    })
    .strict() as z.ZodType<CommunicationsDockCreateTabRequest>
}

export const communicationsDockSessionSchema: z.ZodType<FloatingCommsSessionState> =
  z.discriminatedUnion('appId', [
    z
      .object({
        appId: z.literal('whatsapp-web'),
        selectedConversationId: z.number().finite().nullable(),
        draft: z.string().max(FLOATING_COMMS_SESSION_DRAFT_MAX_LENGTH)
      })
      .strict(),
    z.object({ appId: z.literal('slack') }).strict(),
    z.object({ appId: z.literal('discord') }).strict()
  ])

export function hasMatchingCommunicationsDockSessions(
  sessions: Partial<Record<FloatingWorkspaceAppId, FloatingCommsSessionState>> | undefined
): boolean {
  return (
    !sessions ||
    Object.entries(sessions).every(([appId, sessionState]) => appId === sessionState.appId)
  )
}
