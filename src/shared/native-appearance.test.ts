import { describe, expect, it } from 'vitest'
import { NativeThemeSnapshotSchema } from './native-appearance'

describe('NativeThemeSnapshotSchema', () => {
  it('accepts the authoritative native theme snapshot', () => {
    expect(
      NativeThemeSnapshotSchema.parse({ shouldUseDarkColors: true, themeSource: 'system' })
    ).toEqual({ shouldUseDarkColors: true, themeSource: 'system' })
  })

  it('rejects unknown theme sources and fields', () => {
    expect(
      NativeThemeSnapshotSchema.safeParse({ shouldUseDarkColors: false, themeSource: 'auto' })
        .success
    ).toBe(false)
    expect(
      NativeThemeSnapshotSchema.safeParse({
        shouldUseDarkColors: false,
        themeSource: 'light',
        extra: true
      }).success
    ).toBe(false)
  })
})
