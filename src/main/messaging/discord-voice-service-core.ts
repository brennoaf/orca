import { DiscordIpcConnection, readString, type DiscordRpcEvent } from './discord-ipc-connection'
import { DiscordVoiceChannelState } from './discord-voice-channel-state'
import { DiscordVoiceChannelSubscription } from './discord-voice-channel-subscription'
import { authenticateDiscordRpc, DiscordVoiceAuthError } from './discord-voice-authentication'
import {
  getDiscordVoiceCredentialStatus,
  readDiscordVoiceCredentials
} from './discord-voice-credential-store'
import type { DiscordVoiceConnectionState, DiscordVoiceSnapshot } from '../../shared/discord-voice'
import { DiscordVoiceSelectionStateMachine } from './discord-voice-selection-state'
import {
  publishDiscordVoiceCallState,
  publishDiscordVoiceSnapshot
} from './discord-voice-publication'

const RECONNECT_BASE_MS = 5_000
const RECONNECT_MAX_MS = 60_000

export type DiscordVoiceConnectionFailureKind = 'authentication' | 'provider_unavailable'

export class DiscordVoiceService {
  private connection: DiscordIpcConnection | null = null
  private connectionState: DiscordVoiceConnectionState = 'disconnected'
  private lastError: string | null = null
  private connectionFailureKind: DiscordVoiceConnectionFailureKind | null = null
  private selfUserId: string | null = null
  private readonly channel = new DiscordVoiceChannelState()
  private readonly channelSubscription = new DiscordVoiceChannelSubscription(
    this.channel,
    () => this.connection,
    () => this.syncChannelState()
  )
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private running = false
  private connecting = false
  private connectGeneration = 0
  private inCall = false
  private readonly selection = new DiscordVoiceSelectionStateMachine()

  start(): void {
    if (this.running) {
      return
    }
    this.running = true
    this.publishSnapshot()
    void this.connect()
  }

  stop(): void {
    this.running = false
    this.clearReconnectTimer()
    this.abandonConnection()
    this.lastError = null
    this.connectionFailureKind = null
    this.selection.reset()
    this.publishSnapshot()
  }

  reconnectNow(): void {
    this.clearReconnectTimer()
    this.abandonConnection()
    this.reconnectAttempt = 0
    this.lastError = null
    this.connectionFailureKind = null
    this.running = true
    this.publishSnapshot()
    void this.connect()
  }

  isInCall(): boolean {
    return this.inCall
  }

  getConnectionFailureKind(): DiscordVoiceConnectionFailureKind | null {
    return this.connectionFailureKind
  }

  getSnapshot(): DiscordVoiceSnapshot {
    return {
      connection: this.connectionState,
      channelId: this.channel.channelId,
      channelName: this.channel.channelName,
      selfUserId: this.selfUserId,
      participants: this.channel.participants(),
      credentialsConfigured: getDiscordVoiceCredentialStatus().configured,
      lastError: this.lastError,
      selection: this.selection.snapshot()
    }
  }

  async setSelfMute(muted: boolean): Promise<void> {
    const data = await this.requireConnection().request('SET_VOICE_SETTINGS', { mute: muted })
    this.applyLocalVoiceSettings(data)
    this.publishSnapshot()
  }

  async setSelfDeaf(deafened: boolean): Promise<void> {
    const data = await this.requireConnection().request('SET_VOICE_SETTINGS', { deaf: deafened })
    this.applyLocalVoiceSettings(data)
    this.publishSnapshot()
  }

  async leaveCall(): Promise<void> {
    await this.requireConnection().request('SELECT_VOICE_CHANNEL', { channel_id: null })
  }

  async selectVoiceChannel(channelId: string): Promise<DiscordVoiceSnapshot> {
    const requestId = this.selection.begin(channelId)
    this.publishSnapshot()
    try {
      const connection = this.requireConnection()
      await connection.request('SELECT_VOICE_CHANNEL', { channel_id: channelId })
      const selected = await connection.request('GET_SELECTED_VOICE_CHANNEL')
      const selectedChannelId = readString(selected, 'id')
      if (selectedChannelId !== channelId) {
        throw new Error('Discord did not select the requested voice channel')
      }
      if (!this.selection.isPending(requestId)) {
        return this.getSnapshot()
      }
      await this.channelSubscription.switchTo(selectedChannelId)
      if (this.selection.succeed(requestId)) {
        this.publishSnapshot()
      }
      return this.getSnapshot()
    } catch (error) {
      if (this.selection.fail(requestId)) {
        this.publishSnapshot()
      }
      throw error
    }
  }

  recordSelectionFailure(channelId: string): void {
    this.selection.recordFailure(channelId)
    this.publishSnapshot()
  }

