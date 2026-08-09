import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type {
  CommunicationIntegrationStatus,
  CommunicationProviderId,
  ZApiCommunicationIntegrationStatus,
  ZApiCommunicationOperationResult,
  ZApiConversationPage,
  ZApiMessagePage,
  ZApiSendReplyResult
} from '../../../../../shared/communication-integrations'
import type { DiscordVoiceSnapshot } from '../../../../../shared/discord-voice'
import { useCommunicationIntegrationStatuses } from '@/components/settings/use-communication-integration-statuses'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'

export type ZApiCommunicationManagerClient = {
  getStatus: () => Promise<ZApiCommunicationIntegrationStatus>
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
} {
  const local = useCommunicationIntegrationStatuses({ refreshWhen, disabled: runtime !== null })
  const [runtimeStatuses, setRuntimeStatuses] = useState<readonly CommunicationIntegrationStatus[]>(
    []
  )
  useEffect(() => {
    if (!runtime || !refreshWhen) {
      return
    }
    let disposed = false
    void runtime
      .loadIntegrationStatuses()
      .then((statuses) => {
        if (!disposed) {
          setRuntimeStatuses(statuses)
        }
      })
      .catch((error: unknown) =>
        console.error('[communication-manager] status refresh failed:', error)
      )
    return () => {
      disposed = true
    }
  }, [refreshWhen, runtime])
  const getStatus = useCallback(
    (provider: CommunicationProviderId) =>
      runtime
        ? (runtimeStatuses.find((status) => status.provider === provider) ?? null)
        : local.getStatus(provider),
    [local, runtime, runtimeStatuses]
  )
  return { getStatus }
}

export function useCommunicationSettingsAction(
  localAction: (provider: CommunicationProviderId) => void
): (provider: CommunicationProviderId) => void {
  return useCommunicationManagerRuntime()?.openSettings ?? localAction
}
