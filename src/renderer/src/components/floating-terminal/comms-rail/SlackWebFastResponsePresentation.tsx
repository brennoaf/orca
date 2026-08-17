import { useState, type ReactNode } from 'react'
import type { FloatingCommsSessionState } from '../../../../../shared/floating-comms-surface'
import { translate } from '@/i18n/i18n'
import type { CommunicationManagerPresentation } from './communication-managers'
import {
  useSlackFastResponseHost,
  type SlackFastResponseHostBinding
} from './use-slack-fast-response-host'

export function SlackWebFastResponsePresentation({
  initialSessionState,
  slackHost,
  children
}: {
  isPopoverOpen: boolean
  initialSessionState?: FloatingCommsSessionState
  onSessionStateChange?: (sessionState: FloatingCommsSessionState) => void
  slackHost?: SlackFastResponseHostBinding
  children: (presentation: CommunicationManagerPresentation) => ReactNode
}): React.JSX.Element {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const state = useSlackFastResponseHost({ binding: slackHost, element })
  const message =
    state.kind === 'loading'
      ? translate('communicationRail.slack.loading', 'Loading Slack…')
      : state.kind === 'ready' && state.contentMode === 'unsupported'
        ? translate(
            'communicationRail.slack.unsupported',
            'This Slack view is not available in fast response yet.'
          )
        : state.kind === 'crashed'
          ? translate('communicationRail.slack.crashed', 'Slack stopped unexpectedly.')
          : state.kind === 'error'
            ? translate('communicationRail.slack.error', 'Could not open Slack.')
            : null
  const unavailable = state.kind === 'crashed' || state.kind === 'error'
  return (
    <>
      {children({
        status:
          state.kind === 'loading'
            ? { kind: 'loading' }
            : unavailable
              ? { kind: 'unavailable', reason: state.kind }
              : { kind: 'idle' },
        tooltip: translate('communicationRail.slack.tooltip', 'Slack — fast response'),
        sessionState:
          initialSessionState?.appId === 'slack' ? initialSessionState : { appId: 'slack' },
        content: (
          <div className="relative h-full min-h-48 overflow-hidden bg-background">
            <div
              ref={setElement}
              className="absolute inset-0"
              aria-label={translate('communicationRail.slack.tooltip', 'Slack — fast response')}
            />
            {message ? (
              <div
                role={unavailable ? 'alert' : 'status'}
                className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground"
              >
                {message}
              </div>
            ) : null}
          </div>
        )
      })}
    </>
  )
}
