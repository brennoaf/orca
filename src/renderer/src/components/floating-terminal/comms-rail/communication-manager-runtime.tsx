import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type {
  CommunicationIntegrationStatus,
  CommunicationProviderId
} from '../../../../../shared/communication-integrations'
import type { DiscordVoiceSnapshot } from '../../../../../shared/discord-voice'
import { useCommunicationIntegrationStatuses } from '@/components/settings/use-communication-integration-statuses'
import { translate } from '@/i18n/i18n'
export type CommunicationManagerRuntime = {
  commandDiscord: (method: string, params?: unknown) => Promise<DiscordVoiceSnapshot>
  loadIntegrationStatuses: () => Promise<readonly CommunicationIntegrationStatus[]>
  openSettings: (provider: CommunicationProviderId) => void
  overlayOpen: boolean
  setOverlayOpen: (open: boolean) => void
}
const Context = createContext<CommunicationManagerRuntime | null>(null)
export function CommunicationManagerRuntimeProvider({
  runtime,
  children
}: {
  runtime: CommunicationManagerRuntime
  children: ReactNode
}): React.JSX.Element {
  return <Context.Provider value={runtime}>{children}</Context.Provider>
}
export function useCommunicationManagerRuntime(): CommunicationManagerRuntime | null {
  return useContext(Context)
}
export function useCommunicationManagerStatuses(
  runtime: CommunicationManagerRuntime | null,
  refreshWhen: boolean
) {
  const local = useCommunicationIntegrationStatuses({ refreshWhen, disabled: runtime !== null })
  const sequence = useRef(0)
  const [refreshEpoch, setRefreshEpoch] = useState(0)
  const [snapshot, setSnapshot] = useState<{
    statuses: readonly CommunicationIntegrationStatus[]
    loading: boolean
    error: string | null
  }>({ statuses: [], loading: true, error: null })
  useEffect(() => {
    if (!runtime || !refreshWhen) {
      return
    }
    const id = ++sequence.current
    setSnapshot((current) => ({ ...current, loading: true, error: null }))
    void runtime
      .loadIntegrationStatuses()
      .then((statuses) => {
        if (sequence.current === id) {
          setSnapshot({ statuses, loading: false, error: null })
        }
      })
      .catch(() => {
        if (sequence.current === id) {
          setSnapshot({
            statuses: [],
            loading: false,
            error: translate(
              'communicationIntegrations.status.loadFailed',
              'Could not load communication integration status.'
            )
          })
        }
      })
    return () => {
      if (sequence.current === id) {
        sequence.current += 1
      }
    }
  }, [refreshEpoch, refreshWhen, runtime])
  const current = runtime ? snapshot : local
  return {
    getStatus: useCallback(
      (provider: CommunicationProviderId) =>
        current.statuses.find((status) => status.provider === provider) ?? null,
      [current.statuses]
    ),
    loading: current.loading,
    error: current.error,
    refresh: () => {
      if (runtime) {
        setRefreshEpoch((current) => current + 1)
      } else {
        void local.refresh()
      }
    }
  }
}
export function useCommunicationSettingsAction(
  localAction: (provider: CommunicationProviderId) => void
): (provider: CommunicationProviderId) => void {
  return useCommunicationManagerRuntime()?.openSettings ?? localAction
}
