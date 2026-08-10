import { useCallback, useEffect, useState, type ReactNode } from 'react'
import type {
  FloatingCommsSessionState,
  FloatingCommsWhatsAppSessionState
} from '../../../../../shared/floating-comms-surface'
import { translate } from '@/i18n/i18n'
import { useOpenCommunicationSettings } from './communication-manager-actions'
import {
  LOCAL_Z_API_COMMUNICATION_MANAGER_CLIENT,
  useCommunicationManagerRuntime,
  useCommunicationManagerStatuses
} from './communication-manager-runtime'
import type { CommunicationManagerPresentation } from './communication-managers'
import {
  getZApiFastResponseStatusMessage,
  isZApiFastResponseReady,
  ZApiCommunicationManagerContent,
  ZApiSetupContent
} from './ZApiCommunicationManagerContent'

export { isZApiFastResponseReady } from './ZApiCommunicationManagerContent'

type PresentationProps = {
  isPopoverOpen: boolean
  initialSessionState?: FloatingCommsSessionState
  onSessionStateChange?: (sessionState: FloatingCommsSessionState) => void
  children: (presentation: CommunicationManagerPresentation) => ReactNode
}

export function ZApiCommunicationManagerPresentation({
  isPopoverOpen,
  initialSessionState,
  onSessionStateChange,
  children
}: PresentationProps): React.JSX.Element {
  const runtime = useCommunicationManagerRuntime()
  const { getStatus, loading, error, refresh } = useCommunicationManagerStatuses(
    runtime,
    isPopoverOpen
  )
  const integrationStatus = getStatus('z-api')
  const status = integrationStatus?.provider === 'z-api' ? integrationStatus : null
  const ready = isZApiFastResponseReady(status)
  const reason = getZApiFastResponseStatusMessage(status)
  const openSettings = useOpenCommunicationSettings()
  const client = runtime?.zApi ?? LOCAL_Z_API_COMMUNICATION_MANAGER_CLIENT
  const [sessionState, setSessionState] = useState<FloatingCommsWhatsAppSessionState>(() =>
    initialSessionState?.appId === 'whatsapp-web'
      ? initialSessionState
      : { appId: 'whatsapp-web', selectedConversationId: null, draft: '' }
  )
  useEffect(() => {
    if (initialSessionState?.appId === 'whatsapp-web') {
      setSessionState(initialSessionState)
    }
  }, [initialSessionState])
  const handleSessionStateChange = useCallback(
    (next: FloatingCommsSessionState): void => {
      if (next.appId !== 'whatsapp-web') {
        return
      }
      setSessionState(next)
      onSessionStateChange?.(next)
    },
    [onSessionStateChange]
  )
  if (loading && !status) {
    return (
      <>
        {children({
          status: { kind: 'loading' },
          tooltip: translate('communicationRail.zApi.tooltipLoading', 'WhatsApp — loading'),
          sessionState,
          content: (
            <ZApiSetupContent
              status={null}
              loading
              error={null}
              onConfigure={() => openSettings('z-api')}
              onRetry={refresh}
            />
          )
        })}
      </>
    )
  }
  if (error) {
    return (
      <>
        {children({
          status: { kind: 'unavailable', reason: error },
          tooltip: translate('communicationRail.zApi.tooltipUnavailable', 'WhatsApp — unavailable'),
          sessionState,
          content: (
            <ZApiSetupContent
              status={null}
              loading={false}
              error={error}
              onConfigure={() => openSettings('z-api')}
              onRetry={refresh}
            />
          )
        })}
      </>
    )
  }
  return (
    <>
      {children({
        status: ready ? { kind: 'idle' } : { kind: 'unavailable', reason },
        tooltip: ready
          ? translate('communicationRail.zApi.tooltipReady', 'WhatsApp — fast responses ready')
          : translate('communicationRail.zApi.tooltipUnavailable', 'WhatsApp — setup required'),
        sessionState,
        content: (
          <ZApiCommunicationManagerContent
            initialStatus={status}
            isPopoverOpen={isPopoverOpen}
            client={client}
            initialSessionState={sessionState}
            onSessionStateChange={handleSessionStateChange}
          />
        )
      })}
    </>
  )
}
