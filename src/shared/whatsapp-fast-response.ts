import { z } from 'zod'

export const WhatsAppFastResponseTargetSchema = z.enum(['attached', 'dock'])
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
  mode: z.literal('attached-native')
}
const DockIdentity = {
  appId: z.literal('whatsapp-web'),
  generation: Positive,
  revision: Positive,
  tabId: z.string().min(1).max(128),
  activeLeafAppId: z.literal('whatsapp-web')
}
const Geometry = {
  rectCss: WhatsAppFastResponseRectSchema,
  rendererZoomFactor: z.number().finite().positive().min(0.1).max(8)
}

export const WhatsAppFastResponseAttachSchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('attached'), ...AttachedIdentity, ...Geometry }).strict(),
  z.object({ target: z.literal('dock'), ...DockIdentity, ...Geometry }).strict()
])
export type WhatsAppFastResponseAttach = z.infer<typeof WhatsAppFastResponseAttachSchema>

export const WhatsAppFastResponseVisibilitySchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('attached'), ...AttachedIdentity }).strict(),
  z.object({ target: z.literal('dock'), ...DockIdentity }).strict()
])
export type WhatsAppFastResponseVisibility = z.infer<typeof WhatsAppFastResponseVisibilitySchema>

export type WhatsAppFastResponseSnapshot = {
  attention: WhatsAppFastResponseAttention
  attached: boolean
  crashed: boolean
  loaded: boolean
  visible: boolean
}

export type WhatsAppFastResponseAttention = {
  hasUnread: boolean
}

export type WhatsAppFastResponseState = 'loading' | 'ready' | 'crashed' | 'error'
export type WhatsAppFastResponseStateChanged = {
  attention?: WhatsAppFastResponseAttention
  identity: WhatsAppFastResponseVisibility
  state: WhatsAppFastResponseState
  recoverable: boolean
}
