import type { DiscordWebFastResponseContentMode } from '../../shared/discord-web-fast-response'

export function discordWebContentModeForUrl(value: string): DiscordWebFastResponseContentMode {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'discord.com') {
      return 'unsupported'
    }
    if (url.pathname === '/login' || url.pathname === '/register') {
      return 'login'
    }
    if (url.pathname === '/app' || url.pathname.startsWith('/channels/')) {
      return 'ready'
    }
    return 'unsupported'
  } catch {
    return 'unsupported'
  }
}
