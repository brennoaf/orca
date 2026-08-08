import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appOnce: vi.fn(),
  start: vi.fn(),
  stop: vi.fn()
}))

vi.mock('electron', () => ({ app: { once: mocks.appOnce } }))
vi.mock('./discord-voice-service', () => ({
  startDiscordVoiceService: mocks.start,
  stopDiscordVoiceService: mocks.stop
}))

import { startDiscordVoiceAppLifecycle } from './discord-voice-app-lifecycle'

describe('startDiscordVoiceAppLifecycle', () => {
  it('starts once and stops during app teardown', () => {
    startDiscordVoiceAppLifecycle()
    startDiscordVoiceAppLifecycle()

    expect(mocks.start).toHaveBeenCalledTimes(1)
    expect(mocks.appOnce).toHaveBeenCalledWith('will-quit', mocks.stop)
    const teardown = mocks.appOnce.mock.calls[0]?.[1] as (() => void) | undefined
    teardown?.()
    expect(mocks.stop).toHaveBeenCalledTimes(1)
  })
})
