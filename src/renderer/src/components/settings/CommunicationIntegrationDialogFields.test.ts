import { describe, expect, it } from 'vitest'
import {
  getCommunicationEndpointAuthority,
  getCommunicationEndpointTrust,
  getCommunicationSecretMutation
} from './CommunicationIntegrationDialogFields'

describe('communication integration dialog drafts', () => {
  it('keeps, replaces, and explicitly clears stored secrets without exposing a saved value', () => {
    expect(getCommunicationSecretMutation('', false)).toEqual({ action: 'keep' })
    expect(getCommunicationSecretMutation('replacement', false)).toEqual({
      action: 'replace',
      value: 'replacement'
    })
    expect(getCommunicationSecretMutation('', true)).toEqual({ action: 'clear' })
  })

  it('uses default trust for the provider authority and custom trust for another authority', () => {
    expect(getCommunicationEndpointAuthority('https://SLACK.COM.:443/api/')).toBe('slack.com')
    expect(
      getCommunicationEndpointTrust('https://SLACK.COM.:443/api/', 'https://slack.com/api')
    ).toEqual({ kind: 'default' })
    expect(
      getCommunicationEndpointTrust('https://slack.example.test/api', 'https://slack.com/api')
    ).toEqual({ kind: 'custom', authority: 'slack.example.test' })
  })

  it('rejects endpoint shapes that the main process rejects before enabling save', () => {
    expect(getCommunicationEndpointAuthority('http://slack.example.test/api')).toBeNull()
    expect(getCommunicationEndpointAuthority('/api')).toBeNull()
    expect(getCommunicationEndpointAuthority('https://user@slack.example.test/api')).toBeNull()
    expect(getCommunicationEndpointAuthority('https://user:pass@slack.example.test/api')).toBeNull()
    expect(
      getCommunicationEndpointAuthority('https://slack.example.test/api?token=value')
    ).toBeNull()
    expect(getCommunicationEndpointAuthority('https://slack.example.test/api#token')).toBeNull()
    expect(getCommunicationEndpointTrust('/api', 'https://slack.com/api')).toBeNull()
  })

  it('canonicalizes IPv6 and explicit ports without changing path acceptance', () => {
    expect(getCommunicationEndpointAuthority('https://[2001:DB8::1]:8443/api///')).toBe(
      '[2001:db8::1]:8443'
    )
    expect(getCommunicationEndpointAuthority('https://[2001:db8::1]:443/')).toBe('[2001:db8::1]')
  })
})
