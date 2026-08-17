#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

if (process.platform !== 'win32') {
  throw new Error('Windows media control compilation requires a Windows host.')
}

const require = createRequire(import.meta.url)
const rebuildRequire = createRequire(require.resolve('@electron/rebuild'))
const nodeGyp = rebuildRequire.resolve('node-gyp/bin/node-gyp.js')
const addonRoot = resolve(import.meta.dirname, '../../native/windows-media-control')
const architecture = process.env.npm_config_arch ?? process.arch
if (architecture !== 'x64' && architecture !== 'arm64') {
  throw new Error(`Unsupported Windows media control architecture: ${architecture}`)
}

const result = spawnSync(
  process.execPath,
  [nodeGyp, 'rebuild', '--directory', addonRoot, '--arch', architecture],
  { stdio: 'inherit' }
)
if (result.signal) {
  process.kill(process.pid, result.signal)
}
if (result.error) {
  throw result.error
}
if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
