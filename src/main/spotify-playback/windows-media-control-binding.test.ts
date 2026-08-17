import { describe, expect, it, vi } from 'vitest'
import {
  loadWindowsMediaControlBindingFrom,
  resolveWindowsMediaControlBindingPath,
  type WindowsMediaControlBinding
} from './windows-media-control-binding'

function binding(): WindowsMediaControlBinding {
  return {
    listSessions: vi.fn(async () => []),
    audioPeak: vi.fn(async () => null),
    previous: vi.fn(async () => true),
    togglePlayPause: vi.fn(async () => true),
    next: vi.fn(async () => true)
  }
}

describe('Windows media control binding', () => {
  it('resolves development and packaged addon paths', () => {
    expect(
      resolveWindowsMediaControlBindingPath({
        packaged: false,
        resourcesPath: 'C:\\resources',
        projectRoot: 'C:\\orca'
      })
    ).toBe('C:\\orca\\native\\windows-media-control\\build\\Release\\windows_media_control.node')
    expect(
      resolveWindowsMediaControlBindingPath({
        packaged: true,
        resourcesPath: 'C:\\resources',
        projectRoot: 'C:\\orca'
      })
    ).toBe('C:\\resources\\native\\windows-media-control.node')
  })

  it('loads only a complete Windows binding from an existing artifact', () => {
    const native = binding()
    const load = vi.fn(() => native)
    expect(
      loadWindowsMediaControlBindingFrom({
        platform: 'win32',
        packaged: false,
        resourcesPath: '',
        projectRoot: 'C:\\orca',
        exists: () => true,
        load
      })
    ).toBe(native)
    expect(load).toHaveBeenCalledWith(
      'C:\\orca\\native\\windows-media-control\\build\\Release\\windows_media_control.node'
    )
    expect(
      loadWindowsMediaControlBindingFrom({
        platform: 'linux',
        packaged: false,
        resourcesPath: '',
        projectRoot: '/orca',
        exists: () => true,
        load
      })
    ).toBeNull()
    expect(
      loadWindowsMediaControlBindingFrom({
        platform: 'win32',
        packaged: false,
        resourcesPath: '',
        projectRoot: 'C:\\orca',
        exists: () => false,
        load
      })
    ).toBeNull()
  })

  it('rejects an incomplete native module', () => {
    expect(() =>
      loadWindowsMediaControlBindingFrom({
        platform: 'win32',
        packaged: false,
        resourcesPath: '',
        projectRoot: 'C:\\orca',
        exists: () => true,
        load: () => ({ listSessions: async () => [] })
      })
    ).toThrow('Invalid Windows media control binding')
  })
})
