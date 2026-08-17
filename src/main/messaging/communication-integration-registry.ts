import type {
  CommunicationIntegrationOperationResult,
  CommunicationIntegrationRedactedError,
  CommunicationIntegrationStatus,
  CommunicationProviderId,
  SaveCommunicationIntegrationParams,
  SaveDiscordCommunicationIntegrationParams
} from '../../shared/communication-integrations'
import * as DiscordStore from './discord-voice-credential-store'
import * as DiscordService from './discord-voice-service'
import {
  CommunicationIntegrationCredentialFileError,
  redactCommunicationIntegrationError
} from './communication-integration-credential-file'

type ProviderStatus<P extends CommunicationProviderId> = Extract<
  CommunicationIntegrationStatus,
  { provider: P }
>
const NOT_CONFIGURED: CommunicationIntegrationRedactedError = {
  code: 'not_configured',
  message: 'Configure all required credentials before testing the integration.',
  field: null
}

function discordStatus(): ProviderStatus<'discord'> {
  const credentials = DiscordStore.readDiscordVoiceCredentials()
  const snapshot = DiscordService.getDiscordVoiceSnapshot()
  const ready = snapshot.connection === 'connected'
  const failureKind = DiscordService.getDiscordVoiceConnectionFailureKind()
  const lastError =
    failureKind === null
      ? null
      : {
          code: failureKind === 'authentication' ? ('unauthorized' as const) : failureKind,
          message:
            failureKind === 'authentication'
              ? 'Discord rejected the credentials.'
              : 'Discord RPC is unavailable.',
          field: null
        }
  return {
    provider: 'discord',
    endpoint: null,
    readiness: {
      configured: credentials !== null,
      verified: ready,
      sendReady: ready,
      receiveReady: ready,
      verifiedAt: null,
      lastError
    },
    clientId: credentials?.clientId ?? null,
    clientSecretStored: credentials !== null
  }
}

function storageFailureStatus(
  error: CommunicationIntegrationRedactedError
): CommunicationIntegrationStatus {
  return DiscordStore.emptyDiscordCommunicationStatus(error)
}

async function operation(
  run: () => Promise<void> | void
): Promise<CommunicationIntegrationOperationResult> {
  try {
    await run()
    return { ok: true, status: discordStatus() }
  } catch (error) {
    const safeError = redactCommunicationIntegrationError(error)
    if (!safeError) {
      throw error
    }
    const nextStatus =
      error instanceof CommunicationIntegrationCredentialFileError
        ? storageFailureStatus(safeError)
        : discordStatus()
    return { ok: false, status: nextStatus, error: safeError }
  }
}

async function saveDiscord(params: SaveDiscordCommunicationIntegrationParams) {
  return operation(() => {
    const saved = DiscordStore.updateDiscordVoiceCredentials(params)
    if (saved) {
      DiscordService.reconnectDiscordVoiceService()
    } else {
      DiscordService.stopDiscordVoiceService()
    }
  })
}

async function testDiscord(): Promise<CommunicationIntegrationOperationResult> {
  let initial: ProviderStatus<'discord'>
  try {
    initial = discordStatus()
  } catch (error) {
    return operation(() => {
      throw error
    })
  }
  if (!initial.readiness.configured) {
    return { ok: false, status: initial, error: NOT_CONFIGURED }
  }
  DiscordService.reconnectDiscordVoiceService()
  const deadline = Date.now() + 15_000
  while (Date.now() <= deadline) {
    const current = discordStatus()
    if (current.readiness.verified) {
      return { ok: true, status: current }
    }
    if (current.readiness.lastError) {
      return { ok: false, status: current, error: current.readiness.lastError }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100))
  }
  const error = {
    code: 'timeout' as const,
    message: 'Discord RPC verification timed out.',
    field: null
  }
  const current = discordStatus()
  return {
    ok: false,
    status: { ...current, readiness: { ...current.readiness, lastError: error } },
    error
  }
}

export const COMMUNICATION_INTEGRATION_REGISTRY = {
  discord: {
    provider: 'discord',
    getStatus: discordStatus,
    save: saveDiscord,
    clear: () =>
      operation(() => {
        DiscordStore.clearDiscordVoiceCredentials()
        DiscordService.stopDiscordVoiceService()
      }),
    test: testDiscord
  }
} satisfies Record<CommunicationProviderId, unknown>

export async function getCommunicationIntegrationStatuses(): Promise<
  CommunicationIntegrationStatus[]
> {
  try {
    return [discordStatus()]
  } catch (error) {
    const safeError = redactCommunicationIntegrationError(error)
    if (safeError && error instanceof CommunicationIntegrationCredentialFileError) {
      return [storageFailureStatus(safeError)]
    }
    throw error
  }
}

export async function saveCommunicationIntegration(params: SaveCommunicationIntegrationParams) {
  return saveDiscord(params)
}

export function clearCommunicationIntegration(provider: CommunicationProviderId) {
  return COMMUNICATION_INTEGRATION_REGISTRY[provider].clear()
}

export function testCommunicationIntegration(provider: CommunicationProviderId) {
  return COMMUNICATION_INTEGRATION_REGISTRY[provider].test()
}
