import { describe, expect, it } from 'vitest'
import { discordWebContentModeForUrl } from './content-mode'

describe('discordWebContentModeForUrl', () => {
  it('classifies supported Discord Web routes without DOM guesses', () => {
    expect(discordWebContentModeForUrl('https://discord.com/login')).toBe('login')
    expect(discordWebContentModeForUrl('https://discord.com/register')).toBe('login')
    expect(discordWebContentModeForUrl('https://discord.com/app')).toBe('ready')
    expect(discordWebContentModeForUrl('https://discord.com/channels/@me')).toBe('ready')
  })

  it('keeps non-Discord and unknown routes unsupported', () => {
    expect(discordWebContentModeForUrl('https://example.com/channels/@me')).toBe('unsupported')
    expect(discordWebContentModeForUrl('https://discord.com/developers')).toBe('unsupported')
    expect(discordWebContentModeForUrl('invalid')).toBe('unsupported')
  })
})
