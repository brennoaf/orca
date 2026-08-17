import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../messaging/communication-integration-registry', () => ({
  clearCommunicationIntegration: vi.fn(),
  getCommunicationIntegrationStatuses: vi.fn(),
  saveCommunicationIntegration: vi.fn(),
  testCommunicationIntegration: vi.fn()
}))

import { COMMUNICATION_INTEGRATION_METHODS } from './communication-integrations'

function method(name: string) {
  const candidate = COMMUNICATION_INTEGRATION_METHODS.find((entry) => entry.name === name)
  if (!candidate) {
    throw new Error(`Missing RPC method: ${name}`)
  }
  return candidate
}

describe('communication integration RPC schemas', () => {
  it('accepts Discord credentials and rejects the removed Slack API configuration', () => {
    const schema = method('communicationIntegrations.save').params

    expect(
      schema?.safeParse({
        provider: 'discord',
        clientId: '12345678901234567',
        clientSecret: { action: 'keep' }
      }).success
    ).toBe(true)
    expect(
      schema?.safeParse({
        provider: 'slack',
        baseUrl: 'https://slack.com/api',
        endpointTrust: { kind: 'default' },
        appToken: { action: 'keep' },
        userToken: { action: 'keep' }
      }).success
    ).toBe(false)
  })

  it.each(['communicationIntegrations.clear', 'communicationIntegrations.test'])(
    'rejects Slack as a credential provider for %s',
    (name) => {
      expect(method(name).params?.safeParse({ provider: 'discord' }).success).toBe(true)
      expect(method(name).params?.safeParse({ provider: 'slack' }).success).toBe(false)
    }
  )
})
