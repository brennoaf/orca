import { z } from 'zod'

export const NativeThemeSnapshotSchema = z
  .object({
    shouldUseDarkColors: z.boolean(),
    themeSource: z.enum(['system', 'light', 'dark'])
  })
  .strict()

export type NativeThemeSnapshot = z.infer<typeof NativeThemeSnapshotSchema>
