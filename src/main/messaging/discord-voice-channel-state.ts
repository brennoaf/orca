import { discordAvatarUrl, type DiscordVoiceParticipant } from '../../shared/discord-voice'
import { asRecord, readString } from './discord-ipc-connection'

type VoiceMember = {
  userId: string
  displayName: string
  avatarHash: string | null
  mute: boolean
  deaf: boolean
  selfMute: boolean
  selfDeaf: boolean
}

function readBoolean(source: Record<string, unknown> | null, key: string): boolean {
  return source?.[key] === true
}

function parseVoiceMember(raw: unknown): VoiceMember | null {
  const entry = asRecord(raw)
  const user = asRecord(entry?.user)
  const userId = user ? readString(user, 'id') : null
  if (!entry || !user || !userId) {
    return null
  }
  const voiceState = asRecord(entry.voice_state)
  return {
    userId,
    displayName:
      readString(entry, 'nick') ??
      readString(user, 'global_name') ??
      readString(user, 'username') ??
      userId,
    avatarHash: readString(user, 'avatar'),
    mute: readBoolean(voiceState, 'mute'),
    deaf: readBoolean(voiceState, 'deaf'),
    selfMute: readBoolean(voiceState, 'self_mute'),
    selfDeaf: readBoolean(voiceState, 'self_deaf')
  }
}

export class DiscordVoiceChannelState {
  private members = new Map<string, VoiceMember>()
  private readonly speaking = new Set<string>()
  private currentChannelId: string | null = null
  private currentChannelName: string | null = null

  get channelId(): string | null {
    return this.currentChannelId
  }

  get channelName(): string | null {
    return this.currentChannelName
  }

  enter(channelId: string, channelName: string | null): void {
    this.currentChannelId = channelId
    this.currentChannelName = channelName
    this.members = new Map()
    this.speaking.clear()
  }

  leave(): void {
    this.currentChannelId = null
    this.currentChannelName = null
    this.members = new Map()
    this.speaking.clear()
  }

  setChannelName(channelName: string | null): void {
    this.currentChannelName = channelName
  }

  replaceMembers(rawStates: unknown): void {
    const next = new Map<string, VoiceMember>()
    if (Array.isArray(rawStates)) {
      for (const raw of rawStates) {
        const member = parseVoiceMember(raw)
        if (member) {
          next.set(member.userId, member)
        }
      }
    }
    this.members = next
    for (const userId of this.speaking) {
      if (!next.has(userId)) {
        this.speaking.delete(userId)
      }
    }
  }

  upsertMember(raw: unknown): void {
    const member = parseVoiceMember(raw)
    if (member) {
      this.members.set(member.userId, member)
    }
  }

  removeMember(raw: unknown): void {
    const member = parseVoiceMember(raw)
    if (member) {
      this.members.delete(member.userId)
      this.speaking.delete(member.userId)
    }
  }

  setSpeaking(userId: string, speaking: boolean): void {
    if (speaking) {
      this.speaking.add(userId)
      return
    }
    this.speaking.delete(userId)
  }

  participants(): DiscordVoiceParticipant[] {
    return [...this.members.values()]
      .map((member) => ({
        userId: member.userId,
        displayName: member.displayName,
        avatarUrl: discordAvatarUrl(member.userId, member.avatarHash),
        mute: member.mute,
        deaf: member.deaf,
        selfMute: member.selfMute,
        selfDeaf: member.selfDeaf,
        speaking: this.speaking.has(member.userId) && !member.mute && !member.selfMute
      }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName))
  }

  applyLocalVoiceSettings(
    userId: string,
    settings: { selfMute?: boolean; selfDeaf?: boolean }
  ): void {
    const member = this.members.get(userId)
    if (!member) {
      return
    }
    this.members.set(userId, {
      ...member,
      selfMute: settings.selfMute ?? member.selfMute,
      selfDeaf: settings.selfDeaf ?? member.selfDeaf
    })
  }
}
