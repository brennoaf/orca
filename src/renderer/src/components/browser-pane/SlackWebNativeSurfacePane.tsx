import { useLayoutEffect, useRef, useState } from 'react'
import type { BrowserPage, BrowserWorkspace } from '../../../../shared/types'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'

type BrowserSurfaceIdentity = {
  target: 'browser'
  appId: 'slack'
  browserTabId: string
  browserPageId: string
  workspaceId: string
  registrationToken: string
  revision: number
}

const browserSurfaceOperations = new Map<string, Promise<void>>()

function enqueueBrowserSurfaceOperation(
  workspaceId: string,
  operation: () => Promise<void>
): Promise<void> {
  const previous = browserSurfaceOperations.get(workspaceId) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(operation)
  browserSurfaceOperations.set(workspaceId, next)
  void next
    .finally(() => {
      if (browserSurfaceOperations.get(workspaceId) === next) {
        browserSurfaceOperations.delete(workspaceId)
      }
    })
    .catch(() => undefined)
  return next
}

function rendererZoomFactor(): number {
  return Math.pow(1.2, window.api.ui.getZoomLevel())
}

export function usesSlackWebNativeSurface(
  browserTab: Pick<BrowserWorkspace, 'floatingWorkspaceAppId'>
): boolean {
  return browserTab.floatingWorkspaceAppId === 'slack'
}

function expectedOwnershipRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('slack_fast_response_stale') ||
    message.includes('slack_fast_response_sender_denied') ||
    message.includes('slack_fast_response_browser_registration_denied')
  )
}

function hideStaleBrowserSurface(identity: BrowserSurfaceIdentity): void {
  void window.api.slackFastResponse.hide(identity).catch((error: unknown) => {
    if (!expectedOwnershipRejection(error)) {
      console.error('[slack-fast-response] stale browser surface cleanup failed:', error)
    }
  })
}

function unregisterBrowserSurface(identity: BrowserSurfaceIdentity): Promise<void> {
  return window.api.slackFastResponse.unregisterBrowserSurface(identity).catch((error: unknown) => {
    if (!expectedOwnershipRejection(error)) {
      console.error('[slack-fast-response] browser surface unregister failed:', error)
    }
  })
}

export function SlackWebNativeSurfacePane({
  browserTab,
  browserPage,
  isActive,
  inputLocked
}: {
  browserTab: BrowserWorkspace
  browserPage: BrowserPage
  isActive: boolean
  inputLocked: boolean
}): React.JSX.Element {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const identityRef = useRef<BrowserSurfaceIdentity | null>(null)
  const revisionRef = useRef(0)
  const sequenceRef = useRef(0)
  const [identity, setIdentity] = useState<BrowserSurfaceIdentity | null>(null)
  const [error, setError] = useState(false)
  const [retryEpoch, setRetryEpoch] = useState(0)
  const visible = isActive && !inputLocked

  useLayoutEffect(() => {
    if (!visible) {
      return
    }
    const revision = ++revisionRef.current
    const registration = {
      appId: 'slack' as const,
      browserTabId: browserTab.id,
      browserPageId: browserPage.id,
      workspaceId: browserTab.id,
      revision
    }
    let disposed = false
    void enqueueBrowserSurfaceOperation(browserTab.id, async () => {
      if (disposed) {
        return
      }
      const { registrationToken } =
        await window.api.slackFastResponse.registerBrowserSurface(registration)
      if (disposed) {
        await unregisterBrowserSurface({
          target: 'browser',
          ...registration,
          registrationToken
        })
        return
      }
      const nextIdentity = { target: 'browser' as const, ...registration, registrationToken }
      identityRef.current = nextIdentity
      setIdentity(nextIdentity)
      setError(false)
    }).catch(() => {
      if (!disposed) {
        setError(true)
      }
    })
    return () => {
      disposed = true
      const identity = identityRef.current
      if (identity?.revision === revision) {
        identityRef.current = null
        setIdentity((current) => (current?.revision === revision ? null : current))
      }
      sequenceRef.current += 1
      if (!identity || identity.revision !== revision) {
        return
      }
      void enqueueBrowserSurfaceOperation(browserTab.id, () => unregisterBrowserSurface(identity))
    }
  }, [browserPage.id, browserTab.id, retryEpoch, visible])

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element || !identity || identity !== identityRef.current) {
      return
    }
    if (!visible) {
      hideStaleBrowserSurface(identity)
      return
    }
    const sequence = ++sequenceRef.current
    let frame: number | null = null
    let attached = false
    let dirty = false
    let inFlight = false
    let disposed = false
    const publish = (): void => {
      if (inFlight) {
        dirty = true
        return
      }
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        return
      }
      const request = {
        ...identity,
        rectCss: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        rendererZoomFactor: rendererZoomFactor()
      }
      const operation = attached
        ? window.api.slackFastResponse.updateBounds(request)
        : window.api.slackFastResponse.attach(request)
      inFlight = true
      void operation
        .then(() => {
          inFlight = false
          if (disposed || sequence !== sequenceRef.current) {
            hideStaleBrowserSurface(identity)
            return
          }
          attached = true
          setError(false)
          if (dirty) {
            dirty = false
            schedulePublish()
          }
        })
        .catch(() => {
          inFlight = false
          if (!disposed && sequence === sequenceRef.current) {
            setError(true)
          }
        })
    }
    const schedulePublish = (): void => {
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
      frame = requestAnimationFrame(() => {
        frame = null
        publish()
      })
    }
    publish()
    const observer = new ResizeObserver(schedulePublish)
    observer.observe(element)
    window.addEventListener('resize', schedulePublish)
    window.addEventListener('scroll', schedulePublish, true)
    window.visualViewport?.addEventListener('resize', schedulePublish)
    window.visualViewport?.addEventListener('scroll', schedulePublish)
    return () => {
      disposed = true
      sequenceRef.current += 1
      observer.disconnect()
      if (frame !== null) {
        cancelAnimationFrame(frame)
      }
      window.removeEventListener('resize', schedulePublish)
      window.removeEventListener('scroll', schedulePublish, true)
      window.visualViewport?.removeEventListener('resize', schedulePublish)
      window.visualViewport?.removeEventListener('scroll', schedulePublish)
      hideStaleBrowserSurface(identity)
    }
  }, [identity, visible])

  return (
    <div ref={elementRef} className="relative h-full min-h-0 flex-1 overflow-hidden bg-white">
      {inputLocked ? <div className="absolute inset-0 z-10" /> : null}
      {error ? (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background px-4 text-center"
          role="alert"
        >
          <p className="text-sm text-muted-foreground">
            {translate('communicationRail.slack.browserError', 'Could not open Slack.')}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRetryEpoch((value) => value + 1)}
          >
            {translate('communicationRail.slack.retry', 'Retry')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
