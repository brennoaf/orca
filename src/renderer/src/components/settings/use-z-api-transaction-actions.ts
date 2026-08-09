import { useState } from 'react'
import { toast } from 'sonner'
import type {
  SaveAndConfigureZApiParams,
  ZApiCommunicationOperationResult,
  ZApiListeningValidationSnapshot,
  ZApiPreparedIngressSnapshot
} from '../../../../shared/communication-integrations'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { CommunicationIntegrationPendingOperation } from './CommunicationIntegrationDialogFields'
import {
  applyCommunicationIntegrationStatus,
  refreshCommunicationIntegrationStatuses
} from './use-communication-integration-statuses'

const LOCAL_TARGET = { kind: 'local' } as const

export function useZApiTransactionActions(): {
  pending: CommunicationIntegrationPendingOperation
  error: string | null
  prepare: (listenPort: number) => Promise<ZApiPreparedIngressSnapshot | null>
  discardPrepared: () => Promise<boolean>
  saveAndConfigure: (params: SaveAndConfigureZApiParams) => Promise<boolean>
  startListeningValidation: () => Promise<ZApiListeningValidationSnapshot | null>
  cancelListeningValidation: (attemptId: string) => Promise<ZApiListeningValidationSnapshot | null>
  remove: () => Promise<boolean>
} {
  const [pending, setPending] = useState<CommunicationIntegrationPendingOperation>(null)
  const [error, setError] = useState<string | null>(null)

  const applyResult = async <T>(
    result: ZApiCommunicationOperationResult<T>
  ): Promise<ZApiCommunicationOperationResult<T>> => {
    applyCommunicationIntegrationStatus(result.status)
    await refreshCommunicationIntegrationStatuses({ afterCurrent: true })
    return result
  }

  const operationError = (message: string): void => {
    setError(message)
    toast.error(message)
  }

  const prepare = async (listenPort: number): Promise<ZApiPreparedIngressSnapshot | null> => {
    setPending('prepare')
    setError(null)
    try {
      const result = await applyResult(
        await callRuntimeRpc<ZApiCommunicationOperationResult<ZApiPreparedIngressSnapshot>>(
          LOCAL_TARGET,
          'communicationIntegrations.zApi.prepareIngress',
          { listenPort }
        )
      )
      if (!result.ok) {
        operationError(result.error.message)
        return null
      }
      return result.value
    } catch {
      operationError(
        translate(
          'communicationIntegrations.zApi.prepareFailed',
          'Could not prepare the local Z-API receiver.'
        )
      )
      return null
    } finally {
      setPending(null)
    }
  }

  const discardPrepared = async (): Promise<boolean> => {
    setPending('discard')
    setError(null)
    try {
      const result = await applyResult(
        await callRuntimeRpc<ZApiCommunicationOperationResult>(
          LOCAL_TARGET,
          'communicationIntegrations.zApi.discardPreparedIngress',
          null
        )
      )
      if (!result.ok) {
        operationError(result.error.message)
        return false
      }
      return true
    } catch {
      operationError(
        translate(
          'communicationIntegrations.zApi.discardFailed',
          'Could not release the prepared Z-API receiver.'
        )
      )
      return false
    } finally {
      setPending(null)
    }
  }

  const saveAndConfigure = async (params: SaveAndConfigureZApiParams): Promise<boolean> => {
    setPending('save')
    setError(null)
    try {
      const result = await applyResult(
        await callRuntimeRpc<ZApiCommunicationOperationResult>(
          LOCAL_TARGET,
          'communicationIntegrations.zApi.saveAndConfigure',
          params
        )
      )
      if (!result.ok) {
        operationError(result.error.message)
        return false
      }
      toast.success(
        translate(
          'communicationIntegrations.zApi.configuredToast',
          'Z-API is configured. Validate WhatsApp listening to finish.'
        )
      )
      return true
    } catch {
      operationError(
        translate(
          'communicationIntegrations.zApi.configureFailed',
          'Could not save and configure the Z-API integration.'
        )
      )
      return false
    } finally {
      setPending(null)
    }
  }

  const startListeningValidation = async (): Promise<ZApiListeningValidationSnapshot | null> => {
    setPending('validate')
    setError(null)
    try {
      const result = await applyResult(
        await callRuntimeRpc<ZApiCommunicationOperationResult<ZApiListeningValidationSnapshot>>(
          LOCAL_TARGET,
          'communicationIntegrations.zApi.startListeningValidation',
          null
        )
      )
      if (!result.ok) {
        operationError(result.error.message)
        return null
      }
      return result.value
    } catch {
      operationError(
        translate(
          'communicationIntegrations.zApi.listeningValidation.startFailed',
          'Could not start listening validation.'
        )
      )
      return null
    } finally {
      setPending(null)
    }
  }

  const cancelListeningValidation = async (
    attemptId: string
  ): Promise<ZApiListeningValidationSnapshot | null> => {
    setPending('cancel-validation')
    setError(null)
    try {
      const result = await applyResult(
        await callRuntimeRpc<ZApiCommunicationOperationResult<ZApiListeningValidationSnapshot>>(
          LOCAL_TARGET,
          'communicationIntegrations.zApi.cancelListeningValidation',
          { attemptId }
        )
      )
      if (!result.ok) {
        operationError(result.error.message)
        return null
      }
      return result.value
    } catch {
      operationError(
        translate(
          'communicationIntegrations.zApi.listeningValidation.cancelFailed',
          'Could not cancel listening validation.'
        )
      )
      return null
    } finally {
      setPending(null)
    }
  }

  const remove = async (): Promise<boolean> => {
    setPending('clear')
    setError(null)
    try {
      const result = await applyResult(
        await callRuntimeRpc<ZApiCommunicationOperationResult>(
          LOCAL_TARGET,
          'communicationIntegrations.zApi.remove',
          null
        )
      )
      if (!result.ok) {
        operationError(result.error.message)
        return false
      }
      toast.success(
        translate('communicationIntegrations.zApi.removedToast', 'Z-API integration removed.')
      )
      return true
    } catch {
      operationError(
        translate(
          'communicationIntegrations.zApi.removeFailed',
          'Could not remove the Z-API integration.'
        )
      )
      return false
    } finally {
      setPending(null)
    }
  }

  return {
    pending,
    error,
    prepare,
    discardPrepared,
    saveAndConfigure,
    startListeningValidation,
    cancelListeningValidation,
    remove
  }
}
