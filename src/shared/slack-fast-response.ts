import { z } from 'zod'

const Positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const Identifier = z.string().min(1).max(128)
const Coordinate = z.number().finite().min(-100_000).max(100_000)
const Extent = z.number().finite().positive().max(20_000)

export const SlackFastResponseRectSchema = z
  .object({ x: Coordinate, y: Coordinate, width: Extent, height: Extent })
  .strict()

const AttachedIdentity = {
  appId: z.literal('slack'),
  requestId: Positive,
  surfaceId: Positive,
  mode: z.enum(['attached-native', 'attached-dom'])
}
const DockIdentity = {
  appId: z.literal('slack'),
  generation: Positive,
  revision: Positive,
  tabId: Identifier,
  activeLeafAppId: z.literal('slack')
}
const BrowserIdentity = {
  appId: z.literal('slack'),
  browserTabId: Identifier,
  browserPageId: Identifier,
  workspaceId: Identifier,
  registrationToken: z.string().uuid(),
  revision: Positive
}
const Geometry = {
  rectCss: SlackFastResponseRectSchema,
  rendererZoomFactor: z.number().finite().min(0.1).max(8)
}

export const SlackFastResponseAttachSchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('attached'), ...AttachedIdentity, ...Geometry }).strict(),
  z.object({ target: z.literal('dock'), ...DockIdentity, ...Geometry }).strict(),
  z.object({ target: z.literal('browser'), ...BrowserIdentity, ...Geometry }).strict()
])
export type SlackFastResponseAttach = z.infer<typeof SlackFastResponseAttachSchema>

export const SlackFastResponseVisibilitySchema = z.discriminatedUnion('target', [
  z.object({ target: z.literal('attached'), ...AttachedIdentity }).strict(),
  z.object({ target: z.literal('dock'), ...DockIdentity }).strict(),
  z.object({ target: z.literal('browser'), ...BrowserIdentity }).strict()
])
export type SlackFastResponseVisibility = z.infer<typeof SlackFastResponseVisibilitySchema>

export const SlackFastResponseBrowserRegistrationSchema = z
  .object({
    appId: z.literal('slack'),
    browserTabId: Identifier,
    browserPageId: Identifier,
    workspaceId: Identifier,
    revision: Positive
  })
  .strict()
export type SlackFastResponseBrowserRegistration = z.infer<
  typeof SlackFastResponseBrowserRegistrationSchema
>

export const SlackFastResponseUnregisterBrowserSurfaceRequestSchema =
  SlackFastResponseBrowserRegistrationSchema.extend({
    target: z.literal('browser'),
    registrationToken: z.string().uuid()
  }).strict()
export type SlackFastResponseUnregisterBrowserSurfaceRequest = z.infer<
  typeof SlackFastResponseUnregisterBrowserSurfaceRequestSchema
>

export const SlackFastResponseContentModeSchema = z.enum([
  'loading',
  'login',
  'compact',
  'unsupported'
])
export type SlackFastResponseContentMode = z.infer<typeof SlackFastResponseContentModeSchema>

export const SlackFastResponseStateSchema = z.enum([
  'loading',
  'login',
  'compact',
  'unsupported',
  'crashed',
  'error'
])
export type SlackFastResponseState = z.infer<typeof SlackFastResponseStateSchema>

export const SlackFastResponseSnapshotSchema = z
  .object({
    attached: z.boolean(),
    contentMode: SlackFastResponseContentModeSchema,
    crashed: z.boolean(),
    loaded: z.boolean(),
    visible: z.boolean()
  })
  .strict()
export type SlackFastResponseSnapshot = z.infer<typeof SlackFastResponseSnapshotSchema>

export const SlackFastResponseStateChangedSchema = z
  .object({
    contentMode: SlackFastResponseContentModeSchema,
    identity: SlackFastResponseVisibilitySchema,
    state: SlackFastResponseStateSchema,
    recoverable: z.boolean()
  })
  .strict()
export type SlackFastResponseStateChanged = z.infer<typeof SlackFastResponseStateChangedSchema>
