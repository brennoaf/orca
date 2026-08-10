import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ZApiUnreadBadge } from './ZApiUnreadBadge'

describe('ZApiUnreadBadge', () => {
  it('caps the visible count while preserving the accessible total', () => {
    const html = renderToStaticMarkup(<ZApiUnreadBadge count={120} />)
    expect(html).toContain('99+')
    expect(html).toContain('120 unread WhatsApp messages')
  })

  it('does not render without attention', () => {
    expect(renderToStaticMarkup(<ZApiUnreadBadge count={0} />)).toBe('')
  })
})
