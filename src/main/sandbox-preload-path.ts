import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import {
  normalizeSandboxPreloadManifest,
  SANDBOX_PRELOAD_DIRECTORY,
  SANDBOX_PRELOAD_MANIFEST_FILE,
  SANDBOX_PRELOAD_NAMES,
  type SandboxPreloadManifest,
  type SandboxPreloadName
} from '../shared/sandbox-preload-manifest'
import {
  acquireSandboxPreloadGenerationLease,
  releaseSandboxPreloadGenerationLease
} from '../shared/sandbox-preload-generation-lease'
import {
  acquireSandboxPreloadPublicationLock,
  releaseSandboxPreloadPublicationLock,
  type SandboxPreloadPublicationLockOptions
} from '../shared/sandbox-preload-publication-lock'

export type AcquiredSandboxPreloadPath = {
  path: string
  release: () => void
}

export type AcquireSandboxPreloadPathOptions = {
  lock?: SandboxPreloadPublicationLockOptions
  retainGeneration?: boolean
}

export function resolveSandboxPreloadRoot(mainOutputDirectory: string): string {
  return resolve(mainOutputDirectory, '..', SANDBOX_PRELOAD_DIRECTORY)
}

function readSandboxPreloadManifest(
  root: string,
  name: SandboxPreloadName
): SandboxPreloadManifest {
  let value: unknown
  try {
    value = JSON.parse(readFileSync(join(root, SANDBOX_PRELOAD_MANIFEST_FILE), 'utf8'))
  } catch (error) {
    throw new Error(`sandbox_preload_manifest_unreadable:${name}`, { cause: error })
  }
  const manifest = normalizeSandboxPreloadManifest(value)
  if (!manifest) {
    throw new Error(`sandbox_preload_manifest_invalid:${name}`)
  }
  return manifest
}

export function resolveSandboxPreloadPath(
  mainOutputDirectory: string,
  name: SandboxPreloadName
): string {
  if (!SANDBOX_PRELOAD_NAMES.includes(name)) {
    throw new Error(`sandbox_preload_name_invalid:${name}`)
  }
  const root = resolveSandboxPreloadRoot(mainOutputDirectory)
  const manifest = readSandboxPreloadManifest(root, name)
  const entry = manifest.entries[name]
  if (!entry) {
    throw new Error(`sandbox_preload_entry_missing:${name}`)
  }
  const candidate = resolve(root, ...entry.file.split('/'))
  if (!existsSync(candidate)) {
    throw new Error(`sandbox_preload_file_missing:${name}`)
  }
  let rootReal: string
  let candidateReal: string
  try {
    rootReal = realpathSync(root)
    candidateReal = realpathSync(candidate)
  } catch (error) {
    throw new Error(`sandbox_preload_realpath_failed:${name}`, { cause: error })
  }
  const traversal = relative(rootReal, candidateReal)
  let file: ReturnType<typeof statSync>
  try {
    file = statSync(candidateReal)
  } catch (error) {
    throw new Error(`sandbox_preload_stat_failed:${name}`, { cause: error })
  }
  if (!traversal || traversal.startsWith('..') || isAbsolute(traversal) || !file.isFile()) {
    throw new Error(`sandbox_preload_file_outside_root:${name}`)
  }
  let source: Buffer
  try {
    source = readFileSync(candidateReal)
  } catch (error) {
    throw new Error(`sandbox_preload_read_failed:${name}`, { cause: error })
  }
  const sha256 = createHash('sha256').update(source).digest('hex')
  if (sha256 !== entry.sha256) {
    throw new Error(`sandbox_preload_hash_mismatch:${name}`)
  }
  return candidateReal
}

export function acquireSandboxPreloadPath(
  mainOutputDirectory: string,
  name: SandboxPreloadName,
  options: AcquireSandboxPreloadPathOptions = {}
): AcquiredSandboxPreloadPath {
  if (!options.retainGeneration) {
    return { path: resolveSandboxPreloadPath(mainOutputDirectory, name), release: () => {} }
  }
  const root = resolveSandboxPreloadRoot(mainOutputDirectory)
  resolveSandboxPreloadPath(mainOutputDirectory, name)
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const lock = acquireSandboxPreloadPublicationLock(root, options.lock)
    try {
      const firstPath = resolveSandboxPreloadPath(mainOutputDirectory, name)
      const firstManifest = readSandboxPreloadManifest(root, name)
      const lease = acquireSandboxPreloadGenerationLease(root, firstManifest.generation)
      try {
        const secondPath = resolveSandboxPreloadPath(mainOutputDirectory, name)
        const secondManifest = readSandboxPreloadManifest(root, name)
        if (secondManifest.generation !== firstManifest.generation || secondPath !== firstPath) {
          releaseSandboxPreloadGenerationLease(lease)
          continue
        }
        let released = false
        return {
          path: secondPath,
          release: () => {
            if (released) {
              return
            }
            released = true
            releaseSandboxPreloadGenerationLease(lease)
          }
        }
      } catch (error) {
        releaseSandboxPreloadGenerationLease(lease)
        throw error
      }
    } finally {
      releaseSandboxPreloadPublicationLock(lock)
    }
  }
  throw new Error(`sandbox_preload_manifest_changed_during_lease:${name}`)
}
