import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CommunicationIntegrationRedactedError,
  CommunicationSecretMutation,
  SlackCommunicationWorkspace
} from '../../shared/communication-integrations'

type SlackState = {
  version: 1
  provider: 'slack'
  appToken: string | null
  userToken: string | null
  baseUrl: string
  trustedCustomAuthority: string | null
  verification: { verifiedAt: string; workspace: SlackCommunicationWorkspace } | null
  lastError: CommunicationIntegrationRedactedError | null
}

type ZApiState = {
  version: 1
  provider: 'z-api'
  instanceId: string | null
  instanceToken: string | null
  clientToken: string | null
  baseUrl: string
  trustedCustomAuthority: string | null
  verification: { verifiedAt: string; connected: boolean } | null
  lastError: CommunicationIntegrationRedactedError | null
}

function mutate(current: string | null, mutation: CommunicationSecretMutation): string | null {
  if (mutation.action === 'keep') {
    return current
  }
  if (mutation.action === 'clear') {
    return null
  }
  return mutation.value
}

const mocks = vi.hoisted(() => ({
  discordCredentials: null as { clientId: string; clientSecret: string; refreshToken: null } | null,
  discordSnapshot: {
    connection: 'disconnected' as 'disconnected' | 'connecting' | 'connected',
    lastError: null as string | null,
    failureKind: null as 'authentication' | 'provider_unavailable' | null
  },
  slackCredentials: null as SlackState | null,
  zApiCredentials: null as ZApiState | null,
  reconnectDiscordVoiceService: vi.fn(),
  stopDiscordVoiceService: vi.fn(),
  probeSlack: vi.fn(),
  probeZApi: vi.fn(),
  saveSlackCredentials: vi.fn(),
  saveZApiCredentials: vi.fn()
}))

vi.mock('./discord-voice-credential-store', () => ({
  readDiscordVoiceCredentials: vi.fn(() => mocks.discordCredentials),
  emptyDiscordCommunicationStatus: vi.fn((lastError = null) => ({
    provider: 'discord',
    endpoint: null,
    readiness: {
      configured: false,
      verified: false,
      sendReady: false,
      receiveReady: false,
      verifiedAt: null,
      lastError
    },
    clientId: null,
    clientSecretStored: false
  })),
  updateDiscordVoiceCredentials: vi.fn(
    (params: { clientId: string; clientSecret: CommunicationSecretMutation }) => {
      const secret = mutate(mocks.discordCredentials?.clientSecret ?? null, params.clientSecret)
      mocks.discordCredentials = secret
        ? { clientId: params.clientId, clientSecret: secret, refreshToken: null }
        : null
      return mocks.discordCredentials
    }
  ),
  clearDiscordVoiceCredentials: vi.fn(() => {
    mocks.discordCredentials = null
  })
}))

vi.mock('./discord-voice-service', () => ({
  getDiscordVoiceConnectionFailureKind: vi.fn(() => mocks.discordSnapshot.failureKind),
  getDiscordVoiceSnapshot: vi.fn(() => ({
    connection: mocks.discordSnapshot.connection,
    channelId: null,
    channelName: null,
    selfUserId: null,
    participants: [],
    credentialsConfigured: mocks.discordCredentials !== null,
    lastError: mocks.discordSnapshot.lastError
  })),
  reconnectDiscordVoiceService: mocks.reconnectDiscordVoiceService,
  stopDiscordVoiceService: mocks.stopDiscordVoiceService
}))