  private requireConnection(): DiscordIpcConnection {
    if (!this.connection || this.connectionState !== 'connected') {
      throw new Error('Discord RPC is not connected')
    }
    return this.connection
  }

  private applyLocalVoiceSettings(data: Record<string, unknown>): void {
    if (!this.selfUserId) {
      return
    }
    this.channel.applyLocalVoiceSettings(this.selfUserId, {
      ...(typeof data.mute === 'boolean' ? { selfMute: data.mute } : {}),
      ...(typeof data.deaf === 'boolean' ? { selfDeaf: data.deaf } : {})
    })
  }

  private async connect(): Promise<void> {
    if (this.connecting || this.connection || !this.running) {
      return
    }
    const credentials = readDiscordVoiceCredentials()
    if (!credentials) {
      this.connectionState = 'disconnected'
      this.publishSnapshot()
      return
    }
    const generation = this.connectGeneration
    this.connecting = true
    this.connectionState = 'connecting'
    this.publishSnapshot()
    try {
      const { connection } = await DiscordIpcConnection.open({
        clientId: credentials.clientId,
        onEvent: (event) => this.handleEvent(event),
        onUnexpectedClose: (reason) => this.handleUnexpectedClose(reason)
      })
      if (generation !== this.connectGeneration || !this.running) {
        connection.close()
        return
      }
      this.connection = connection
      this.selfUserId = await authenticateDiscordRpc(connection, credentials)
      this.publishSnapshot()
      await connection.subscribe('VOICE_CHANNEL_SELECT')
      const selected = await connection.request('GET_SELECTED_VOICE_CHANNEL')
      if (generation !== this.connectGeneration) {
        connection.close()
        return
      }
      if (!this.running) {
        this.stop()
        return
      }
      this.connectionState = 'connected'
      this.lastError = null
      this.connectionFailureKind = null
      this.reconnectAttempt = 0
      await this.channelSubscription.switchTo(readString(selected, 'id'))
      this.publishSnapshot()
    } catch (error) {
      if (generation === this.connectGeneration) {
        this.failConnection(error)
      }
    } finally {
      if (generation === this.connectGeneration) {
        this.connecting = false
      }
    }
  }

  private abandonConnection(): void {
    this.connectGeneration += 1
    this.connecting = false
    this.connection?.close()
    this.connection = null
    this.connectionState = 'disconnected'
    this.selfUserId = null
    this.leaveChannel()
  }

  private failConnection(error: unknown): void {
    this.connection?.close()
    this.connection = null
    this.connectionState = 'disconnected'
    this.selfUserId = null
    this.leaveChannel()
    this.lastError = error instanceof Error ? error.message : 'Discord RPC connection failed'
    if (this.selection.failPending()) {
      this.publishSnapshot()
    }
    if (error instanceof DiscordVoiceAuthError) {
      this.connectionFailureKind = 'authentication'
      this.publishSnapshot()
      console.error('[discord-voice] authorization failed; waiting for an explicit reconnect')
      return
    }
    this.connectionFailureKind = 'provider_unavailable'
    this.publishSnapshot()
    this.scheduleReconnect()
  }

  private handleUnexpectedClose(reason: string): void {
    this.connection = null
    this.connectionState = 'disconnected'
    this.selfUserId = null
    this.leaveChannel()
    this.lastError = reason
    this.connectionFailureKind = 'provider_unavailable'
    if (this.selection.failPending()) {
      this.publishSnapshot()
    }
    this.publishSnapshot()
    this.scheduleReconnect()
  }

  private leaveChannel(): void {
    this.channelSubscription.reset()
    this.channel.leave()
    this.syncChannelState()
  }

  private syncChannelState(): void {
    const inCall = this.channel.channelId !== null
    if (inCall !== this.inCall) {
      this.inCall = inCall
      publishDiscordVoiceCallState(inCall)
    }
    this.publishSnapshot()
  }

  private publishSnapshot(): void {
    publishDiscordVoiceSnapshot(this.getSnapshot())
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer) {
      return
    }
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.reconnectAttempt)
    this.reconnectAttempt += 1
    this.publishSnapshot()
    const timer = setTimeout(() => {
      this.reconnectTimer = null
      this.publishSnapshot()
      void this.connect()
    }, delay)
    timer.unref?.()
    this.reconnectTimer = timer
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private handleEvent(event: DiscordRpcEvent): void {
    if (event.event === 'VOICE_CHANNEL_SELECT') {
      void this.channelSubscription
        .switchTo(readString(event.data, 'channel_id'))
        .catch((error: unknown) =>
          console.error('[discord-voice] failed to follow the selected voice channel:', error)
        )
      return
    }
    this.channelSubscription.handleEvent(event)
  }
}
