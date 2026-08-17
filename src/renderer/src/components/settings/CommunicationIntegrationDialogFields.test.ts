import { describe, expect, it } from 'vitest'
import { getCommunicationSecretMutation } from './CommunicationIntegrationDialogFields'

describe('communication integration dialog drafts', () => {
  it('keeps, replaces, and explicitly clears stored secrets without exposing a saved value', () => {
    expect(getCommunicationSecretMutation('', false)).toEqual({ action: 'keep' })
    expect(getCommunicationSecretMutation('replacement', false)).toEqual({
      action: 'replace',
      value: 'replacement'
    })
    expect(getCommunicationSecretMutation('', true)).toEqual({ action: 'clear' })
  })
})