vi.mock('./slack-communication-credential-store', () => ({
  readSlackCommunicationCredentials: vi.fn(() => mocks.slackCredentials),
  getSlackCommunicationStatus: vi.fn(() => {
    const stored = mocks.slackCredentials
    const configured = Boolean(stored?.appToken && stored.userToken)
    return {
      provider: 'slack',
      endpoint: {
        baseUrl: stored?.baseUrl ?? 'https://slack.com/api',
        authority: stored?.trustedCustomAuthority ?? 'slack.com',
        trust: stored?.trustedCustomAuthority
          ? { kind: 'custom', authority: stored.trustedCustomAuthority }
          : { kind: 'default' }
      },
      readiness: {
        configured,
        verified: configured && stored?.verification !== null,
        sendReady: false,
        receiveReady: false,
        verifiedAt: stored?.verification?.verifiedAt ?? null,
        lastError: stored?.lastError ?? null
      },
      appTokenStored: stored?.appToken !== null && stored !== null,
      userTokenStored: stored?.userToken !== null && stored !== null,
      workspace: stored?.verification?.workspace ?? null
    }
  }),
  emptySlackCommunicationStatus: vi.fn((lastError = null) => ({
    provider: 'slack',
    endpoint: {
      baseUrl: 'https://slack.com/api',
      authority: 'slack.com',
      trust: { kind: 'default' }
    },
    readiness: {
      configured: false,
      verified: false,
      sendReady: false,
      receiveReady: false,
      verifiedAt: null,
      lastError
    },
    appTokenStored: false,
    userTokenStored: false,
    workspace: null
  })),
  saveSlackCommunicationCredentials: mocks.saveSlackCredentials,
  saveSlackCommunicationVerification: vi.fn(
    (workspace: SlackCommunicationWorkspace, verifiedAt: string) => {
      if (!mocks.slackCredentials) {
        throw new Error('missing Slack credentials')
      }
      mocks.slackCredentials = {
        ...mocks.slackCredentials,
        verification: { verifiedAt, workspace },
        lastError: null
      }
      return mocks.slackCredentials
    }
  ),
  saveSlackCommunicationError: vi.fn((lastError: CommunicationIntegrationRedactedError) => {
    if (!mocks.slackCredentials) {
      return null
    }
    mocks.slackCredentials = { ...mocks.slackCredentials, verification: null, lastError }
    return mocks.slackCredentials
  }),
  clearSlackCommunicationCredentials: vi.fn(() => {
    mocks.slackCredentials = null
  })
}))

vi.mock('./z-api-communication-credential-store', () => ({
  readZApiCommunicationCredentials: vi.fn(() => mocks.zApiCredentials),
  getZApiCommunicationStatus: vi.fn(() => {
    const stored = mocks.zApiCredentials
    const configured = Boolean(stored?.instanceId && stored.instanceToken && stored.clientToken)
    return {
      provider: 'z-api',
      endpoint: {
        baseUrl: stored?.baseUrl ?? 'https://api.z-api.io',
        authority: stored?.trustedCustomAuthority ?? 'api.z-api.io',
        trust: stored?.trustedCustomAuthority
          ? { kind: 'custom', authority: stored.trustedCustomAuthority }
          : { kind: 'default' }
      },
      readiness: {
        configured,
        verified: configured && stored?.verification !== null,
        sendReady: false,
        receiveReady: false,
        verifiedAt: stored?.verification?.verifiedAt ?? null,
        lastError: stored?.lastError ?? null
      },
      instanceId: stored?.instanceId ?? null,
      instanceTokenStored: stored?.instanceToken !== null && stored !== null,
      clientTokenStored: stored?.clientToken !== null && stored !== null,
      instanceConnected: stored?.verification?.connected ?? null
    }
  }),
  emptyZApiCommunicationStatus: vi.fn((lastError = null) => ({
    provider: 'z-api',
    endpoint: {
      baseUrl: 'https://api.z-api.io',
      authority: 'api.z-api.io',
      trust: { kind: 'default' }
    },
    readiness: {
      configured: false,
      verified: false,
      sendReady: false,
      receiveReady: false,
      verifiedAt: null,
      lastError
    },
    instanceId: null,
    instanceTokenStored: false,
    clientTokenStored: false,
    instanceConnected: null
  })),
  saveZApiCommunicationCredentials: mocks.saveZApiCredentials,
  saveZApiCommunicationVerification: vi.fn((connected: boolean, verifiedAt: string) => {
    if (!mocks.zApiCredentials) {
      throw new Error('missing Z-API credentials')
    }
    mocks.zApiCredentials = {
      ...mocks.zApiCredentials,
      verification: { verifiedAt, connected },
      lastError: null
    }
    return mocks.zApiCredentials
  }),
  saveZApiCommunicationError: vi.fn((lastError: CommunicationIntegrationRedactedError) => {
    if (!mocks.zApiCredentials) {
      return null
    }
    mocks.zApiCredentials = { ...mocks.zApiCredentials, verification: null, lastError }
    return mocks.zApiCredentials
  }),
  clearZApiCommunicationCredentials: vi.fn(() => {
    mocks.zApiCredentials = null
  })
}))

vi.mock('./slack-communication-probe', () => ({
  probeSlackCommunicationIntegration: mocks.probeSlack
}))

vi.mock('./z-api-communication-probe', () => ({
  probeZApiCommunicationIntegration: mocks.probeZApi
}))

