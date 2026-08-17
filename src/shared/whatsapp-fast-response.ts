import { z } from 'zod'

export const WhatsAppFastResponseTargetSchema = z.enum(['attached', 'dock', 'browser'])
export type WhatsAppFastResponseTarget = z.infer<typeof WhatsAppFastResponseTargetSchema>

const Positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const Coordinate = z.number().finite().min(-100_000).max(100_000)
const Extent = z.number().finite().positive().max(20_000)

export const WhatsAppFastResponseRectSchema = z
  .object({ x: Coordinate, y: Coordinate, width: Extent, height: Extent })
  .strict()
export type WhatsAppFastResponseRect = z.infer<typeof WhatsAppFastResponseRectSchema>

const AttachedIdentity = {
  appId: z.literal('whatsapp-web'),
  requestId: Positive,
  surfaceId: Positive,
  mode: z.enum(['attached-native', 'attached-dom'])
}
const DockIdentity = {
  appId: z.literal('whatsapp-web'),
  generation: Positive,
  revision: Positive,
  tabId: z.string().min(1).max(128),
  activeLeafAppId: z.literal('whatsapp-web')
}
const BrowserIdentity = {
  appId: z.literal('whatsapp-web'),
  browserTabId: z.string().min(1).max(128),
  browserPageId: z.string().min(1).max(128),
  workspaceId: z.string().min(1).max(128),
  registrationToken: z.string().uuid(),
  revision: Positive
}
const Geometry = {
  rectCss: WhatsAppFastResponseRectSchema,
  rendererZoomFactor: z.number().finite().positive().min(0.1).max(8)
}

export const WhatsAppFastResponseAttachSchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('attached'), ...AttachedIdentity, ...Geometry }).strict(),
  z.object({ target: z.literal('dock'), ...DockIdentity, ...Geometry }).strict(),
  z.object({ target: z.literal('browser'), ...BrowserIdentity, ...Geometry }).strict()
])
export type WhatsAppFastResponseAttach = z.infer<typeof WhatsAppFastResponseAttachSchema>

export const WhatsAppFastResponseVisibilitySchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('attached'), ...AttachedIdentity }).strict(),
  z.object({ target: z.literal('dock'), ...DockIdentity }).strict(),
  z.object({ target: z.literal('browser'), ...BrowserIdentity }).strict()
])
export type WhatsAppFastResponseVisibility = z.infer<typeof WhatsAppFastResponseVisibilitySchema>

export const WhatsAppFastResponseBrowserRegistrationSchema = z
  .object({
    appId: z.literal('whatsapp-web'),
    browserTabId: z.string().min(1).max(128),
    browserPageId: z.string().min(1).max(128),
    workspaceId: z.string().min(1).max(128),
    revision: Positive
  })
  .strict()
export type WhatsAppFastResponseBrowserRegistration = z.infer<
  typeof WhatsAppFastResponseBrowserRegistrationSchema
>

export const WhatsAppFastResponseUnregisterBrowserSurfaceRequestSchema =
  WhatsAppFastResponseBrowserRegistrationSchema.extend({
    target: z.literal('browser'),
    registrationToken: z.string().uuid()
  }).strict()
export type WhatsAppFastResponseUnregisterBrowserSurfaceRequest = z.infer<
  typeof WhatsAppFastResponseUnregisterBrowserSurfaceRequestSchema
>

export type WhatsAppFastResponseBrowserSurface = WhatsAppFastResponseUnregisterBrowserSurfaceRequest

export const WhatsAppFastResponseContentModeSchema = z.enum(['loading', 'qr', 'compact'])
export type WhatsAppFastResponseContentMode = z.infer<typeof WhatsAppFastResponseContentModeSchema>

export const WhatsAppFastResponseAttentionSchema = z.object({ hasUnread: z.boolean() }).strict()
export type WhatsAppFastResponseAttention = z.infer<typeof WhatsAppFastResponseAttentionSchema>

export const WhatsAppFastResponseSnapshotSchema = z
  .object({
    attention: WhatsAppFastResponseAttentionSchema,
    attached: z.boolean(),
    contentMode: WhatsAppFastResponseContentModeSchema,
    crashed: z.boolean(),
    loaded: z.boolean(),
    visible: z.boolean()
  })
  .strict()
export type WhatsAppFastResponseSnapshot = z.infer<typeof WhatsAppFastResponseSnapshotSchema>

export const WhatsAppFastResponseStateSchema = z.enum(['loading', 'ready', 'crashed', 'error'])
export type WhatsAppFastResponseState = z.infer<typeof WhatsAppFastResponseStateSchema>

export const WhatsAppFastResponseStateChangedSchema = z
  .object({
    attention: WhatsAppFastResponseAttentionSchema.optional(),
    contentMode: WhatsAppFastResponseContentModeSchema,
    identity: WhatsAppFastResponseVisibilitySchema,
    state: WhatsAppFastResponseStateSchema,
    recoverable: z.boolean()
  })
  .strict()
export type WhatsAppFastResponseStateChanged = z.infer<
  typeof WhatsAppFastResponseStateChangedSchema
>
