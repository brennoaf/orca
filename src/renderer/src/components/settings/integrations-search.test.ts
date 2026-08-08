import { describe, expect, it } from 'vitest'
import { COMMUNICATION_INTEGRATION_SECTION_IDS } from '../../../../shared/communication-integrations'
import { getIntegrationsPaneSearchEntries } from './integrations-search'

describe('communications integration search', () => {
  it('targets all three provider cards and includes endpoint and transport terms', () => {
    const entries = getIntegrationsPaneSearchEntries()
    const communicationEntries = entries.filter((entry) =>
      entry.targetSectionId?.startsWith('integrations-communications-')
    )

    expect(communicationEntries.map((entry) => entry.targetSectionId)).toEqual([
      COMMUNICATION_INTEGRATION_SECTION_IDS.discord,
      COMMUNICATION_INTEGRATION_SECTION_IDS.slack,
      COMMUNICATION_INTEGRATION_SECTION_IDS['z-api']
    ])
    expect(communicationEntries.find((entry) => entry.title.includes('Slack'))?.keywords).toContain(
      'Socket Mode'
    )
    expect(communicationEntries.find((entry) => entry.title.includes('Z-API'))?.keywords).toContain(
      'WhatsApp'
    )
    expect(communicationEntries.flatMap((entry) => entry.keywords)).toContain('endpoint')
  })
})
