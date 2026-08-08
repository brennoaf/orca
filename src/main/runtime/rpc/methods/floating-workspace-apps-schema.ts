import { z } from 'zod'

const FloatingWorkspaceAppPreference = z
  .object({
    enabled: z.boolean(),
    sessionProfileIdOverride: z.string().nullable(),
    dedicatedSessionProfileId: z.string().nullable()
  })
  .strict()

export const FloatingWorkspaceApps = z.record(z.string(), FloatingWorkspaceAppPreference)
