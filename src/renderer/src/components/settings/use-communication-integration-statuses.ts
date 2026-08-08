import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type {
  CommunicationIntegrationStatus,
  CommunicationProviderId
} from '../../../../shared/communication-integrations'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { translate } from '@/i18n/i18n'

const LOCAL_TARGET = { kind: 'local' } as const

type CommunicationIntegrationStatusesSnapshot = {
  statuses: readonly CommunicationIntegrationStatus[]
  loading: boolean
  error: string | null
}

let snapshot: CommunicationIntegrationStatusesSnapshot = {
  statuses: [],
  loading: true,
  error: null
}
let refreshPromise: Promise<void> | null = null
const listeners = new Set<() => void>()

function emit(next: CommunicationIntegrationStatusesSnapshot): void {
  snapshot = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): CommunicationIntegrationStatusesSnapshot {
  return snapshot
}

export function applyCommunicationIntegrationStatus(status: CommunicationIntegrationStatus): void {
  emit({
    statuses: [...snapshot.statuses.filter((entry) => entry.provider !== status.provider), status],
    loading: false,
    error: null
  })
}

export function refreshCommunicationIntegrationStatuses(options?: {
  afterCurrent?: boolean
}): Promise<void> {
  if (refreshPromise) {
    return options?.afterCurrent
      ? refreshPromise.then(() => refreshCommunicationIntegrationStatuses())
      : refreshPromise
  }
  emit({ ...snapshot, loading: true, error: null })
  refreshPromise = callRuntimeRpc<CommunicationIntegrationStatus[]>(
    LOCAL_TARGET,
    'communicationIntegrations.getStatuses',
    null
  )
    .then((statuses) => {
      if (!Array.isArray(statuses)) {
        throw new Error('Communication integration status response is invalid')
      }
      emit({ statuses, loading: false, error: null })
    })
    .catch(() => {
      emit({
        ...snapshot,
        loading: false,
        error: translate(
          'communicationIntegrations.status.loadFailed',
          'Could not load communication integration status.'
        )
      })
    })
    .finally(() => {
      refreshPromise = null
    })
  return refreshPromise
}

export function useCommunicationIntegrationStatuses(options?: {
  refreshWhen?: boolean
}): CommunicationIntegrationStatusesSnapshot & {
  getStatus: (provider: CommunicationProviderId) => CommunicationIntegrationStatus | null
  refresh: () => Promise<void>
} {
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    void refreshCommunicationIntegrationStatuses()
  }, [])

  useEffect(() => {
    if (options?.refreshWhen) {
      void refreshCommunicationIntegrationStatuses()
    }
  }, [options?.refreshWhen])

  const getStatus = useCallback(
    (provider: CommunicationProviderId) =>
      current.statuses.find((status) => status.provider === provider) ?? null,
    [current.statuses]
  )

  return {
    ...current,
    getStatus,
    refresh: refreshCommunicationIntegrationStatuses
  }
}

export function resetCommunicationIntegrationStatusesForTests(): void {
  refreshPromise = null
  snapshot = { statuses: [], loading: true, error: null }
  listeners.clear()
}
