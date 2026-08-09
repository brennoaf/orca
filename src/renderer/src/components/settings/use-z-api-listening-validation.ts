import { useEffect, useRef, useState } from 'react'
import type {
  ZApiCommunicationIntegrationStatus,
  ZApiListeningValidationSnapshot
} from '../../../../shared/communication-integrations'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { applyCommunicationIntegrationStatus } from './use-communication-integration-statuses'
import { NOT_STARTED_Z_API_LISTENING_VALIDATION } from './ZApiWebhookVerificationStep'

const LOCAL_TARGET = { kind: 'local' } as const
const POLL_INTERVAL_MS = 1_000

export function useZApiListeningValidation(
  status: ZApiCommunicationIntegrationStatus | null,
  enabled: boolean
): {
  validation: ZApiListeningValidationSnapshot
  error: string | null
} {
  const source = status?.listeningValidation ?? NOT_STARTED_Z_API_LISTENING_VALIDATION
  const [polled, setPolled] = useState<ZApiListeningValidationSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const generationRef = useRef(0)
  const inFlightRef = useRef<symbol | null>(null)
  const sourceAttemptId = source.attemptId
  const sourceState = source.state
  const validation =
    polled?.attemptId !== null && polled?.attemptId === sourceAttemptId ? polled : source

  useEffect(() => {
    const generation = ++generationRef.current
    setPolled(null)
    setError(null)
    if (!enabled || sourceState !== 'awaiting') {
      return
    }
    let active = true
    const poll = async (): Promise<void> => {
      if (inFlightRef.current !== null) {
        return
      }
      const requestToken = Symbol()
      inFlightRef.current = requestToken
      try {
        const next = await callRuntimeRpc<ZApiCommunicationIntegrationStatus>(
          LOCAL_TARGET,
          'communicationIntegrations.zApi.getStatus',
          null
        )
        if (!active || generationRef.current !== generation) {
          return
        }
        setError(null)
        setPolled(next.listeningValidation ?? NOT_STARTED_Z_API_LISTENING_VALIDATION)
        applyCommunicationIntegrationStatus(next)
      } catch {
        if (active && generationRef.current === generation) {
          setError(
            translate(
              'communicationIntegrations.zApi.listeningValidation.statusFailed',
              'Could not refresh listening validation status.'
            )
          )
        }
      } finally {
        if (inFlightRef.current === requestToken) {
          inFlightRef.current = null
        }
      }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [enabled, sourceAttemptId, sourceState])

  return { validation, error }
}
