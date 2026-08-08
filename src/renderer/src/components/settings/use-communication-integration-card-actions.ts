import { useState } from 'react'
import { toast } from 'sonner'
import type {
  CommunicationIntegrationOperationResult,
  CommunicationProviderId,
  SaveCommunicationIntegrationParams
} from '../../../../shared/communication-integrations'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'
import {
  applyCommunicationIntegrationStatus,
  refreshCommunicationIntegrationStatuses
} from './use-communication-integration-statuses'
import type { CommunicationIntegrationPendingOperation } from './CommunicationIntegrationDialogFields'

const LOCAL_TARGET = { kind: 'local' } as const

export type CommunicationIntegrationTestResult =
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string }

export function useCommunicationIntegrationCardActions(
  provider: CommunicationProviderId,
  providerName: string
): {
  pending: CommunicationIntegrationPendingOperation
  error: string | null
  testResult: CommunicationIntegrationTestResult | null
  save: (params: SaveCommunicationIntegrationParams) => Promise<boolean>
  clear: () => Promise<boolean>
  test: () => Promise<void>
} {
  const [pending, setPending] = useState<CommunicationIntegrationPendingOperation>(null)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<CommunicationIntegrationTestResult | null>(null)

  const applyResult = async (
    result: CommunicationIntegrationOperationResult
  ): Promise<CommunicationIntegrationOperationResult> => {
    applyCommunicationIntegrationStatus(result.status)
    await refreshCommunicationIntegrationStatuses({ afterCurrent: true })
    return result
  }

  const save = async (params: SaveCommunicationIntegrationParams): Promise<boolean> => {
    setPending('save')
    setError(null)
    try {
      const result = await applyResult(
        await callRuntimeRpc<CommunicationIntegrationOperationResult>(
          LOCAL_TARGET,
          'communicationIntegrations.save',
          params
        )
      )
      if (!result.ok) {
        setError(result.error.message)
        toast.error(result.error.message)
        return false
      }
      setTestResult(null)
      toast.success(
        translate('communicationIntegrations.toast.saved', '{{provider}} integration saved', {
          provider: providerName
        })
      )
      return true
    } catch {
      const message = translate(
        'communicationIntegrations.toast.saveFailed',
        'Could not save the {{provider}} integration.',
        { provider: providerName }
      )
      setError(message)
      toast.error(message)
      return false
    } finally {
      setPending(null)
    }
  }

  const clear = async (): Promise<boolean> => {
    setPending('clear')
    setError(null)
    try {
      const result = await applyResult(
        await callRuntimeRpc<CommunicationIntegrationOperationResult>(
          LOCAL_TARGET,
          'communicationIntegrations.clear',
          { provider }
        )
      )
      if (!result.ok) {
        setError(result.error.message)
        toast.error(result.error.message)
        return false
      }
      setTestResult(null)
      toast.success(
        translate('communicationIntegrations.toast.cleared', '{{provider}} integration cleared', {
          provider: providerName
        })
      )
      return true
    } catch {
      const message = translate(
        'communicationIntegrations.toast.clearFailed',
        'Could not clear the {{provider}} integration.',
        { provider: providerName }
      )
      setError(message)
      toast.error(message)
      return false
    } finally {
      setPending(null)
    }
  }

  const test = async (): Promise<void> => {
    setPending('test')
    setTestResult(null)
    try {
      const result = await applyResult(
        await callRuntimeRpc<CommunicationIntegrationOperationResult>(
          LOCAL_TARGET,
          'communicationIntegrations.test',
          { provider }
        )
      )
      if (result.ok) {
        const message = translate(
          'communicationIntegrations.test.verified',
          '{{provider}} credentials verified.',
          { provider: providerName }
        )
        setTestResult({ kind: 'ok', message })
        toast.success(message)
      } else {
        setTestResult({ kind: 'error', message: result.error.message })
        toast.error(
          translate('communicationIntegrations.test.failed', '{{provider}} verification failed.', {
            provider: providerName
          })
        )
      }
    } catch {
      const message = translate(
        'communicationIntegrations.test.unavailable',
        'Could not test the {{provider}} integration.',
        { provider: providerName }
      )
      setTestResult({ kind: 'error', message })
      toast.error(message)
    } finally {
      setPending(null)
    }
  }

  return { pending, error, testResult, save, clear, test }
}
