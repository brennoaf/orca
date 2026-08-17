// @vitest-environment happy-dom

import { act } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CommunicationManagerSurfaceContent } from './CommunicationManagerSurfaceContent'
import { WhatsAppWebFastResponsePresentation } from './WhatsAppWebFastResponsePresentation'

const snapshot = {
  attention: { hasUnread: false },
  attached: true,
  contentMode: 'compact' as const,
  crashed: false,
  loaded: true,
  visible: true
}

const app = {
  id: 'whatsapp-web' as const,
  categoryId: 'communications' as const,
  label: 'WhatsApp Web',
  url: 'https://web.whatsapp.com',
  userAgentMode: 'clean' as const
}

const binding = {
  identity: {
    target: 'attached' as const,
    appId: 'whatsapp-web' as const,
    requestId: 1,
    surfaceId: 2,
    mode: 'attached-dom' as const
  },
  visible: true
}

describe('WhatsApp Web fast-response surface geometry', () => {
  const attach = vi.fn(() => Promise.resolve(snapshot))
  let resize: (() => void) | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    resize = null
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize = callback
        }

        observe(): void {}
        disconnect(): void {}
      }
    )
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe(): void {}
        disconnect(): void {}
      }
    )
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    Object.assign(window, {
      api: {
        ui: { getZoomLevel: vi.fn(() => 0) },
        whatsappFastResponse: {
          attach,
          updateBounds: vi.fn(() => Promise.resolve(snapshot)),
          show: vi.fn(() => Promise.resolve(snapshot)),
          hide: vi.fn(() => Promise.resolve({ ...snapshot, visible: false })),
          collapse: vi.fn(() => Promise.resolve({ ...snapshot, visible: false })),
          onStateChanged: vi.fn(() => vi.fn())
        }
      }
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('transfers a compact 420px surface height to the stable native host geometry', async () => {
    const view = render(
      <div style={{ height: 420, width: 320 }}>
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
      </div>
    )
    const anchor = screen.getByLabelText(/WhatsApp Web/) as HTMLDivElement
    const host = anchor.parentElement
    const surface = host?.parentElement?.parentElement
    if (!host || !surface) {
      throw new Error('WhatsApp host hierarchy is unavailable')
    }
    expect(surface.className).toContain('h-full')
    expect(host.className).toContain('h-full')
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(new DOMRect(1, 1, 320, 418))
    view.rerender(
      <div style={{ height: 420, width: 320 }}>
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
      </div>
    )
    await act(async () => {
      resize?.()
    })

    expect(screen.getByLabelText(/WhatsApp Web/)).toBe(anchor)
    expect(attach).toHaveBeenCalledWith(
      expect.objectContaining({ rectCss: { x: 1, y: 1, width: 320, height: 418 } })
    )
  })
})
