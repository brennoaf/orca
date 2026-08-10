import { describe, expect, it } from 'vitest'
import { buildNotificationOptions } from './notification-options'

describe('communication notification copy', () => {
  it('contains no message or contact preview', () => {
    expect(buildNotificationOptions({ source: 'communication-message' })).toEqual({
      title: 'New WhatsApp message',
      body: 'Open fast responses to view it.'
    })
  })
})
