import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  SANDBOX_PRELOAD_NAMES,
  SANDBOX_PRELOAD_MANIFEST_VERSION,
  type SandboxPreloadManifest,
  type SandboxPreloadName
} from '../shared/sandbox-preload-manifest'
import {
  acquireSandboxPreloadPath,
  resolveSandboxPreloadPath,
  resolveSandboxPreloadRoot
} from './sandbox-preload-path'
import {
  acquireSandboxPreloadPublicationLock,
  releaseSandboxPreloadPublicationLock
} from '../shared/sandbox-preload-publication-lock'

const name: SandboxPreloadName = 'browser-window-close-preload'
const temporaryDirectories: string[] = []

function temporaryOutput(): string {
  const directory = mkdtempSync(join(tmpdir(), 'orca-sandbox-path-'))
  temporaryDirectories.push(directory)
  const output = join(directory, 'out', 'main')
  mkdirSync(output, { recursive: true })
  return output
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function manifestFor(code: string): SandboxPreloadManifest {
  const generation = sha256(`generation:${code}`)
  return {
    entries: Object.fromEntries(
      SANDBOX_PRELOAD_NAMES.map((entryName) => {
        const entryCode = entryName === name ? code : `${code}:${entryName}`
        return [
          entryName,
          {
            file: `generations/${generation}/${entryName}.js`,
            sha256: sha256(entryCode)
          }
        ]
      })
    ),
    generation,
    version: SANDBOX_PRELOAD_MANIFEST_VERSION
  }
}

function writeManifest(output: string, value: unknown): void {
  const root = resolveSandboxPreloadRoot(output)
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(value))
}

function writeValidPublication(output: string, code = 'valid-preload'): string {
  const root = resolveSandboxPreloadRoot(output)
  const manifest = manifestFor(code)
  for (const entryName of SANDBOX_PRELOAD_NAMES) {
    const entry = manifest.entries[entryName]
    if (!entry) {
      throw new Error('sandbox_preload_path_test_entry_missing')
    }
    const file = join(root, ...entry.file.split('/'))
    mkdirSync(resolve(file, '..'), { recursive: true })
    writeFileSync(file, entryName === name ? code : `${code}:${entryName}`)
  }
  writeManifest(output, manifest)
  const selected = manifest.entries[name]
  if (!selected) {
    throw new Error('sandbox_preload_path_test_entry_missing')
  }
  return join(root, ...selected.file.split('/'))
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('sandbox preload path', () => {
  it('resolves a verified artifact from the dedicated sibling directory', () => {
    const output = temporaryOutput()
    const expected = writeValidPublication(output)
    expect(resolveSandboxPreloadRoot(output)).toBe(resolve(output, '..', 'sandbox-preload'))
    expect(resolveSandboxPreloadPath(output, name)).toBe(resolve(expected))
  })

  it('rejects unreadable, malformed, and traversal manifests', () => {
    const output = temporaryOutput()
    expect(() => resolveSandboxPreloadPath(output, name)).toThrow(
      `sandbox_preload_manifest_unreadable:${name}`
    )
    writeManifest(output, { entries: {}, generation: 'invalid', version: 1 })
    expect(() => resolveSandboxPreloadPath(output, name)).toThrow(
      `sandbox_preload_manifest_invalid:${name}`
    )
    const missingEntry = manifestFor('missing-entry')
    delete missingEntry.entries['discord-web-fast-response-preload']
    writeManifest(output, missingEntry)
    expect(() => resolveSandboxPreloadPath(output, name)).toThrow(
      `sandbox_preload_manifest_invalid:${name}`
    )
    const manifest = manifestFor('traversal')
    const entry = manifest.entries[name]
    if (!entry) {
      throw new Error('sandbox_preload_path_test_entry_missing')
    }
    entry.file = `generations/${manifest.generation}/../${name}.js`
    writeManifest(output, manifest)
    expect(() => resolveSandboxPreloadPath(output, name)).toThrow(
      `sandbox_preload_manifest_invalid:${name}`
    )
  })

  it('rejects missing and hash-mismatched artifacts', () => {
    const output = temporaryOutput()
    writeManifest(output, manifestFor('missing'))
    expect(() => resolveSandboxPreloadPath(output, name)).toThrow(
      `sandbox_preload_file_missing:${name}`
    )
    writeValidPublication(output, 'expected')
    const manifest = manifestFor('expected')
    const entry = manifest.entries[name]
    if (!entry) {
      throw new Error('sandbox_preload_path_test_entry_missing')
    }
    writeFileSync(join(resolveSandboxPreloadRoot(output), ...entry.file.split('/')), 'tampered')
    expect(() => resolveSandboxPreloadPath(output, name)).toThrow(
      `sandbox_preload_hash_mismatch:${name}`
    )
  })

  it('rejects symlinked artifacts that escape the publication root', () => {
    const output = temporaryOutput()
    const root = resolveSandboxPreloadRoot(output)
    const code = 'external-preload'
    const manifest = manifestFor(code)
    const external = mkdtempSync(join(tmpdir(), 'orca-sandbox-path-external-'))
    temporaryDirectories.push(external)
    writeFileSync(join(external, `${name}.js`), code)
    mkdirSync(join(root, 'generations'), { recursive: true })
    symlinkSync(external, join(root, 'generations', manifest.generation), 'junction')
    writeManifest(output, manifest)
    expect(() => resolveSandboxPreloadPath(output, name)).toThrow(
      `sandbox_preload_file_outside_root:${name}`
    )
  })

  it('acquires the generation after a contended manifest swap and releases idempotently', () => {
    const output = temporaryOutput()
    writeValidPublication(output, 'first')
    const root = resolveSandboxPreloadRoot(output)
    const blocker = acquireSandboxPreloadPublicationLock(root)
    let swapped = false
    const acquired = acquireSandboxPreloadPath(output, name, {
      retainGeneration: true,
      lock: {
        retryIntervalMs: 1,
        waitTimeoutMs: 100,
        sleep: () => {
          if (!swapped) {
            swapped = true
            writeValidPublication(output, 'second')
            releaseSandboxPreloadPublicationLock(blocker)
          }
        }
      }
    })

    expect(acquired.path).toContain(manifestFor('second').generation)
    expect(existsSync(join(root, 'leases', manifestFor('second').generation))).toBe(true)
    acquired.release()
    acquired.release()
    const leaseDirectory = join(root, 'leases', manifestFor('second').generation)
    expect(existsSync(leaseDirectory)).toBe(true)
    expect(readdirSync(leaseDirectory)).toEqual([])
  })
})
