import type {
  CommunicationIntegrationOperationResult,
  CommunicationIntegrationRedactedError,
  CommunicationIntegrationStatus,
  CommunicationProviderId,
  SaveCommunicationIntegrationParams,
  SaveDiscordCommunicationIntegrationParams,
  SaveSlackCommunicationIntegrationParams,
  SaveZApiCommunicationIntegrationParams
} from '../../shared/communication-integrations'
import {
  DEFAULT_SLACK_API_BASE_URL,
  DEFAULT_Z_API_BASE_URL
} from '../../shared/communication-integrations'
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
import { probeZApiCommunicationIntegration } from './z-api-communication-probe'

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

function status(provider: CommunicationProviderId): CommunicationIntegrationStatus {
  return provider === 'discord'
    ? discordStatus()
    : provider === 'slack'
      ? SlackStore.getSlackCommunicationStatus()
      : ZApiStore.getZApiCommunicationStatus()
}

async function operation(
  provider: CommunicationProviderId,
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

async function saveZApi(params: SaveZApiCommunicationIntegrationParams) {
  return operation('z-api', () => {
    const normalized = normalizeCommunicationApiEndpoint(params.baseUrl)
    assertCommunicationEndpointTrust(normalized, params.endpointTrust, DEFAULT_Z_API_BASE_URL)
    ZApiStore.saveZApiCommunicationCredentials({
      ...params,
      baseUrl: normalized.baseUrl,
      trustedCustomAuthority: params.endpointTrust.kind === 'custom' ? normalized.authority : null
    })
  })
}

async function testZApi(): Promise<CommunicationIntegrationOperationResult> {
  let stored
  try {
    stored = ZApiStore.readZApiCommunicationCredentials()
  } catch (error) {
    return operation('z-api', () => {
      throw error
    })
  }
  if (!stored?.instanceId || !stored.instanceToken || !stored.clientToken) {
    return { ok: false, status: ZApiStore.getZApiCommunicationStatus(), error: NOT_CONFIGURED }
  }
  const { instanceId, instanceToken, clientToken } = stored
  return operation('z-api', async () => {
    const endpointTrust = stored.trustedCustomAuthority
      ? { kind: 'custom' as const, authority: stored.trustedCustomAuthority }
      : { kind: 'default' as const }
    try {
      const result = await probeZApiCommunicationIntegration({
        ...stored,
        endpointTrust,
        instanceId,
        instanceToken,
        clientToken
      })
      ZApiStore.saveZApiCommunicationVerification(
        result.instanceConnected,
        new Date().toISOString()
      )
    } catch (error) {
      const safeError = redactCommunicationIntegrationError(error)
      if (safeError && error instanceof CommunicationApiError) {
        ZApiStore.saveZApiCommunicationError(safeError)
      }
      throw error
    }
  })
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
    getStatus: ZApiStore.getZApiCommunicationStatus,
    save: saveZApi,
    clear: () => operation('z-api', ZApiStore.clearZApiCommunicationCredentials),
    test: testZApi
  }
} satisfies Record<CommunicationProviderId, unknown>

export async function getCommunicationIntegrationStatuses(): Promise<
  CommunicationIntegrationStatus[]
> {
  return (['discord', 'slack', 'z-api'] as const).map((provider) => {
    try {
      return status(provider)
    } catch (error) {
      const safeError = redactCommunicationIntegrationError(error)
      if (safeError && error instanceof CommunicationIntegrationCredentialFileError) {
        return storageFailureStatus(provider, safeError)
      }
      throw error
    }
  })
}

export function saveCommunicationIntegration(params: SaveCommunicationIntegrationParams) {
  return params.provider === 'discord'
    ? saveDiscord(params)
    : params.provider === 'slack'
      ? saveSlack(params)
      : saveZApi(params)
}

export function clearCommunicationIntegration(provider: CommunicationProviderId) {
  return COMMUNICATION_INTEGRATION_REGISTRY[provider].clear()
}

export function testCommunicationIntegration(provider: CommunicationProviderId) {
  return COMMUNICATION_INTEGRATION_REGISTRY[provider].test()
}
