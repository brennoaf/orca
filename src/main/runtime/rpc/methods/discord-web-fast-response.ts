import { getDiscordWebFastResponseHost } from '../../../ipc/discord-web-fast-response'
import { defineMethod, type RpcContext, type RpcMethod } from '../core'

function assertLocalWindow(ctx: RpcContext): void {
  if (ctx.clientKind !== undefined) {
    throw new Error('Discord compact mode is only available locally.')
  }
}

export const DISCORD_WEB_FAST_RESPONSE_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'discordWebFastResponse.getCompactMode',
    params: null,
    handler: (_params, ctx) => {
      assertLocalWindow(ctx)
      const host = getDiscordWebFastResponseHost()
      return { mode: host.getCompactMode(), canClose: host.canCloseCompactHub() }
    }
  }),
  defineMethod({
    name: 'discordWebFastResponse.toggleCompactHub',
    params: null,
    handler: async (_params, ctx) => {
      assertLocalWindow(ctx)
      const host = getDiscordWebFastResponseHost()
      const state = await host.toggleCompactHub()
      return { mode: host.getCompactMode(), canClose: host.canCloseCompactHub(), state }
    }
  })
]
