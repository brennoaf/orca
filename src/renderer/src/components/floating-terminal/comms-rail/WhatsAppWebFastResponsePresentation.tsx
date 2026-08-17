import { useState, type ReactNode } from 'react'
import type {
  FloatingCommsSessionState,
  FloatingCommsWhatsAppSessionState
} from '../../../../../shared/floating-comms-surface'
import { translate } from '@/i18n/i18n'
import type { CommunicationManagerPresentation } from './communication-managers'
import {
  useWhatsAppFastResponseHost,
  type WhatsAppFastResponseHostBinding
} from './use-whatsapp-fast-response-host'

type PresentationProps = {
  isPopoverOpen: boolean
  initialSessionState?: FloatingCommsSessionState
  onSessionStateChange?: (sessionState: FloatingCommsSessionState) => void
  whatsappHost?: WhatsAppFastResponseHostBinding
  children: (presentation: CommunicationManagerPresentation) => ReactNode
}

const EMPTY_SESSION: FloatingCommsWhatsAppSessionState = {
  appId: 'whatsapp-web',
  selectedConversationId: null,
  draft: ''
}

function FastResponseHost({
  setElement,
  state,
  minimal
}: {
  setElement: (element: HTMLDivElement | null) => void
  state: ReturnType<typeof useWhatsAppFastResponseHost>
  minimal: boolean
}): React.JSX.Element {
  const message =
    state.kind === 'inactive'
      ? translate(
          'communicationRail.whatsappWeb.fullOnly',
          'Compact WhatsApp Web is unavailable here. Open WhatsApp Web to continue.'
        )
      : state.kind === 'loading'
        ? translate('communicationRail.whatsappWeb.loading', 'Loading WhatsApp Web…')
        : state.kind === 'crashed'
          ? translate('communicationRail.whatsappWeb.crashed', 'WhatsApp Web stopped unexpectedly.')
          : state.kind === 'error'
            ? translate(
                'communicationRail.whatsappWeb.error',
                'Could not open compact WhatsApp Web.'
              )
            : null
  return (
    <div
      className={`relative h-full overflow-hidden ${minimal ? 'min-h-0 bg-white' : 'min-h-48 bg-background'}`}
    >
      <div
        ref={setElement}
        className="absolute inset-0"
        aria-label={translate(
          'communicationRail.whatsappWeb.tooltip',
          'WhatsApp Web — fast response'
        )}
      />
      {message && !minimal ? (
        <div
          role={state.kind === 'error' || state.kind === 'crashed' ? 'alert' : 'status'}
          className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground"
        >
          {message}
        </div>
      ) : null}
    </div>
  )
}

export function WhatsAppWebFastResponsePresentation({
  initialSessionState,
  whatsappHost,
  children
}: PresentationProps): React.JSX.Element {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const hostState = useWhatsAppFastResponseHost({ binding: whatsappHost, element })
  const sessionState =
    initialSessionState?.appId === 'whatsapp-web' ? initialSessionState : EMPTY_SESSION
  const unavailable = hostState.kind === 'crashed' || hostState.kind === 'error'
  const minimal = hostState.kind === 'ready' && hostState.contentMode === 'qr'
  const status =
    whatsappHost && hostState.kind === 'loading'
      ? ({ kind: 'loading' } as const)
      : unavailable
        ? ({ kind: 'unavailable', reason: hostState.kind } as const)
        : ({ kind: 'idle' } as const)
  return (
    <>
      {children({
        status,
        tooltip: translate('communicationRail.whatsappWeb.tooltip', 'WhatsApp Web — fast response'),
        sessionState,
        minimal,
        content: <FastResponseHost setElement={setElement} state={hostState} minimal={minimal} />
      })}
    </>
  )
}
