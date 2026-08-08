import { describe, expect, it } from 'vitest'
import { getFloatingWorkspaceDirectoryInputValue } from './FloatingWorkspacePane'
import { getFloatingWorkspaceSearchEntries } from './floating-workspace-search'

describe('getFloatingWorkspaceDirectoryInputValue', () => {
  it('shows home shorthand for the default terminal directory', () => {
    expect(
      getFloatingWorkspaceDirectoryInputValue({
        configuredFloatingWorkspacePath: '~',
        resolvedFloatingWorkspacePath: '/Users/example'
      })
    ).toBe('~')
  })

  it('shows home shorthand for legacy blank terminal directory settings', () => {
    expect(
      getFloatingWorkspaceDirectoryInputValue({
        configuredFloatingWorkspacePath: '',
        resolvedFloatingWorkspacePath: '/Users/example'
      })
    ).toBe('~')
  })

  it('shows the main-resolved trusted custom directory', () => {
    expect(
      getFloatingWorkspaceDirectoryInputValue({
        configuredFloatingWorkspacePath: '/Users/example/notes',
        resolvedFloatingWorkspacePath: '/Users/example/notes'
      })
    ).toBe('/Users/example/notes')
  })

  it('keeps communication app settings without Discord credentials or overlay search entries', () => {
    const entries = getFloatingWorkspaceSearchEntries()
    expect(entries.some((entry) => entry.title === 'Communications')).toBe(true)
    expect(entries.some((entry) => entry.title.includes('Discord Call Overlay'))).toBe(false)
    expect(entries.flatMap((entry) => entry.keywords)).not.toContain('client secret')
  })
})
