const { createHash } = require('node:crypto')
const { readFileSync, realpathSync, statSync } = require('node:fs')
const { isAbsolute, join, relative, resolve } = require('node:path')

const names = ['browser-window-close-preload', 'discord-web-fast-response-preload']
const sha256Pattern = /^[a-f0-9]{64}$/

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function readManifest(root) {
  let value
  try {
    value = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
  } catch (error) {
    throw new Error('sandbox_preload_packaging_manifest_unreadable', { cause: error })
  }
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['entries', 'generation', 'version']) ||
    value.version !== 1 ||
    typeof value.generation !== 'string' ||
    !sha256Pattern.test(value.generation) ||
    !isRecord(value.entries) ||
    Object.keys(value.entries).sort().join(',') !== names.join(',')
  ) {
    throw new Error('sandbox_preload_packaging_manifest_invalid')
  }
  for (const name of names) {
    const entry = value.entries[name]
    if (
      !isRecord(entry) ||
      !hasExactKeys(entry, ['file', 'sha256']) ||
      entry.file !== `generations/${value.generation}/${name}.js` ||
      typeof entry.sha256 !== 'string' ||
      !sha256Pattern.test(entry.sha256)
    ) {
      throw new Error(`sandbox_preload_packaging_entry_invalid:${name}`)
    }
  }
  return value
}

function validateEntry(root, entry, name) {
  const candidate = resolve(root, ...entry.file.split('/'))
  let rootReal
  let candidateReal
  try {
    rootReal = realpathSync(root)
    candidateReal = realpathSync(candidate)
  } catch (error) {
    throw new Error(`sandbox_preload_packaging_file_missing:${name}`, { cause: error })
  }
  const traversal = relative(rootReal, candidateReal)
  if (
    !traversal ||
    traversal.startsWith('..') ||
    isAbsolute(traversal) ||
    !statSync(candidateReal).isFile()
  ) {
    throw new Error(`sandbox_preload_packaging_file_invalid:${name}`)
  }
  const actual = createHash('sha256').update(readFileSync(candidateReal)).digest('hex')
  if (actual !== entry.sha256) {
    throw new Error(`sandbox_preload_packaging_hash_mismatch:${name}`)
  }
}

function resolveSandboxPreloadPackagingFileSet(projectDir) {
  const root = resolve(projectDir, 'out', 'sandbox-preload')
  const manifest = readManifest(root)
  for (const name of names) {
    validateEntry(root, manifest.entries[name], name)
  }
  return {
    from: 'out/sandbox-preload',
    to: 'out/sandbox-preload',
    filter: ['manifest.json', ...names.map((name) => manifest.entries[name].file)]
  }
}

function applySandboxPreloadPackagingFileSet(config, projectDir) {
  const fileSet = resolveSandboxPreloadPackagingFileSet(projectDir)
  const current = Array.isArray(config.files) ? config.files : []
  config.files = current.filter(
    (entry) => !isRecord(entry) || entry.from !== fileSet.from || entry.to !== fileSet.to
  )
  config.files.push(fileSet)
  return fileSet
}

module.exports = {
  applySandboxPreloadPackagingFileSet,
  resolveSandboxPreloadPackagingFileSet
}
