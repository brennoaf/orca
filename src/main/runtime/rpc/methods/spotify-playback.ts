import { z } from 'zod'
import { defineMethod, type RpcContext, type RpcMethod } from '../core'
import { getSpotifyPlaybackService } from '../../../spotify-playback/spotify-playback-service'

const Command = z
  .object({ sessionId: z.string().min(1), revision: z.number().int().min(0) })
  .strict()

function assertLocalWindow(ctx: RpcContext): void {
  if (ctx.clientKind !== undefined) {
    throw new Error('Spotify media control is only available locally.')
  }
}

export const SPOTIFY_PLAYBACK_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'spotifyPlayback.getState',
    params: null,
    handler: (_params, ctx) => {
      assertLocalWindow(ctx)
      return getSpotifyPlaybackService().getState()
    }
  }),
  defineMethod({
    name: 'spotifyPlayback.getAudioLevel',
    params: Command,
    handler: (params, ctx) => {
      assertLocalWindow(ctx)
      return getSpotifyPlaybackService().getAudioLevel(params)
    }
  }),
  defineMethod({
    name: 'spotifyPlayback.togglePlay',
    params: Command,
    handler: (params, ctx) => {
      assertLocalWindow(ctx)
      return getSpotifyPlaybackService().togglePlayPause(params)
    }
  }),
  defineMethod({
    name: 'spotifyPlayback.next',
    params: Command,
    handler: (params, ctx) => {
      assertLocalWindow(ctx)
      return getSpotifyPlaybackService().next(params)
    }
  }),
  defineMethod({
    name: 'spotifyPlayback.previous',
    params: Command,
    handler: (params, ctx) => {
      assertLocalWindow(ctx)
      return getSpotifyPlaybackService().previous(params)
    }
  })
]
