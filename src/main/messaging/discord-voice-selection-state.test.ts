import { describe, expect, it } from 'vitest'
import { DiscordVoiceSelectionStateMachine } from './discord-voice-selection-state'

describe('DiscordVoiceSelectionStateMachine', () => {
  it.each([
    [
      'success',
      (state: DiscordVoiceSelectionStateMachine, requestId: number) => state.succeed(requestId),
      'succeeded'
    ],
    [
      'failure',
      (state: DiscordVoiceSelectionStateMachine, requestId: number) => state.fail(requestId),
      'failed'
    ]
  ] as const)('settles the current request on %s', (_label, settle, kind) => {
    const state = new DiscordVoiceSelectionStateMachine()
    const requestId = state.begin('12345678901234567')

    expect(settle(state, requestId)).toBe(true)
    expect(state.snapshot()).toMatchObject({ kind, requestId, revision: requestId })
  })

  it('ignores stale completion after a newer request starts', () => {
    const state = new DiscordVoiceSelectionStateMachine()
    const staleRequestId = state.begin('12345678901234567')
    const currentRequestId = state.begin('22345678901234567')

    expect(state.succeed(staleRequestId)).toBe(false)
    expect(state.fail(staleRequestId)).toBe(false)
    expect(state.snapshot()).toMatchObject({
      kind: 'pending',
      requestId: currentRequestId,
      channelId: '22345678901234567'
    })
  })

  it('invalidates pending completion when reset', () => {
    const state = new DiscordVoiceSelectionStateMachine()
    const requestId = state.begin('12345678901234567')

    state.reset()

    expect(state.fail(requestId)).toBe(false)
    expect(state.snapshot()).toMatchObject({ kind: 'idle', revision: requestId + 1 })
  })

  it('records an intercepted request that became stale as a real failure', () => {
    const state = new DiscordVoiceSelectionStateMachine()

    state.recordFailure('12345678901234567')

    expect(state.snapshot()).toMatchObject({
      kind: 'failed',
      channelId: '12345678901234567',
      errorCode: 'selection_failed'
    })
  })
})
