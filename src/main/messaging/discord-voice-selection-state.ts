import type { DiscordVoiceSelectionState } from '../../shared/discord-voice'

const IDLE_SELECTION: DiscordVoiceSelectionState = {
  kind: 'idle',
  revision: 0,
  requestId: 0,
  channelId: null,
  errorCode: null
}

export class DiscordVoiceSelectionStateMachine {
  private state: DiscordVoiceSelectionState = IDLE_SELECTION

  snapshot(): DiscordVoiceSelectionState {
    return this.state
  }

  begin(channelId: string): number {
    const requestId = this.state.revision + 1
    this.state = {
      kind: 'pending',
      revision: requestId,
      requestId,
      channelId,
      errorCode: null
    }
    return requestId
  }

  succeed(requestId: number): boolean {
    if (!this.isPending(requestId)) {
      return false
    }
    this.state = { ...this.state, kind: 'succeeded' }
    return true
  }

  fail(requestId: number): boolean {
    if (!this.isPending(requestId)) {
      return false
    }
    this.state = { ...this.state, kind: 'failed', errorCode: 'selection_failed' }
    return true
  }

  failPending(): boolean {
    return this.state.kind === 'pending' && this.fail(this.state.requestId)
  }

  recordFailure(channelId: string): void {
    this.fail(this.begin(channelId))
  }

  reset(): void {
    const revision = this.state.revision + 1
    this.state = { ...IDLE_SELECTION, revision, requestId: revision }
  }

  isPending(requestId: number): boolean {
    return this.state.kind === 'pending' && this.state.requestId === requestId
  }
}
