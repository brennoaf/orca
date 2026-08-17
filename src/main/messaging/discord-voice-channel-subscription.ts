import type { DiscordIpcConnection, DiscordRpcEvent } from './discord-ipc-connection'
import { readString } from './discord-ipc-connection'
import type { DiscordVoiceChannelState } from './discord-voice-channel-state'

const CHANNEL_EVENTS = [
  'VOICE_STATE_CREATE',
  'VOICE_STATE_UPDATE',
  'VOICE_STATE_DELETE',
  'SPEAKING_START',
  'SPEAKING_STOP'
]

export class DiscordVoiceChannelSubscription {
  private subscribedChannelId: string | null = null
  private bufferedEvents: DiscordRpcEvent[] | null = null
  private chain: Promise<void> = Promise.resolve()
  private generation = 0

  constructor(
    private readonly channel: DiscordVoiceChannelState,
    private readonly getConnection: () => DiscordIpcConnection | null,
    private readonly onChannelSettled: () => void
  ) {}

  reset(): void {
    this.subscribedChannelId = null
    this.bufferedEvents = null
  }

  handleEvent(event: DiscordRpcEvent): void {
    if (this.bufferedEvents) {
      this.bufferedEvents.push(event)
      return
    }
    this.applyEvent(event)
    this.onChannelSettled()
  }

  switchTo(channelId: string | null): Promise<void> {
    const generation = (this.generation += 1)
    const run = this.chain.then(() =>
      generation === this.generation ? this.applySelectedChannel(channelId) : undefined
    )
    this.chain = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  private applyEvent(event: DiscordRpcEvent): void {
    if (event.event === 'VOICE_STATE_CREATE' || event.event === 'VOICE_STATE_UPDATE') {
      this.channel.upsertMember(event.data)
      return
    }
    if (event.event === 'VOICE_STATE_DELETE') {
      this.channel.removeMember(event.data)
      return
    }
    if (event.event === 'SPEAKING_START' || event.event === 'SPEAKING_STOP') {
      const userId = readString(event.data, 'user_id')
      if (userId) {
        this.channel.setSpeaking(userId, event.event === 'SPEAKING_START')
      }
    }
  }

  private async applySelectedChannel(channelId: string | null): Promise<void> {
    if (channelId === this.subscribedChannelId) {
      return
    }
    const connection = this.getConnection()
    if (!connection) {
      return
    }
    await this.unsubscribeChannelEvents(connection)
    if (!channelId) {
      this.channel.leave()
      this.onChannelSettled()
      return
    }
    const buffered: DiscordRpcEvent[] = []
    this.bufferedEvents = buffered
    try {
      for (const event of CHANNEL_EVENTS) {
        await connection.subscribe(event, { channel_id: channelId })
      }
      this.subscribedChannelId = channelId
      const channel = await connection.request('GET_CHANNEL', { channel_id: channelId })
      if (this.subscribedChannelId !== channelId) {
        return
      }
      this.channel.enter(channelId, readString(channel, 'name'))
      this.channel.replaceMembers(channel.voice_states)
      for (const event of buffered) {
        this.applyEvent(event)
      }
    } catch (error) {
      this.channel.enter(channelId, null)
      throw error
    } finally {
      this.bufferedEvents = null
      this.onChannelSettled()
    }
  }

  private async unsubscribeChannelEvents(connection: DiscordIpcConnection): Promise<void> {
    const channelId = this.subscribedChannelId
    if (!channelId) {
      return
    }
    this.subscribedChannelId = null
    for (const event of CHANNEL_EVENTS) {
      await connection.unsubscribe(event, { channel_id: channelId }).catch(() => undefined)
    }
  }
}
