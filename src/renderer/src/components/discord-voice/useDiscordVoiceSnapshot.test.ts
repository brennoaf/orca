import { describe, expect, it } from 'vitest'
import {
  DISCORD_VOICE_ACTIVE_POLL_MS,
  DISCORD_VOICE_IDLE_POLL_MS
} from '../../../../shared/discord-voice'
import { getDiscordVoicePollInterval } from './useDiscordVoiceSnapshot'

describe('getDiscordVoicePollInterval', () => {
  it('polls at 150 ms only while an open surface is in a call', () => {
    expect(getDiscordVoicePollInterval(true, true)).toBe(DISCORD_VOICE_ACTIVE_POLL_MS)
    expect(getDiscordVoicePollInterval(true, false)).toBe(DISCORD_VOICE_IDLE_POLL_MS)
    expect(getDiscordVoicePollInterval(false, true)).toBe(DISCORD_VOICE_IDLE_POLL_MS)
  })
})
