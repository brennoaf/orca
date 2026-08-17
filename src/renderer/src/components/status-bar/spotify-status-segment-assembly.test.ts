import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Spotify status segment assembly', () => {
  it('places Spotify immediately before resource usage without changing App.tsx', () => {
    const statusBar = readFileSync(resolve(__dirname, 'StatusBar.tsx'), 'utf8')
    const spotify = statusBar.indexOf('<SpotifyStatusSegment')
    const resource = statusBar.indexOf('<ResourceUsageStatusSegment', spotify)
    expect(spotify).toBeGreaterThan(-1)
    expect(resource).toBeGreaterThan(spotify)
    expect(statusBar.slice(spotify + 1, resource)).not.toContain('<SpotifyStatusSegment')
    expect(readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8')).not.toContain(
      'SpotifyStatusSegment'
    )
  })

  it('keeps fixed transport controls visible and uses keyboard-managed menu items', () => {
    const segment = readFileSync(resolve(__dirname, 'SpotifyStatusSegment.tsx'), 'utf8')
    const statusBar = readFileSync(resolve(__dirname, 'StatusBar.tsx'), 'utf8')
    expect(segment).toContain('inline-flex shrink-0 items-center gap-1')
    expect(segment).toContain('<DropdownMenuItem')
    expect(segment).toContain('event.preventDefault()')
    expect(segment).toContain('modal={false}')
    expect(statusBar).toContain('flex min-w-0 items-center gap-3 overflow-hidden')
  })

  it('does not mount Spotify settings or the removed Web API client state', () => {
    const integrations = readFileSync(
      resolve(__dirname, '../settings/IntegrationsPane.tsx'),
      'utf8'
    )
    expect(integrations).not.toContain('SpotifyIntegrationSection')
    expect(integrations).not.toContain('spotifyPlayback.configure')
    expect(integrations).not.toContain('spotifyPlayback.connect')
  })
})
