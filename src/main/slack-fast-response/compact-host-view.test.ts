import { describe, expect, it } from 'vitest'
import { isSlackNavigationUrl } from './compact-host-view'

describe('Slack navigation allowlist', () => {
  it('allows Slack workspace and required identity-provider hosts over HTTPS only', () => {
    expect(isSlackNavigationUrl('https://app.slack.com/client')).toBe(true)
    expect(isSlackNavigationUrl('https://esportesdasortecom.slack.com/client')).toBe(true)
    expect(isSlackNavigationUrl('https://files.slack.com/files-pri/T1')).toBe(true)
    expect(isSlackNavigationUrl('https://login.microsoftonline.com/common/oauth2/authorize')).toBe(
      true
    )
    expect(isSlackNavigationUrl('http://app.slack.com/client')).toBe(false)
    expect(isSlackNavigationUrl('javascript:alert(1)')).toBe(false)
    expect(isSlackNavigationUrl('file:///C:/workspace')).toBe(false)
    expect(isSlackNavigationUrl('https://evilslack.com')).toBe(false)
    expect(isSlackNavigationUrl('https://slack.com.evil.tld')).toBe(false)
    expect(isSlackNavigationUrl('https://example.com')).toBe(false)
  })
})
