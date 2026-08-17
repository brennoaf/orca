// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WhatsAppFastResponseHostState } from '@/components/floating-terminal/comms-rail/use-whatsapp-fast-response-host'
import { ManagerHost } from './CommunicationsDockManagerHosts'

const host = vi.hoisted(() => ({
  state: { kind: 'loading', contentMode: 'loading' } as WhatsAppFastResponseHostState
}))

vi.mock('@/components/floating-terminal/comms-rail/use-whatsapp-fast-response-host', () => ({
  useWhatsAppFastResponseHost: () => host.state
}))

const session = {
  appId: 'whatsapp-web' as const,
  selectedConversationId: null,
  draft: ''
}

function DockHost({ target }: { target: HTMLDivElement }): React.JSX.Element {
  return (
    <ManagerHost
      appId="whatsapp-web"
      target={target}
      visible
      initialSessionState={session}
      onSessionStateChange={vi.fn()}
      onOpenApp={vi.fn()}
      whatsappHost={{
        identity: {
          target: 'dock',
          appId: 'whatsapp-web',
          generation: 1,
          revision: 1,
          tabId: 'all',
          activeLeafAppId: 'whatsapp-web'
        },
        visible: true
      }}
    />
  )
}

describe('CommunicationsDockManagerHosts', () => {
  let target: HTMLDivElement

  beforeEach(() => {
    host.state = { kind: 'loading', contentMode: 'loading' }
    target = document.createElement('div')
    document.body.append(target)
  })

  afterEach(cleanup)

  it('renders startup loading in the standard dock shell', () => {
    render(<DockHost target={target} />)
    expect(screen.getByRole('status').textContent).toContain('Loading WhatsApp Web')
    expect(screen.getByRole('button', { name: 'Open WhatsApp Web' })).toBeTruthy()
  })

  it('renders confirmed QR as a host-only white surface', () => {
    host.state = { kind: 'ready', contentMode: 'qr' }
    target.style.height = '180px'
    render(<DockHost target={target} />)

    const anchor = screen.getByLabelText(/WhatsApp Web/)
    expect(anchor.parentElement?.className).toContain('min-h-0')
    expect(target.querySelector('.min-h-80')).toBeNull()
    expect(target.firstElementChild?.className).toContain('bg-white')
    expect(screen.queryByRole('button')).toBeNull()
    expect(target.textContent).toBe('')
  })

  it('restores the footer for compact mode without replacing the host', () => {
    host.state = { kind: 'ready', contentMode: 'qr' }
    const view = render(<DockHost target={target} />)
    const anchor = screen.getByLabelText(/WhatsApp Web/)

    host.state = { kind: 'ready', contentMode: 'compact' }
    view.rerender(<DockHost target={target} />)

    expect(screen.getByLabelText(/WhatsApp Web/)).toBe(anchor)
    expect(screen.getByRole('button', { name: 'Open WhatsApp Web' })).toBeTruthy()
  })
})
