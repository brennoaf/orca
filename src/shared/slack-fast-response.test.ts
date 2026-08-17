import { describe, expect, it } from 'vitest'
import {
  SlackFastResponseAttachSchema,
  SlackFastResponseSnapshotSchema,
  SlackFastResponseStateSchema
} from './slack-fast-response'

describe('Slack fast response schemas', () => {
  it('accepts all lifecycle states and strict attached identity', () => {
    expect(
      ['loading', 'login', 'compact', 'unsupported', 'crashed', 'error'].every(
        (state) => SlackFastResponseStateSchema.safeParse(state).success
      )
    ).toBe(true)
    expect(
      SlackFastResponseAttachSchema.safeParse({
        target: 'attached',
        appId: 'slack',
        requestId: 1,
        surfaceId: 2,
        mode: 'attached-native',
        rectCss: { x: 0, y: 0, width: 320, height: 480 },
        rendererZoomFactor: 1
      }).success
    ).toBe(true)
  })

  it('rejects unknown snapshot fields', () => {
    expect(
      SlackFastResponseSnapshotSchema.safeParse({
        attached: false,
        contentMode: 'loading',
        crashed: false,
        loaded: false,
        visible: false,
        extra: true
      }).success
    ).toBe(false)
  })
})
