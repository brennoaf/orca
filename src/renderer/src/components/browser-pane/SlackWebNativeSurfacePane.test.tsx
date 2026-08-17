// @vitest-environment happy-dom
import { act, StrictMode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usesSlackWebNativeSurface, SlackWebNativeSurfacePane } from './SlackWebNativeSurfacePane'

const api = {
  attach: vi.fn(() => Promise.resolve({})),
  hide: vi.fn(() => Promise.resolve({})),
  registerBrowserSurface: vi.fn(() =>
    Promise.resolve({ registrationToken: '5cf78e54-a9a8-4ef1-a817-c72ddb837465' })
  ),
  unregisterBrowserSurface: vi.fn(() => Promise.resolve()),
  updateBounds: vi.fn(() => Promise.resolve({}))
}

const browserTab = {
  id: 'browser-tab',
  worktreeId: 'floating',
  url: '',
  title: '',
  loading: false,
  faviconUrl: null,
  canGoBack: false,
  canGoForward: false,
  loadError: null,
  createdAt: 1
}

const browserPage = {
  id: 'browser-page',
  workspaceId: 'browser-tab',
  worktreeId: 'floating',
  url: '',
  title: '',
  loading: false,
  faviconUrl: null,
  canGoBack: false,
  canGoForward: false,
  loadError: null,
  createdAt: 1
}

function surface({
  isActive = true,
  inputLocked = false,
  page = browserPage
}: {
  isActive?: boolean
  inputLocked?: boolean
  page?: typeof browserPage
} = {}): React.JSX.Element {
  return (
    <SlackWebNativeSurfacePane
      browserTab={browserTab}
      browserPage={page}
      isActive={isActive}
      inputLocked={inputLocked}
    />
  )
}

