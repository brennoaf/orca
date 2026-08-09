import type {
  CommunicationIntegrationOperationResult,
  CommunicationIntegrationRedactedError,
  CommunicationIntegrationStatus,
  CommunicationProviderId,
  SaveCommunicationIntegrationParams,
  SaveDiscordCommunicationIntegrationParams,
  SaveSlackCommunicationIntegrationParams
} from '../../shared/communication-integrations'
import { DEFAULT_SLACK_API_BASE_URL } from '../../shared/communication-integrations'
import * as DiscordStore from './discord-voice-credential-store'
import * as DiscordService from './discord-voice-service'
import {
  assertCommunicationEndpointTrust,
  CommunicationApiError,
  normalizeCommunicationApiEndpoint
} from './communication-api-endpoint'
import {
  CommunicationIntegrationCredentialFileError,
  redactCommunicationIntegrationError
} from './communication-integration-credential-file'
import * as SlackStore from './slack-communication-credential-store'
import { probeSlackCommunicationIntegration } from './slack-communication-probe'
import * as ZApiStore from './z-api-communication-credential-store'
import {
  getZApiCommunicationIntegrationStatus,
  listZApiConversations,
  listZApiMessages,
  prepareZApiIngress,
  removeZApiCommunicationIntegration,
  saveAndConfigureZApi,
  sendZApiReply
} from './z-api-communication-integration'

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
  provider: CommunicationProviderId,
  error: CommunicationIntegrationRedactedError
): CommunicationIntegrationStatus {
  return provider === 'slack'
    ? SlackStore.emptySlackCommunicationStatus(error)
    : provider === 'z-api'
      ? ZApiStore.emptyZApiCommunicationStatus(error)
      : DiscordStore.emptyDiscordCommunicationStatus(error)
}

function status(
  provider: Exclude<CommunicationProviderId, 'z-api'>
): CommunicationIntegrationStatus {
  return provider === 'discord' ? discordStatus() : SlackStore.getSlackCommunicationStatus()
}

async function operation(
  provider: Exclude<CommunicationProviderId, 'z-api'>,
  run: () => Promise<void> | void
): Promise<CommunicationIntegrationOperationResult> {
  try {
    await run()
    return { ok: true, status: status(provider) }
  } catch (error) {
    const safeError = redactCommunicationIntegrationError(error)
    if (!safeError) {
      throw error
    }
    const nextStatus =
      error instanceof CommunicationIntegrationCredentialFileError
        ? storageFailureStatus(provider, safeError)
        : status(provider)
    return { ok: false, status: nextStatus, error: safeError }
  }
}

async function saveDiscord(params: SaveDiscordCommunicationIntegrationParams) {
  return operation('discord', () => {
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
    return operation('discord', () => {
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

async function saveSlack(params: SaveSlackCommunicationIntegrationParams) {
  return operation('slack', () => {
    const normalized = normalizeCommunicationApiEndpoint(params.baseUrl)
    assertCommunicationEndpointTrust(normalized, params.endpointTrust, DEFAULT_SLACK_API_BASE_URL)
    SlackStore.saveSlackCommunicationCredentials({
      ...params,
      baseUrl: normalized.baseUrl,
      trustedCustomAuthority: params.endpointTrust.kind === 'custom' ? normalized.authority : null
    })
  })
}

async function testSlack(): Promise<CommunicationIntegrationOperationResult> {
  let stored
  try {
    stored = SlackStore.readSlackCommunicationCredentials()
  } catch (error) {
    return operation('slack', () => {
      throw error
    })
  }
  if (!stored?.appToken || !stored.userToken) {
    return { ok: false, status: SlackStore.getSlackCommunicationStatus(), error: NOT_CONFIGURED }
  }
  const { appToken, userToken } = stored
  return operation('slack', async () => {
    const endpointTrust = stored.trustedCustomAuthority
      ? { kind: 'custom' as const, authority: stored.trustedCustomAuthority }
      : { kind: 'default' as const }
    try {
      const result = await probeSlackCommunicationIntegration({
        ...stored,
        endpointTrust,
        appToken,
        userToken
      })
      SlackStore.saveSlackCommunicationVerification(result.workspace, new Date().toISOString())
    } catch (error) {
      const safeError = redactCommunicationIntegrationError(error)
      if (safeError && error instanceof CommunicationApiError) {
        SlackStore.saveSlackCommunicationError(safeError)
      }
      throw error
    }
  })
}

const Z_API_TRANSACTION_REQUIRED: CommunicationIntegrationRedactedError = {
  code: 'invalid_configuration',
  message: 'Configure Z-API with its public webhook endpoint in one transaction.',
  field: null
}

export const COMMUNICATION_INTEGRATION_REGISTRY = {
  discord: {
    provider: 'discord',
    getStatus: discordStatus,
    save: saveDiscord,
    clear: () =>
      operation('discord', () => {
        DiscordStore.clearDiscordVoiceCredentials()
        DiscordService.stopDiscordVoiceService()
      }),
    test: testDiscord
  },
  slack: {
    provider: 'slack',
    getStatus: SlackStore.getSlackCommunicationStatus,
    save: saveSlack,
    clear: () => operation('slack', SlackStore.clearSlackCommunicationCredentials),
    test: testSlack
  },
  'z-api': {
    provider: 'z-api',
    getStatus: getZApiCommunicationIntegrationStatus,
    save: saveAndConfigureZApi,
    clear: removeZApiCommunicationIntegration,
    test: async () => ({
      ok: false as const,
      status: await getZApiCommunicationIntegrationStatus(),
      error: Z_API_TRANSACTION_REQUIRED
    })
  }
} satisfies Record<CommunicationProviderId, unknown>

export async function getCommunicationIntegrationStatuses(): Promise<
  CommunicationIntegrationStatus[]
> {
  return Promise.all(
    (['discord', 'slack', 'z-api'] as const).map(async (provider) => {
      try {
        return provider === 'z-api'
          ? await getZApiCommunicationIntegrationStatus()
          : status(provider)
      } catch (error) {
        const safeError = redactCommunicationIntegrationError(error)
        if (safeError && error instanceof CommunicationIntegrationCredentialFileError) {
          return storageFailureStatus(provider, safeError)
        }
        throw error
      }
    })
  )
}

export async function saveCommunicationIntegration(params: SaveCommunicationIntegrationParams) {
  if (params.provider === 'discord') {
    return saveDiscord(params)
  }
  if (params.provider === 'slack') {
    return saveSlack(params)
  }
  return {
    ok: false as const,
    status: await getZApiCommunicationIntegrationStatus(),
    error: Z_API_TRANSACTION_REQUIRED
  }
}

export function clearCommunicationIntegration(provider: CommunicationProviderId) {
  return COMMUNICATION_INTEGRATION_REGISTRY[provider].clear()
}

export function testCommunicationIntegration(provider: CommunicationProviderId) {
  return COMMUNICATION_INTEGRATION_REGISTRY[provider].test()
}

export {
  getZApiCommunicationIntegrationStatus,
  listZApiConversations,
  listZApiMessages,
  prepareZApiIngress,
  removeZApiCommunicationIntegration,
  saveAndConfigureZApi,
  sendZApiReply
}
