import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { COMMUNICATION_INTEGRATION_SECTION_IDS } from '../../../../../shared/communication-integrations'
import { emptyDiscordVoiceSnapshot } from '../../../../../shared/discord-voice'
import {
  COMMUNICATION_MANAGER_REGISTRY,
  getDiscordCommunicationStatus,
  getDiscordPopoverState,
  getCommunicationSettingsTarget,
  listEnabledCommunicationManagers
} from './communication-managers'

describe('communication managers', () => {
  it('follows catalog order and renders no entries when every app is disabled', () => {
    expect(listEnabledCommunicationManagers(undefined).map(({ app }) => app.id)).toEqual([
      'whatsapp-web',
      'slack',
      'discord'
    ])
    expect(
      listEnabledCommunicationManagers({
        'whatsapp-web': {
          enabled: false,
          sessionProfileIdOverride: null,
          dedicatedSessionProfileId: null
        },
        slack: {
          enabled: false,
          sessionProfileIdOverride: null,
          dedicatedSessionProfileId: null
        },
        discord: {
          enabled: false,
          sessionProfileIdOverride: null,
          dedicatedSessionProfileId: null
        }
      })
    ).toEqual([])
  })

  it('uses the active status only for a non-null channel id', () => {
    expect(
      getDiscordCommunicationStatus(emptyDiscordVoiceSnapshot({ credentialsConfigured: false }))
    ).toEqual({ kind: 'setup' })
    expect(
      getDiscordCommunicationStatus(
        emptyDiscordVoiceSnapshot({ credentialsConfigured: true, connection: 'connecting' })
      )
    ).toEqual({ kind: 'idle' })
    expect(
      getDiscordCommunicationStatus(
        emptyDiscordVoiceSnapshot({
          credentialsConfigured: true,
          connection: 'disconnected',
          lastError: 'Discord unavailable'
        })
      )
    ).toEqual({ kind: 'idle' })
    expect(
      getDiscordCommunicationStatus(
        emptyDiscordVoiceSnapshot({ credentialsConfigured: true, connection: 'connected' })
      )
    ).toEqual({ kind: 'idle' })
    expect(
      getDiscordCommunicationStatus(
        emptyDiscordVoiceSnapshot({ credentialsConfigured: false, channelId: 'voice-1' })
      )
    ).toEqual({ kind: 'active' })
  })

  it('maps the five specified Discord snapshots to their popover states', () => {
    expect(getDiscordPopoverState(emptyDiscordVoiceSnapshot())).toBe('setup')
    expect(
      getDiscordPopoverState(
        emptyDiscordVoiceSnapshot({ credentialsConfigured: true, connection: 'connecting' })
      )
    ).toBe('connecting')
    expect(
      getDiscordPopoverState(
        emptyDiscordVoiceSnapshot({
          credentialsConfigured: true,
          lastError: 'Discord unavailable'
        })
      )
    ).toBe('error')
    expect(
      getDiscordPopoverState(
        emptyDiscordVoiceSnapshot({ credentialsConfigured: true, connection: 'connected' })
      )
    ).toBe('idle')
    expect(
      getDiscordPopoverState(
        emptyDiscordVoiceSnapshot({ credentialsConfigured: true, channelId: 'voice-1' })
      )
    ).toBe('active')
  })

  it('deep-links every provider popover to its Integrations card', () => {
    expect(getCommunicationSettingsTarget('discord')).toEqual({
      pane: 'integrations',
      repoId: null,
      sectionId: COMMUNICATION_INTEGRATION_SECTION_IDS.discord
    })
    expect(getCommunicationSettingsTarget('slack').sectionId).toBe(
      COMMUNICATION_INTEGRATION_SECTION_IDS.slack
    )
    expect(getCommunicationSettingsTarget('z-api').sectionId).toBe(
      COMMUNICATION_INTEGRATION_SECTION_IDS['z-api']
    )
  })

  it('keeps Slack and Z-API unavailable without send UI and explains the relay gap', () => {
    const renderPresentation = (id: 'slack' | 'whatsapp-web'): string => {
      const props = {
        isPopoverOpen: false,
        children: (presentation: { content: React.ReactNode }) => presentation.content
      }
      return renderToStaticMarkup(
        createElement(COMMUNICATION_MANAGER_REGISTRY[id].Presentation, props)
      )
    }

    const slack = renderPresentation('slack')
    const zApi = renderPresentation('whatsapp-web')

    expect(slack).toContain(
      'Configure Slack credentials in Integrations. Socket Mode transport is not active yet.'
    )
    expect(zApi).toContain('Configure Z-API credentials and endpoint in Integrations.')
    expect(zApi).toContain('external public HTTPS relay')
    expect(`${slack}${zApi}`).not.toMatch(/send|composer|unread/i)
  })
})