describe('SlackWebNativeSurfacePane', () => {
  let resize: (() => void) | null

  beforeEach(() => {
    vi.clearAllMocks()
    resize = null
    api.attach.mockResolvedValue({})
    api.hide.mockResolvedValue({})
    api.registerBrowserSurface.mockResolvedValue({
      registrationToken: '5cf78e54-a9a8-4ef1-a817-c72ddb837465'
    })
    api.unregisterBrowserSurface.mockResolvedValue()
    api.updateBounds.mockResolvedValue({})
    Object.assign(window, {
      api: { ui: { getZoomLevel: vi.fn(() => 0) }, slackFastResponse: api }
    })
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
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  it('selects the native surface only for the Slack workspace app', () => {
    expect(usesSlackWebNativeSurface({ floatingWorkspaceAppId: 'slack' })).toBe(true)
    expect(usesSlackWebNativeSurface({ floatingWorkspaceAppId: 'whatsapp-web' })).toBe(false)
    expect(usesSlackWebNativeSurface({})).toBe(false)
  })

  it('registers, attaches and unregisters the full Slack surface without a webview', async () => {
    const view = render(surface())
    const host = view.container.firstElementChild as HTMLDivElement
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 18, 300, 240))
    await act(async () => undefined)
    await act(async () => undefined)

    expect(api.registerBrowserSurface).toHaveBeenCalledWith({
      appId: 'slack',
      browserTabId: 'browser-tab',
      browserPageId: 'browser-page',
      workspaceId: 'browser-tab',
      revision: 1
    })
    expect(api.attach).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'browser',
        browserTabId: 'browser-tab',
        browserPageId: 'browser-page',
        rectCss: { x: 12, y: 18, width: 300, height: 240 }
      })
    )
    expect(view.container.querySelector('webview')).toBeNull()
    view.unmount()
    await act(async () => undefined)
    expect(api.unregisterBrowserSurface).toHaveBeenCalledOnce()
  })

  it('publishes the latest bounds after a resize during a pending attach', async () => {
    let resolveAttach: (() => void) | null = null
    api.attach.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAttach = () => resolve({})
        })
    )
    const view = render(surface())
    const host = view.container.firstElementChild as HTMLDivElement
    let rect = new DOMRect(12, 18, 300, 240)
    vi.spyOn(host, 'getBoundingClientRect').mockImplementation(() => rect)
    await act(async () => undefined)
    await act(async () => undefined)

    rect = new DOMRect(12, 18, 420, 320)
    act(() => resize?.())
    expect(api.updateBounds).not.toHaveBeenCalled()
    await act(async () => resolveAttach?.())
    await act(async () => undefined)

    expect(api.updateBounds).toHaveBeenCalledWith(
      expect.objectContaining({ rectCss: { x: 12, y: 18, width: 420, height: 320 } })
    )
    view.unmount()
  })

  it.each([
    ['inactive', false, false],
    ['input locked', true, true]
  ])('releases a pending attach after becoming %s', async (_label, isActive, inputLocked) => {
    let resolveAttach: (() => void) | null = null
    api.attach.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAttach = () => resolve({})
        })
    )
    const view = render(surface())
    const host = view.container.firstElementChild as HTMLDivElement
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 18, 300, 240))
    await act(async () => undefined)
    await act(async () => undefined)

    view.rerender(surface({ isActive, inputLocked }))
    await act(async () => undefined)
    const staleIdentity = expect.objectContaining({
      target: 'browser',
      registrationToken: '5cf78e54-a9a8-4ef1-a817-c72ddb837465'
    })
    expect(api.unregisterBrowserSurface).toHaveBeenCalledWith(staleIdentity)

    await act(async () => resolveAttach?.())
    expect(api.hide).toHaveBeenLastCalledWith(staleIdentity)
    view.unmount()
  })

  it('does not register while inactive or input locked', async () => {
    const view = render(surface({ isActive: false }))
    await act(async () => undefined)
    expect(api.registerBrowserSurface).not.toHaveBeenCalled()

    view.rerender(surface({ isActive: true, inputLocked: true }))
    await act(async () => undefined)
    expect(api.registerBrowserSurface).not.toHaveBeenCalled()
    view.unmount()
  })

  it('registers only the active page across a workspace with many pages', async () => {
    const pages = Array.from({ length: 12 }, (_, index) => ({
      ...browserPage,
      id: `browser-page-${index}`
    }))
    const view = render(
      <>
        {pages.map((page) => (
          <SlackWebNativeSurfacePane
            key={page.id}
            browserTab={browserTab}
            browserPage={page}
            isActive={page.id === 'browser-page-8'}
            inputLocked={false}
          />
        ))}
      </>
    )
    await act(async () => undefined)

    expect(api.registerBrowserSurface).toHaveBeenCalledOnce()
    expect(api.registerBrowserSurface).toHaveBeenCalledWith(
      expect.objectContaining({ browserPageId: 'browser-page-8' })
    )
    view.unmount()
  })

  it('does not accumulate registrations in StrictMode', async () => {
    const view = render(<StrictMode>{surface()}</StrictMode>)
    await act(async () => undefined)
    await act(async () => undefined)

    expect(api.registerBrowserSurface).toHaveBeenCalledOnce()
    view.unmount()
  })

  it('unregisters the prior page before registering the next active page', async () => {
    const first = render(surface())
    const host = first.container.firstElementChild as HTMLDivElement
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 18, 300, 240))
    await act(async () => undefined)
    await act(async () => undefined)

    first.rerender(surface({ page: { ...browserPage, id: 'browser-page-next' } }))
    await act(async () => undefined)
    await act(async () => undefined)

    expect(api.unregisterBrowserSurface).toHaveBeenCalledWith(
      expect.objectContaining({ browserPageId: 'browser-page' })
    )
    expect(api.registerBrowserSurface).toHaveBeenLastCalledWith(
      expect.objectContaining({ browserPageId: 'browser-page-next' })
    )
    expect(api.unregisterBrowserSurface.mock.invocationCallOrder[0]).toBeLessThan(
      api.registerBrowserSurface.mock.invocationCallOrder[1]
    )
    first.unmount()
  })

  it('unregisters the locked generation before unlock and never reattaches its token', async () => {
    api.registerBrowserSurface
      .mockResolvedValueOnce({ registrationToken: '11111111-1111-4111-8111-111111111111' })
      .mockResolvedValueOnce({ registrationToken: '22222222-2222-4222-8222-222222222222' })
    const view = render(surface())
    const host = view.container.firstElementChild as HTMLDivElement
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 18, 300, 240))
    await act(async () => undefined)
    await act(async () => undefined)
    api.attach.mockClear()

    view.rerender(surface({ inputLocked: true }))
    await act(async () => undefined)
    view.rerender(surface())
    await act(async () => undefined)
    await act(async () => undefined)

    expect(api.unregisterBrowserSurface).toHaveBeenCalledWith(
      expect.objectContaining({ registrationToken: '11111111-1111-4111-8111-111111111111' })
    )
    expect(api.registerBrowserSurface).toHaveBeenCalledTimes(2)
    expect(api.attach).toHaveBeenCalledWith(
      expect.objectContaining({ registrationToken: '22222222-2222-4222-8222-222222222222' })
    )
    expect(api.attach).not.toHaveBeenCalledWith(
      expect.objectContaining({ registrationToken: '11111111-1111-4111-8111-111111111111' })
    )
    expect(api.unregisterBrowserSurface.mock.invocationCallOrder[0]).toBeLessThan(
      api.registerBrowserSurface.mock.invocationCallOrder[1]
    )
    view.unmount()
  })

  it('releases a pending attach on unmount and fences its late resolution', async () => {
    let resolveAttach: (() => void) | null = null
    api.attach.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAttach = () => resolve({})
        })
    )
    const view = render(surface())
    const host = view.container.firstElementChild as HTMLDivElement
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 18, 300, 240))
    await act(async () => undefined)
    await act(async () => undefined)
    view.unmount()

    await act(async () => undefined)
    expect(api.unregisterBrowserSurface).toHaveBeenCalledOnce()
    await act(async () => resolveAttach?.())
    expect(api.hide).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'browser',
        registrationToken: '5cf78e54-a9a8-4ef1-a817-c72ddb837465'
      })
    )
  })

  it('shows an actionable retry when registration fails', async () => {
    api.registerBrowserSurface.mockRejectedValueOnce(new Error('failed'))
    const view = render(surface())
    await act(async () => undefined)

    expect(screen.getByRole('alert').textContent).toContain('Could not open Slack.')
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Retry' })))
    await act(async () => undefined)
    expect(api.registerBrowserSurface).toHaveBeenCalledTimes(2)
    view.unmount()
  })
})
