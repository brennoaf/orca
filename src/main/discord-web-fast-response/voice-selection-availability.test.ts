import { describe, expect, it } from 'vitest'
import { isDiscordVoiceSelectionAvailable } from './voice-selection-availability'

describe('Discord voice selection availability', () => {
  it.each([
    ['disconnected', false],
    ['connecting', false],
    ['connected', true]
  ] as const)('maps %s to %s', (connection, available) => {
    expect(isDiscordVoiceSelectionAvailable({ connection })).toBe(available)
  })
})
