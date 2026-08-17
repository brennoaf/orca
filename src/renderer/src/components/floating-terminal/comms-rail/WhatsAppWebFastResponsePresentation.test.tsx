// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CommunicationManagerSurfaceContent } from './CommunicationManagerSurfaceContent'
import type { WhatsAppFastResponseHostState } from './use-whatsapp-fast-response-host'
import { WhatsAppWebFastResponsePresentation } from './WhatsAppWebFastResponsePresentation'

const host = vi.hoisted(() => ({
  state: { kind: 'loading', contentMode: 'loading' } as WhatsAppFastResponseHostState
}))

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

const app = {
  id: 'whatsapp-web' as const,
  categoryId: 'communications' as const,
  label: 'WhatsApp Web',
  url: 'https://web.whatsapp.com',
  userAgentMode: 'clean' as const
}

function Surface(): React.JSX.Element {
  return (
    <TooltipProvider>
      <WhatsAppWebFastResponsePresentation isPopoverOpen whatsappHost={binding}>
        {(presentation) => (
          <CommunicationManagerSurfaceContent
            app={app}
            content={presentation.content}
            minimal={presentation.minimal}
            onOpenApp={vi.fn()}
            onToggleDetached={vi.fn()}
          />
        )}
      </WhatsAppWebFastResponsePresentation>
    </TooltipProvider>
  )
}

describe('WhatsAppWebFastResponsePresentation', () => {
  beforeEach(() => {
    host.state = { kind: 'loading', contentMode: 'loading' }
  })

  afterEach(cleanup)

  it('keeps startup loading explicit inside the standard shell', () => {
    render(<Surface />)
    const hostElement = screen.getByLabelText(/WhatsApp Web/).parentElement
    expect(hostElement?.className).toContain('min-h-48')
    expect(hostElement?.className).not.toContain('min-h-0')
    expect(screen.getByRole('status').textContent).toContain('Loading WhatsApp Web')
    expect(screen.getByRole('button', { name: 'Detach overlay' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open WhatsApp Web' })).toBeTruthy()
  })

  it('renders confirmed QR with only a square native host', () => {
    host.state = { kind: 'ready', contentMode: 'qr' }
    render(<Surface />)
    const anchor = screen.getByLabelText(/WhatsApp Web/)
    expect(anchor.parentElement?.className).toContain('min-h-0')
    expect(anchor.parentElement?.className).not.toContain('min-h-80')
    expect(anchor.parentElement?.className).toContain('bg-white')
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    expect(document.body.textContent).toBe('')
  })

  it('restores the complete shell for compact content', () => {
    host.state = { kind: 'ready', contentMode: 'compact' }
    render(<Surface />)
    const hostElement = screen.getByLabelText(/WhatsApp Web/).parentElement
    expect(hostElement?.className).toContain('min-h-48')
    expect(hostElement?.className).not.toContain('min-h-0')
    expect(screen.getByRole('button', { name: 'Detach overlay' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open WhatsApp Web' })).toBeTruthy()
  })

  it('keeps the standard shell and error visible after a native guest crash', () => {
    host.state = { kind: 'crashed', recoverable: false }
    render(<Surface />)
    expect(screen.getByRole('alert').textContent).toContain('stopped unexpectedly')
    expect(screen.getByRole('button', { name: 'Open WhatsApp Web' })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/scan|qr/i)
  })

  it('preserves the native host while transitioning from qr to compact', () => {
    host.state = { kind: 'ready', contentMode: 'qr' }
    const view = render(<Surface />)
    const anchor = screen.getByLabelText(/WhatsApp Web/)

    host.state = { kind: 'ready', contentMode: 'compact' }
    view.rerender(<Surface />)

    expect(screen.getByLabelText(/WhatsApp Web/)).toBe(anchor)
    expect(screen.getByRole('button', { name: 'Open WhatsApp Web' })).toBeTruthy()
  })
})
