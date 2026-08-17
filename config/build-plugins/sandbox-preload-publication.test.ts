import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizeSandboxPreloadManifest } from '../../src/shared/sandbox-preload-manifest'
import {
  acquireSandboxPreloadGenerationLease,
  releaseSandboxPreloadGenerationLease
} from '../../src/shared/sandbox-preload-generation-lease'
import {
  acquireSandboxPreloadPublicationLock,
  releaseSandboxPreloadPublicationLock,
  sandboxPreloadProcessIsAlive
} from '../../src/shared/sandbox-preload-publication-lock'
import {
  publishSandboxPreloadArtifacts,
  sandboxPreloadPublicationMatches,
  sandboxPreloadSha256,
  type SandboxPreloadArtifact
} from './sandbox-preload-publication'

const allowedNames = ['first-preload', 'second-preload'] as const
const temporaryDirectories: string[] = []

function temporaryRoot(): string {
  const directory = mkdtempSync(join(tmpdir(), 'orca-sandbox-publication-'))
  temporaryDirectories.push(directory)
  return join(directory, 'sandbox-preload')
}

function artifacts(suffix: string): readonly SandboxPreloadArtifact[] {
  return allowedNames.map((name) => ({ code: `${name}:${suffix}`, name }))
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

describe('sandbox preload publication', () => {
  it('atomically replaces the manifest and removes inactive generations', () => {
    const root = temporaryRoot()
    const first = publishSandboxPreloadArtifacts(root, artifacts('first'), allowedNames)
    const firstDirectory = join(root, 'generations', first.generation)
    expect(existsSync(firstDirectory)).toBe(true)
    expect(sandboxPreloadPublicationMatches(root, artifacts('first'), allowedNames)).toBe(true)

    const second = publishSandboxPreloadArtifacts(root, artifacts('second'), allowedNames)
    expect(second.generation).not.toBe(first.generation)
    expect(existsSync(firstDirectory)).toBe(false)
    expect(existsSync(join(root, 'generations', second.generation))).toBe(true)
    expect(sandboxPreloadPublicationMatches(root, artifacts('second'), allowedNames)).toBe(true)
    const value: unknown = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
    expect(normalizeSandboxPreloadManifest(value, allowedNames)).toEqual(second)
  })

  it('repairs corrupt active artifacts and cleans crash residue', () => {
    const root = temporaryRoot()
    const expected = artifacts('stable')
    const manifest = publishSandboxPreloadArtifacts(root, expected, allowedNames)
    const firstEntry = manifest.entries[allowedNames[0]]
    if (!firstEntry) {
      throw new Error('sandbox_preload_publication_test_entry_missing')
    }
    writeFileSync(join(root, ...firstEntry.file.split('/')), 'corrupt')
    mkdirSync(join(root, '.staging-crash'))
    writeFileSync(join(root, '.manifest-crash.json'), '{}')
    mkdirSync(join(root, 'generations', 'orphan'))
    expect(sandboxPreloadPublicationMatches(root, expected, allowedNames)).toBe(false)

    const repaired = publishSandboxPreloadArtifacts(root, expected, allowedNames)
    expect(repaired).toEqual(manifest)
    expect(sandboxPreloadPublicationMatches(root, expected, allowedNames)).toBe(true)
    expect(readFileSync(join(root, ...firstEntry.file.split('/')), 'utf8')).toBe(expected[0].code)
    expect(existsSync(join(root, '.staging-crash'))).toBe(false)
    expect(existsSync(join(root, '.manifest-crash.json'))).toBe(false)
    expect(existsSync(join(root, 'generations', 'orphan'))).toBe(false)
  })

  it('rejects invalid roots and artifact names before writing', () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-sandbox-publication-invalid-'))
    temporaryDirectories.push(directory)
    expect(() =>
      publishSandboxPreloadArtifacts(directory, artifacts('value'), allowedNames)
    ).toThrow('sandbox_preload_publication_root_invalid')
    const root = join(directory, 'sandbox-preload')
    expect(() =>
      publishSandboxPreloadArtifacts(
        root,
        [
          { code: 'duplicate-one', name: allowedNames[0] },
          { code: 'duplicate-two', name: allowedNames[0] }
        ],
        allowedNames
      )
    ).toThrow('sandbox_preload_artifact_names_invalid')
    expect(() =>
      publishSandboxPreloadArtifacts(root, [{ code: 'unknown', name: 'unknown' }], allowedNames)
    ).toThrow('sandbox_preload_artifact_names_invalid')
    expect(() =>
      publishSandboxPreloadArtifacts(
        root,
        [{ code: 'missing-second', name: allowedNames[0] }],
        allowedNames
      )
    ).toThrow('sandbox_preload_artifact_names_invalid')
    expect(existsSync(root)).toBe(false)
  })

  it('hashes byte content deterministically', () => {
    expect(sandboxPreloadSha256('sandbox')).toBe(
      'b7ad567477c83756aab9a542b2be04f77dbae25115d85f22070d74d8cc4779dc'
    )
  })

  it('serializes publishers without deleting a live owner lock or staging', () => {
    const root = temporaryRoot()
    mkdirSync(root, { recursive: true })
    const firstPublisher = acquireSandboxPreloadPublicationLock(root)
    const staging = join(root, '.staging-live-publisher')
    mkdirSync(staging)

    expect(() =>
      publishSandboxPreloadArtifacts(root, artifacts('blocked'), allowedNames, {
        lock: { waitTimeoutMs: 0 }
      })
    ).toThrow('sandbox_preload_publication_lock_timeout')
    expect(existsSync(firstPublisher.file)).toBe(true)
    expect(existsSync(staging)).toBe(true)

    releaseSandboxPreloadPublicationLock(firstPublisher)
    publishSandboxPreloadArtifacts(root, artifacts('published'), allowedNames)
    expect(existsSync(firstPublisher.file)).toBe(false)
    expect(existsSync(staging)).toBe(false)
  })

  it('recovers a dead owner but fails safe when the pid is alive or reused', () => {
    const root = temporaryRoot()
    mkdirSync(root, { recursive: true })
    const lock = join(root, '.publish.lock')
    const source = JSON.stringify({
      pid: 2_147_483_647,
      token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    })
    writeFileSync(lock, source)

    expect(() =>
      publishSandboxPreloadArtifacts(root, artifacts('pid-reused'), allowedNames, {
        lock: { isProcessAlive: () => true, waitTimeoutMs: 0 }
      })
    ).toThrow('sandbox_preload_publication_lock_timeout')
    expect(readFileSync(lock, 'utf8')).toBe(source)

    publishSandboxPreloadArtifacts(root, artifacts('dead-owner'), allowedNames, {
      lock: { isProcessAlive: () => false, waitTimeoutMs: 0 }
    })
    expect(existsSync(lock)).toBe(false)
    expect(sandboxPreloadProcessIsAlive(process.pid)).toBe(true)
    expect(sandboxPreloadProcessIsAlive(2_147_483_647)).toBe(false)
  })

  it('serializes stale reclaimers without deleting the winning owner', () => {
    const root = temporaryRoot()
    mkdirSync(root, { recursive: true })
    const lockFile = join(root, '.publish.lock')
    writeFileSync(
      lockFile,
      JSON.stringify({
        pid: 2_147_483_647,
        token: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      })
    )
    const winners: ReturnType<typeof acquireSandboxPreloadPublicationLock>[] = []

    expect(() =>
      acquireSandboxPreloadPublicationLock(root, {
        afterStaleOwnerRead: () => {
          winners.push(
            acquireSandboxPreloadPublicationLock(root, {
              isProcessAlive: () => false,
              waitTimeoutMs: 0
            })
          )
        },
        isProcessAlive: () => false,
        waitTimeoutMs: 0
      })
    ).toThrow('sandbox_preload_publication_lock_timeout')

    expect(winners).toHaveLength(1)
    const winner = winners[0]
    if (!winner) {
      throw new Error('sandbox_preload_publication_test_winner_missing')
    }
    expect(JSON.parse(readFileSync(lockFile, 'utf8'))).toEqual(winner.owner)
    expect(existsSync(join(root, '.publish.reclaim'))).toBe(false)
    releaseSandboxPreloadPublicationLock(winner)
  })

  it('removes only its own crossed-fence lock and leaves a crashed fence closed', () => {
    const root = temporaryRoot()
    mkdirSync(root, { recursive: true })
    const lockFile = join(root, '.publish.lock')
    const fenceFile = join(root, '.publish.reclaim')
    const fenceOwner = {
      pid: 2_147_483_647,
      token: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    }
    const winningOwner = {
      pid: process.pid,
      token: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    }

    expect(() =>
      acquireSandboxPreloadPublicationLock(root, {
        afterLockCreated: (created) => {
          writeFileSync(fenceFile, JSON.stringify(fenceOwner), { flag: 'wx' })
          rmSync(created.file)
          writeFileSync(created.file, JSON.stringify(winningOwner), { flag: 'wx' })
        },
        waitTimeoutMs: 0
      })
    ).toThrow('sandbox_preload_publication_lock_timeout')

    expect(JSON.parse(readFileSync(lockFile, 'utf8'))).toEqual(winningOwner)
    expect(JSON.parse(readFileSync(fenceFile, 'utf8'))).toEqual(fenceOwner)
    rmSync(lockFile)
    expect(() =>
      acquireSandboxPreloadPublicationLock(root, {
        isProcessAlive: () => false,
        waitTimeoutMs: 0
      })
    ).toThrow('sandbox_preload_publication_lock_timeout')
    expect(JSON.parse(readFileSync(fenceFile, 'utf8'))).toEqual(fenceOwner)
    expect(existsSync(lockFile)).toBe(false)
  })

  it('retains live leased generations and removes them after release or owner death', () => {
    const root = temporaryRoot()
    const first = publishSandboxPreloadArtifacts(root, artifacts('first'), allowedNames)
    const firstDirectory = join(root, 'generations', first.generation)
    const liveLease = acquireSandboxPreloadGenerationLease(root, first.generation)

    publishSandboxPreloadArtifacts(root, artifacts('second'), allowedNames)
    expect(existsSync(firstDirectory)).toBe(true)
    releaseSandboxPreloadGenerationLease(liveLease)
    publishSandboxPreloadArtifacts(root, artifacts('second'), allowedNames)
    expect(existsSync(firstDirectory)).toBe(false)

    const third = publishSandboxPreloadArtifacts(root, artifacts('third'), allowedNames)
    const thirdDirectory = join(root, 'generations', third.generation)
    const deadLease = acquireSandboxPreloadGenerationLease(root, third.generation)
    writeFileSync(
      deadLease.file,
      JSON.stringify({ generation: third.generation, pid: 2_147_483_647, token: deadLease.token })
    )
    publishSandboxPreloadArtifacts(root, artifacts('fourth'), allowedNames, {
      isProcessAlive: () => false
    })
    expect(existsSync(thirdDirectory)).toBe(false)
    expect(existsSync(deadLease.file)).toBe(false)
  })

  it('preserves a lease acquired at the release file-removal barrier', () => {
    const root = temporaryRoot()
    const manifest = publishSandboxPreloadArtifacts(root, artifacts('leased'), allowedNames)
    const firstLease = acquireSandboxPreloadGenerationLease(root, manifest.generation)
    const concurrentLeases: ReturnType<typeof acquireSandboxPreloadGenerationLease>[] = []

    releaseSandboxPreloadGenerationLease(firstLease, () => {
      concurrentLeases.push(acquireSandboxPreloadGenerationLease(root, manifest.generation))
    })

    expect(concurrentLeases).toHaveLength(1)
    const concurrentLease = concurrentLeases[0]
    if (!concurrentLease) {
      throw new Error('sandbox_preload_publication_test_concurrent_lease_missing')
    }
    expect(existsSync(firstLease.file)).toBe(false)
    expect(existsSync(concurrentLease.file)).toBe(true)
    releaseSandboxPreloadGenerationLease(firstLease)
    expect(existsSync(concurrentLease.file)).toBe(true)
    releaseSandboxPreloadGenerationLease(concurrentLease)
    expect(existsSync(join(root, 'leases', manifest.generation))).toBe(true)
  })
})
