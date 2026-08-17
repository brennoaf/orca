import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronBuilderConfig = require('../electron-builder.config.cjs')
const { FileMatcher } = require('app-builder-lib/out/fileMatcher')
const { resolveSandboxPreloadPackagingFileSet } = require('./sandbox-preload-packaging.cjs')
const names = ['browser-window-close-preload', 'discord-web-fast-response-preload']
const temporaryDirectories = []

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function temporaryProject() {
  const project = mkdtempSync(join(tmpdir(), 'orca-sandbox-packaging-'))
  temporaryDirectories.push(project)
  return project
}

function writePublication(project) {
  const root = join(project, 'out', 'sandbox-preload')
  const codeByName = Object.fromEntries(names.map((name) => [name, `${name}:active`]))
  const generation = sha256(names.map((name) => `${name}:${sha256(codeByName[name])}`).join('|'))
  const entries = Object.fromEntries(
    names.map((name) => [
      name,
      {
        file: `generations/${generation}/${name}.js`,
        sha256: sha256(codeByName[name])
      }
    ])
  )
  for (const name of names) {
    const file = join(root, ...entries[name].file.split('/'))
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, codeByName[name])
  }
  writeFileSync(join(root, 'manifest.json'), JSON.stringify({ entries, generation, version: 1 }))
  return { entries, generation, root }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('sandbox preload packaging contract', () => {
  it('derives a fail-closed active-only file set at beforePack', async () => {
    const project = temporaryProject()
    const publication = writePublication(project)
    const orphan = join(publication.root, 'generations', 'b'.repeat(64), 'orphan.js')
    mkdirSync(join(orphan, '..'), { recursive: true })
    writeFileSync(orphan, 'orphan')
    mkdirSync(join(publication.root, '.staging-live'), { recursive: true })
    mkdirSync(join(publication.root, 'leases', publication.generation), { recursive: true })
    writeFileSync(join(publication.root, '.publish.lock'), '{}')
    writeFileSync(join(publication.root, '.manifest-temp.json'), '{}')
    const config = { files: [...electronBuilderConfig.files] }

    await electronBuilderConfig.beforePack({
      packager: { info: { config, projectDir: project } }
    })

    const fileSet = config.files.find(
      (entry) => entry && typeof entry === 'object' && entry.from === 'out/sandbox-preload'
    )
    expect(fileSet).toEqual({
      from: 'out/sandbox-preload',
      to: 'out/sandbox-preload',
      filter: ['manifest.json', ...names.map((name) => publication.entries[name].file)]
    })
    const matcher = new FileMatcher(
      publication.root,
      '/dest/out/sandbox-preload',
      (value) => value,
      fileSet.filter
    )
    const packs = matcher.createFilter()
    const mainMatcher = new FileMatcher(
      project,
      '/dest',
      (value) => value,
      config.files.filter((entry) => typeof entry === 'string')
    )
    mainMatcher.prependPattern('**/*')
    const mainPacks = mainMatcher.createFilter()
    const packed = [
      'manifest.json',
      ...names.map((name) => publication.entries[name].file),
      `generations/${'b'.repeat(64)}/orphan.js`,
      '.staging-live/browser-window-close-preload.js',
      `.manifest-temp.json`,
      '.publish.lock',
      `leases/${publication.generation}/${process.pid}-lease.json`
    ].filter((file) => {
      const absolute = join(publication.root, ...file.split('/'))
      const stat = { isDirectory: () => false }
      return mainPacks(absolute, stat) || packs(absolute, stat)
    })
    expect(packed).toEqual([
      'manifest.json',
      ...names.map((name) => publication.entries[name].file)
    ])
  })

  it('rejects missing generations and hash mismatches', () => {
    const missingProject = temporaryProject()
    const missing = writePublication(missingProject)
    rmSync(join(missing.root, ...missing.entries[names[0]].file.split('/')))
    expect(() => resolveSandboxPreloadPackagingFileSet(missingProject)).toThrow(
      `sandbox_preload_packaging_file_missing:${names[0]}`
    )

    const corruptProject = temporaryProject()
    const corrupt = writePublication(corruptProject)
    writeFileSync(join(corrupt.root, ...corrupt.entries[names[1]].file.split('/')), 'corrupt')
    expect(() => resolveSandboxPreloadPackagingFileSet(corruptProject)).toThrow(
      `sandbox_preload_packaging_hash_mismatch:${names[1]}`
    )
  })

  it('rejects a missing manifest and incomplete entries', () => {
    const missingProject = temporaryProject()
    expect(() => resolveSandboxPreloadPackagingFileSet(missingProject)).toThrow(
      'sandbox_preload_packaging_manifest_unreadable'
    )

    const incompleteProject = temporaryProject()
    const incomplete = writePublication(incompleteProject)
    const manifest = {
      entries: { [names[0]]: incomplete.entries[names[0]] },
      generation: incomplete.generation,
      version: 1
    }
    writeFileSync(join(incomplete.root, 'manifest.json'), JSON.stringify(manifest))
    expect(() => resolveSandboxPreloadPackagingFileSet(incompleteProject)).toThrow(
      'sandbox_preload_packaging_manifest_invalid'
    )
  })
})
