import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const electronBuilderConfig = require('../electron-builder.config.cjs')
const packageJson = require('../../package.json')

describe('Spotify Windows media control packaging', () => {
  it('ships the compiled addon as a Windows native resource', () => {
    expect(electronBuilderConfig.win.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'native/windows-media-control/build/Release/windows_media_control.node',
          to: 'native/windows-media-control.node'
        })
      ])
    )
  })

  it('builds the Windows native addon exactly once before packaging', () => {
    const commands = packageJson.scripts['build:win'].split(' && ')
    const nativeBuild = 'pnpm run build:native'
    const packageBuild = 'electron-builder --config config/electron-builder.config.cjs --win'
    expect(commands.filter((command) => command === nativeBuild)).toHaveLength(1)
    expect(commands.indexOf(nativeBuild)).toBeGreaterThan(
      commands.indexOf('pnpm run build:desktop')
    )
    expect(commands.indexOf(nativeBuild)).toBeLessThan(commands.indexOf(packageBuild))

    const nativeBuildSource = readFileSync(
      new URL('./build-native-for-platform.mjs', import.meta.url),
      'utf8'
    )
    expect(nativeBuildSource.match(/build-windows-media-control\.mjs/g)).toHaveLength(1)
  })
})
