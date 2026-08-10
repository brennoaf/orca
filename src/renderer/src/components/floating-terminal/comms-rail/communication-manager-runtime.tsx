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
  CommunicationProviderId,
  ZApiCommunicationIntegrationStatus,
  ZApiCommunicationOperationResult,
  ZApiConversationAvatarSnapshot,
  ZApiConversationPage,
  ZApiMessagePage,
  ZApiSendReplyResult
} from '../../../../../shared/communication-integrations'
import type { DiscordVoiceSnapshot } from '../../../../../shared/discord-voice'
import { useCommunicationIntegrationStatuses } from '@/components/settings/use-communication-integration-statuses'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'

export type ZApiCommunicationManagerClient = {
  getStatus: () => Promise<ZApiCommunicationIntegrationStatus>
  getConversationAvatar: (params: {
    conversationId: number
  }) => Promise<ZApiConversationAvatarSnapshot>
  listConversations: (params: { limit: number; offset: number }) => Promise<ZApiConversationPage>
  listMessages: (params: {
    conversationId: number
    limit: number
    offset: number
  }) => Promise<ZApiMessagePage>
  sendReply: (params: {
    conversationId: number
    text: string
  }) => Promise<ZApiCommunicationOperationResult<ZApiSendReplyResult>>
}

const LOCAL_RUNTIME_TARGET = { kind: 'local' } as const

export const LOCAL_Z_API_COMMUNICATION_MANAGER_CLIENT: ZApiCommunicationManagerClient = {
  getStatus: () =>
    callRuntimeRpc<ZApiCommunicationIntegrationStatus>(
      LOCAL_RUNTIME_TARGET,
      'communicationIntegrations.zApi.getStatus',
      null
    ),
  getConversationAvatar: (params) =>
    callRuntimeRpc<ZApiConversationAvatarSnapshot>(
      LOCAL_RUNTIME_TARGET,
      'communicationIntegrations.zApi.getConversationAvatar',
      params
    ),
  listConversations: (params) =>
    callRuntimeRpc<ZApiConversationPage>(
      LOCAL_RUNTIME_TARGET,
      'communicationIntegrations.zApi.listConversations',
      params
    ),
  listMessages: (params) =>
    callRuntimeRpc<ZApiMessagePage>(
      LOCAL_RUNTIME_TARGET,
      'communicationIntegrations.zApi.listMessages',
      params
    ),
  sendReply: (params) =>
    callRuntimeRpc<ZApiCommunicationOperationResult<ZApiSendReplyResult>>(
      LOCAL_RUNTIME_TARGET,
      'communicationIntegrations.zApi.sendReply',
      params
    )
}

export type CommunicationManagerRuntime = {
  commandDiscord: (method: string, params?: unknown) => Promise<DiscordVoiceSnapshot>
  loadIntegrationStatuses: () => Promise<readonly CommunicationIntegrationStatus[]>
  openSettings: (provider: CommunicationProviderId) => void
  overlayOpen: boolean
  setOverlayOpen: (open: boolean) => void
  zApi: ZApiCommunicationManagerClient
}

const CommunicationManagerRuntimeContext = createContext<CommunicationManagerRuntime | null>(null)

export function CommunicationManagerRuntimeProvider({
  runtime,
  children
}: {
  runtime: CommunicationManagerRuntime
  children: ReactNode
}): React.JSX.Element {
  return (
    <CommunicationManagerRuntimeContext.Provider value={runtime}>
      {children}
    </CommunicationManagerRuntimeContext.Provider>
  )
}

export function useCommunicationManagerRuntime(): CommunicationManagerRuntime | null {
  return useContext(CommunicationManagerRuntimeContext)
}

export function useCommunicationManagerStatuses(
  runtime: CommunicationManagerRuntime | null,
  refreshWhen: boolean
): {
  getStatus: (provider: CommunicationProviderId) => CommunicationIntegrationStatus | null
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const local = useCommunicationIntegrationStatuses({ refreshWhen, disabled: runtime !== null })
  const requestSequenceRef = useRef(0)
  const [refreshSequence, setRefreshSequence] = useState(0)
  const [runtimeSnapshot, setRuntimeSnapshot] = useState<{
    runtime: CommunicationManagerRuntime | null
    statuses: readonly CommunicationIntegrationStatus[]
    loading: boolean
    error: string | null
  }>({ runtime: null, statuses: [], loading: true, error: null })
  useEffect(() => {
    if (!runtime || !refreshWhen) {
      requestSequenceRef.current += 1
      return
    }
    const sequence = requestSequenceRef.current + 1
    requestSequenceRef.current = sequence
    setRuntimeSnapshot((current) =>
      current.runtime === runtime
        ? { ...current, loading: true, error: null }
        : { runtime, statuses: [], loading: true, error: null }
    )
    void runtime
      .loadIntegrationStatuses()
      .then((statuses) => {
        if (requestSequenceRef.current === sequence) {
          setRuntimeSnapshot({ runtime, statuses, loading: false, error: null })
        }
      })
      .catch(() => {
        if (requestSequenceRef.current === sequence) {
          setRuntimeSnapshot({
            runtime,
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
      if (requestSequenceRef.current === sequence) {
        requestSequenceRef.current += 1
      }
    }
  }, [refreshSequence, refreshWhen, runtime])
  const current = runtime
    ? runtimeSnapshot.runtime === runtime
      ? runtimeSnapshot
      : { runtime, statuses: [], loading: true, error: null }
    : local
  const getStatus = useCallback(
    (provider: CommunicationProviderId) =>
      current.statuses.find((status) => status.provider === provider) ?? null,
    [current.statuses]
  )
  return {
    getStatus,
    loading: current.loading,
    error: current.error,
    refresh: () => {
      if (runtime) {
        setRefreshSequence((value) => value + 1)
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
