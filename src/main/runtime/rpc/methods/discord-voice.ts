import { z } from 'zod'
import { defineMethod, type RpcContext, type RpcMethod } from '../core'
import {
  closeDiscordVoiceWindow,
  createOrFocusDiscordVoiceWindow,
  getDiscordVoiceOverlayCompact,
  getDiscordVoiceOverlayState,
  setDiscordVoiceOverlayCompact
} from '../../../window/discord-voice-window'
import {
  clearCommunicationIntegration,
  COMMUNICATION_INTEGRATION_REGISTRY,
  saveCommunicationIntegration
} from '../../../messaging/communication-integration-registry'
import {
  getDiscordVoiceSnapshot,
  leaveDiscordVoiceCall,
  reconnectDiscordVoiceService,
  setDiscordVoiceSelfDeaf,
  setDiscordVoiceSelfMute
} from '../../../messaging/discord-voice-service'

const SetSelfMute = z.object({ muted: z.boolean() })
const SetSelfDeaf = z.object({ deafened: z.boolean() })
const SetOverlayCompact = z.object({ compact: z.boolean() })
const SaveCredentials = z
  .object({
    clientId: z.string().min(1, 'Discord application ID is required'),
    clientSecret: z.string().min(1, 'Discord client secret is required')
  })
  .strict()

function assertLocalWindow(ctx: RpcContext): void {
  if (ctx.clientKind !== undefined) {
    throw new Error('Discord voice credentials are only available to local windows.')
  }
}

function legacyCredentialStatus(): { configured: boolean; clientId: string | null } {
  const status = COMMUNICATION_INTEGRATION_REGISTRY.discord.getStatus()
  return { configured: status.readiness.configured, clientId: status.clientId }
}

export const DISCORD_VOICE_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'discordVoice.getState',
    params: null,
    handler: () => getDiscordVoiceSnapshot()
  }),
  defineMethod({
    name: 'discordVoice.openOverlay',
    params: null,
    handler: () => {
      createOrFocusDiscordVoiceWindow()
      return getDiscordVoiceSnapshot()
    }
  }),
  defineMethod({
    name: 'discordVoice.getOverlayState',
    params: null,
    handler: () => getDiscordVoiceOverlayState()
  }),
  defineMethod({
    name: 'discordVoice.reconnect',
    params: null,
    handler: () => {
      reconnectDiscordVoiceService()
      return getDiscordVoiceSnapshot()
    }
  }),
  defineMethod({
    name: 'discordVoice.setSelfMute',
    params: SetSelfMute,
    handler: async (params) => {
      await setDiscordVoiceSelfMute(params.muted)
      return getDiscordVoiceSnapshot()
    }
  }),
  defineMethod({
    name: 'discordVoice.setSelfDeaf',
    params: SetSelfDeaf,
    handler: async (params) => {
      await setDiscordVoiceSelfDeaf(params.deafened)
      return getDiscordVoiceSnapshot()
    }
  }),
  defineMethod({
    name: 'discordVoice.leaveCall',
    params: null,
    handler: async () => {
      await leaveDiscordVoiceCall()
      return getDiscordVoiceSnapshot()
    }
  }),
  defineMethod({
    name: 'discordVoice.getCredentialStatus',
    params: null,
    handler: (_params, ctx) => {
      assertLocalWindow(ctx)
      return legacyCredentialStatus()
    }
  }),
  defineMethod({
    name: 'discordVoice.saveCredentials',
    params: SaveCredentials,
    handler: async (params, ctx) => {
      assertLocalWindow(ctx)
      const result = await saveCommunicationIntegration({
        provider: 'discord',
        clientId: params.clientId,
        clientSecret: { action: 'replace', value: params.clientSecret }
      })
      if (!result.ok) {
        throw new Error(result.error.message)
      }
      return legacyCredentialStatus()
    }
  }),
  defineMethod({
    name: 'discordVoice.clearCredentials',
    params: null,
    handler: async (_params, ctx) => {
      assertLocalWindow(ctx)
      const result = await clearCommunicationIntegration('discord')
      if (!result.ok) {
        throw new Error(result.error.message)
      }
      return legacyCredentialStatus()
    }
  }),
  defineMethod({
    name: 'discordVoice.closeOverlay',
    params: null,
    handler: () => {
      closeDiscordVoiceWindow()
      return getDiscordVoiceSnapshot()
    }
  }),
  defineMethod({
    name: 'discordVoice.getOverlayCompact',
    params: null,
    handler: () => ({ compact: getDiscordVoiceOverlayCompact() })
  }),
  defineMethod({
    name: 'discordVoice.setOverlayCompact',
    params: SetOverlayCompact,
    handler: (params) => ({ compact: setDiscordVoiceOverlayCompact(params.compact) })
  })
]
