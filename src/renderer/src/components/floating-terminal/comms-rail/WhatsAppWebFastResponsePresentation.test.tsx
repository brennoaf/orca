// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WhatsAppFastResponseHostState } from './use-whatsapp-fast-response-host'
import { WhatsAppWebFastResponsePresentation } from './WhatsAppWebFastResponsePresentation'

const host = vi.hoisted(() => ({ state: { kind: 'loading' } as WhatsAppFastResponseHostState }))

vi.mock('./use-whatsapp-fast-response-host', () => ({
  useWhatsAppFastResponseHost: () => host.state
}))

const binding = {
  identity: {
    target: 'attached' as const,
    appId: 'whatsapp-web' as const,
    requestId: 1,
    surfaceId: 2,
    mode: 'attached-native' as const
  },
  visible: true
}

describe('WhatsAppWebFastResponsePresentation', () => {
  beforeEach(() => {
    host.state = { kind: 'loading' }
  })

  it('renders only the native body anchor and explicit loading state', () => {
    render(
      <WhatsAppWebFastResponsePresentation isPopoverOpen whatsappHost={binding}>
        {(presentation) => <>{presentation.content}</>}
      </WhatsAppWebFastResponsePresentation>
    )
    expect(screen.getByLabelText(/WhatsApp Web/)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Loading WhatsApp Web')
    expect(document.body.textContent).not.toMatch(/conversation|composer/i)
  })

  it('reports native guest crashes without inventing QR state', () => {
    host.state = { kind: 'crashed', recoverable: false }
    render(
      <WhatsAppWebFastResponsePresentation isPopoverOpen whatsappHost={binding}>
        {(presentation) => <>{presentation.content}</>}
      </WhatsAppWebFastResponsePresentation>
    )
    expect(screen.getByRole('alert').textContent).toContain('stopped unexpectedly')
    expect(document.body.textContent).not.toMatch(/scan|qr/i)
  })
})