import { CommunicationApiError } from './communication-api-endpoint'
import {
  clearCommunicationIntegration,
  COMMUNICATION_INTEGRATION_REGISTRY,
  getCommunicationIntegrationStatuses,
  saveCommunicationIntegration,
  testCommunicationIntegration
} from './communication-integration-registry'

describe('communication integration registry', () => {
  beforeEach(() => {
    vi.useRealTimers()
    mocks.discordCredentials = null
    mocks.discordSnapshot = { connection: 'disconnected', lastError: null, failureKind: null }
    mocks.slackCredentials = null
    mocks.zApiCredentials = null
    mocks.reconnectDiscordVoiceService.mockReset()
    mocks.stopDiscordVoiceService.mockReset()
    mocks.probeSlack.mockReset()
    mocks.probeZApi.mockReset()
    mocks.saveSlackCredentials.mockReset()
    mocks.saveZApiCredentials.mockReset()
    mocks.saveSlackCredentials.mockImplementation((params) => {
      const input = params as {
        baseUrl: string
        trustedCustomAuthority: string | null
        appToken: CommunicationSecretMutation
        userToken: CommunicationSecretMutation
      }
      mocks.slackCredentials = {
        version: 1,
        provider: 'slack',
        appToken: mutate(mocks.slackCredentials?.appToken ?? null, input.appToken),
        userToken: mutate(mocks.slackCredentials?.userToken ?? null, input.userToken),
        baseUrl: input.baseUrl,
        trustedCustomAuthority: input.trustedCustomAuthority,
        verification: null,
        lastError: null
      }
      return mocks.slackCredentials
    })
    mocks.saveZApiCredentials.mockImplementation((params) => {
      const input = params as {
        baseUrl: string
        trustedCustomAuthority: string | null
        instanceId: string
        instanceToken: CommunicationSecretMutation
        clientToken: CommunicationSecretMutation
      }
      mocks.zApiCredentials = {
        version: 1,
        provider: 'z-api',
        instanceId: input.instanceId,
        instanceToken: mutate(mocks.zApiCredentials?.instanceToken ?? null, input.instanceToken),
        clientToken: mutate(mocks.zApiCredentials?.clientToken ?? null, input.clientToken),
        baseUrl: input.baseUrl,
        trustedCustomAuthority: input.trustedCustomAuthority,
        verification: null,
        lastError: null
      }
      return mocks.zApiCredentials
    })
  })

  it('is closed and exhaustive for the three providers', () => {
    expect(Object.keys(COMMUNICATION_INTEGRATION_REGISTRY)).toEqual(['discord', 'slack', 'z-api'])
    expect(
      Object.values(COMMUNICATION_INTEGRATION_REGISTRY).map(({ provider }) => provider)
    ).toEqual(['discord', 'slack', 'z-api'])
  })

  it('derives Discord readiness from the live snapshot and clears through the adapter', async () => {
    mocks.discordCredentials = {
      clientId: '12345678901234567',
      clientSecret: 'secret',
      refreshToken: null
    }
    mocks.discordSnapshot.connection = 'connected'
    const status = (await getCommunicationIntegrationStatuses())[0]
    expect(status).toMatchObject({
      provider: 'discord',
      readiness: { configured: true, verified: true, sendReady: true, receiveReady: true },
      clientId: '12345678901234567',
      clientSecretStored: true
    })
    expect(JSON.stringify(status)).not.toContain('secret')
    await clearCommunicationIntegration('discord')
    expect(mocks.stopDiscordVoiceService).toHaveBeenCalledOnce()
  })

  it.each([
    {
      failureKind: 'authentication' as const,
      code: 'unauthorized',
      message: 'Discord rejected the credentials.'
    },
    {
      failureKind: 'provider_unavailable' as const,
      code: 'provider_unavailable',
      message: 'Discord RPC is unavailable.'
    }
  ])('redacts Discord $failureKind failures for integration status', async (testCase) => {
    mocks.discordCredentials = {
      clientId: '12345678901234567',
      clientSecret: 'sensitive-secret',
      refreshToken: null
    }
    mocks.discordSnapshot.lastError = 'provider detail containing sensitive-secret'
    mocks.discordSnapshot.failureKind = testCase.failureKind

    const status = (await getCommunicationIntegrationStatuses())[0]

    expect(status.readiness.lastError).toEqual({
      code: testCase.code,
      message: testCase.message,
      field: null
    })
    expect(JSON.stringify(status)).not.toContain('sensitive-secret')
  })

  it('saves normalized custom Slack endpoint trust without testing the network', async () => {
    const result = await saveCommunicationIntegration({
      provider: 'slack',
      baseUrl: ' https://Gateway.Example.com/slack/ ',
      endpointTrust: { kind: 'custom', authority: 'gateway.example.com' },
      appToken: { action: 'replace', value: 'xapp-secret' },
      userToken: { action: 'replace', value: 'xoxp-secret' }
    })
    expect(result.ok).toBe(true)
    expect(mocks.saveSlackCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: 'https://gateway.example.com/slack',
        trustedCustomAuthority: 'gateway.example.com'
      })
    )
    expect(mocks.probeSlack).not.toHaveBeenCalled()
  })

  it('rejects an unconfirmed custom endpoint without persisting credentials', async () => {
    const result = await saveCommunicationIntegration({
      provider: 'z-api',
      baseUrl: 'https://gateway.example.com/z-api',
      endpointTrust: { kind: 'default' },
      instanceId: 'instance-1',
      instanceToken: { action: 'replace', value: 'instance-token' },
      clientToken: { action: 'replace', value: 'client-token' }
    })
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'endpoint_confirmation_required', field: 'baseUrl' }
    })
    expect(mocks.saveZApiCredentials).not.toHaveBeenCalled()
  })

  it('verifies Slack while keeping send and receive readiness disabled', async () => {
    mocks.slackCredentials = {
      version: 1,
      provider: 'slack',
      appToken: 'xapp-secret',
      userToken: 'xoxp-secret',
      baseUrl: 'https://slack.com/api',
      trustedCustomAuthority: null,
      verification: null,
      lastError: null
    }
    mocks.probeSlack.mockResolvedValue({
      workspace: { teamId: 'T1', teamName: 'Team', userId: 'U1', userName: 'User' }
    })
    const result = await testCommunicationIntegration('slack')
    expect(result).toMatchObject({
      ok: true,
      status: {
        provider: 'slack',
        readiness: { configured: true, verified: true, sendReady: false, receiveReady: false },
        workspace: { teamId: 'T1' }
      }
    })
    expect(JSON.stringify(result)).not.toContain('xapp-secret')
    expect(JSON.stringify(result)).not.toContain('xoxp-secret')
  })

  it('treats a disconnected Z-API instance as a successful verification', async () => {
    mocks.zApiCredentials = {
      version: 1,
      provider: 'z-api',
      instanceId: 'instance-1',
      instanceToken: 'instance-token',
      clientToken: 'client-token',
      baseUrl: 'https://api.z-api.io',
      trustedCustomAuthority: null,
      verification: null,
      lastError: null
    }
    mocks.probeZApi.mockResolvedValue({ instanceConnected: false })
    const result = await testCommunicationIntegration('z-api')
    expect(result).toMatchObject({
      ok: true,
      status: {
        readiness: { verified: true, sendReady: false, receiveReady: false },
        instanceConnected: false
      }
    })
  })

  it('persists only a redacted provider error after a failed test', async () => {
    mocks.slackCredentials = {
      version: 1,
      provider: 'slack',
      appToken: 'xapp-sensitive',
      userToken: 'xoxp-sensitive',
      baseUrl: 'https://slack.com/api',
      trustedCustomAuthority: null,
      verification: null,
      lastError: null
    }
    mocks.probeSlack.mockRejectedValue(
      new CommunicationApiError('unauthorized', 'Slack rejected the credentials.')
    )
    const result = await testCommunicationIntegration('slack')
    expect(result).toMatchObject({ ok: false, error: { code: 'unauthorized' } })
    expect(JSON.stringify(result)).not.toContain('xapp-sensitive')
    expect(JSON.stringify(result)).not.toContain('xoxp-sensitive')
    expect(mocks.slackCredentials?.lastError).toEqual({
      code: 'unauthorized',
      message: 'Slack rejected the credentials.',
      field: null
    })
  })

  it('tests Discord by reconnecting and reading live connected state', async () => {
    mocks.discordCredentials = {
      clientId: '12345678901234567',
      clientSecret: 'secret',
      refreshToken: null
    }
    mocks.reconnectDiscordVoiceService.mockImplementation(() => {
      mocks.discordSnapshot.connection = 'connected'
    })
    const result = await testCommunicationIntegration('discord')
    expect(result).toMatchObject({ ok: true, status: { readiness: { verified: true } } })
    expect(mocks.reconnectDiscordVoiceService).toHaveBeenCalledOnce()
  })
})
