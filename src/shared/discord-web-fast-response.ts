import { z } from 'zod'
export { DISCORD_WEB_COMPACT_INTENT_EVENT } from './discord-web-fast-response-events'

const Positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const Identifier = z.string().min(1).max(128)
const Coordinate = z.number().finite().min(-100_000).max(100_000)
const Extent = z.number().finite().positive().max(20_000)
const DiscordSnowflake = z.string().regex(/^\d{17,20}$/)
const DiscordLabel = z.string().trim().min(1).max(256)
const DiscordDirectMessageHref = z.string().regex(/^\/channels\/@me\/\d{17,20}$/)

const Geometry = {
  rectCss: z.object({ x: Coordinate, y: Coordinate, width: Extent, height: Extent }).strict(),
  rendererZoomFactor: z.number().finite().min(0.1).max(8)
}
const AttachedIdentity = {
  appId: z.literal('discord'),
  requestId: Positive,
  surfaceId: Positive,
  mode: z.enum(['attached-native', 'attached-dom'])
}
const DockIdentity = {
  appId: z.literal('discord'),
  generation: Positive,
  revision: Positive,
  tabId: Identifier,
  activeLeafAppId: z.literal('discord')
}

export const DiscordWebFastResponseAttachSchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('attached'), ...AttachedIdentity, ...Geometry }).strict(),
  z.object({ target: z.literal('dock'), ...DockIdentity, ...Geometry }).strict()
])
export type DiscordWebFastResponseAttach = z.infer<typeof DiscordWebFastResponseAttachSchema>

export const DiscordWebFastResponseVisibilitySchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('attached'), ...AttachedIdentity }).strict(),
  z.object({ target: z.literal('dock'), ...DockIdentity }).strict()
])
export type DiscordWebFastResponseVisibility = z.infer<
  typeof DiscordWebFastResponseVisibilitySchema
>

export const DiscordWebFastResponseContentModeSchema = z.enum([
  'loading',
  'login',
  'ready',
  'unsupported'
])
export type DiscordWebFastResponseContentMode = z.infer<
  typeof DiscordWebFastResponseContentModeSchema
>

export const DiscordWebFastResponseStateSchema = z.enum([
  'loading',
  'login',
  'ready',
  'unsupported',
  'crashed',
  'error'
])
export type DiscordWebFastResponseState = z.infer<typeof DiscordWebFastResponseStateSchema>

export const DiscordWebFastResponseSnapshotSchema = z
  .object({
    attached: z.boolean(),
    contentMode: DiscordWebFastResponseContentModeSchema,
    crashed: z.boolean(),
    loaded: z.boolean(),
    visible: z.boolean()
  })
  .strict()
export type DiscordWebFastResponseSnapshot = z.infer<typeof DiscordWebFastResponseSnapshotSchema>

export const DiscordWebFastResponseStateChangedSchema = z
  .object({
    contentMode: DiscordWebFastResponseContentModeSchema,
    identity: DiscordWebFastResponseVisibilitySchema,
    state: DiscordWebFastResponseStateSchema,
    recoverable: z.boolean()
  })
  .strict()
export type DiscordWebFastResponseStateChanged = z.infer<
  typeof DiscordWebFastResponseStateChangedSchema
>

export const DiscordWebVoiceAvailabilitySchema = z
  .object({ available: z.boolean(), revision: Positive })
  .strict()
export type DiscordWebVoiceAvailability = z.infer<typeof DiscordWebVoiceAvailabilitySchema>

export const DiscordWebVoiceSelectionSchema = z
  .object({ revision: Positive, channelId: z.string().regex(/^\d{17,20}$/) })
  .strict()
export type DiscordWebVoiceSelection = z.infer<typeof DiscordWebVoiceSelectionSchema>

export const DiscordWebManagerTabSchema = z.enum(['servers', 'messages', 'friends'])
export type DiscordWebManagerTab = z.infer<typeof DiscordWebManagerTabSchema>

const DiscordWebServerContextSchema = z
  .object({ serverId: DiscordSnowflake, serverName: DiscordLabel })
  .strict()

export const DiscordWebCompactModeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('manager'), tab: DiscordWebManagerTabSchema }).strict(),
  z.object({ kind: z.literal('server-channels'), ...DiscordWebServerContextSchema.shape }).strict(),
  z
    .object({
      kind: z.literal('dedicated'),
      source: z.discriminatedUnion('kind', [
        z
          .object({
            kind: z.literal('server-channel'),
            ...DiscordWebServerContextSchema.shape,
            channelId: DiscordSnowflake,
            channelName: DiscordLabel
          })
          .strict(),
        z
          .object({
            kind: z.literal('direct-message'),
            href: DiscordDirectMessageHref,
            name: DiscordLabel
          })
          .strict()
      ])
    })
    .strict()
])
export type DiscordWebCompactMode = z.infer<typeof DiscordWebCompactModeSchema>

export const DiscordWebCompactNavigationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('select-manager-tab'), tab: DiscordWebManagerTabSchema }).strict(),
  z.object({ kind: z.literal('select-server'), ...DiscordWebServerContextSchema.shape }).strict(),
  z
    .object({
      kind: z.literal('open-text-channel'),
      ...DiscordWebServerContextSchema.shape,
      channelId: DiscordSnowflake,
      channelName: DiscordLabel
    })
    .strict(),
  z
    .object({
      kind: z.literal('open-direct-message'),
      href: DiscordDirectMessageHref,
      name: DiscordLabel
    })
    .strict(),
  z.object({ kind: z.literal('back') }).strict()
])
export type DiscordWebCompactNavigation = z.infer<typeof DiscordWebCompactNavigationSchema>

export const DiscordWebCompactAvailabilitySchema = z
  .object({ available: z.boolean(), revision: Positive })
  .strict()
export type DiscordWebCompactAvailability = z.infer<typeof DiscordWebCompactAvailabilitySchema>

export const DiscordWebCompactIntentSchema = z
  .object({ revision: Positive, intent: DiscordWebCompactNavigationSchema })
  .strict()
export type DiscordWebCompactIntent = z.infer<typeof DiscordWebCompactIntentSchema>

export const DiscordWebCompactModeChangedSchema = z
  .object({ canClose: z.boolean(), mode: DiscordWebCompactModeSchema })
  .strict()
export type DiscordWebCompactModeChanged = z.infer<typeof DiscordWebCompactModeChangedSchema>
