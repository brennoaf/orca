import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { basename, join, resolve } from 'node:path'
import {
  normalizeSandboxPreloadManifest,
  SANDBOX_PRELOAD_DIRECTORY,
  SANDBOX_PRELOAD_MANIFEST_FILE,
  SANDBOX_PRELOAD_MANIFEST_VERSION,
  type SandboxPreloadManifest
} from '../../src/shared/sandbox-preload-manifest'
import { sandboxPreloadGenerationHasLiveLease } from '../../src/shared/sandbox-preload-generation-lease'
import {
  acquireSandboxPreloadPublicationLock,
  releaseSandboxPreloadPublicationLock,
  type SandboxPreloadPublicationLockOptions
} from '../../src/shared/sandbox-preload-publication-lock'

export type SandboxPreloadArtifact = {
  code: string
  name: string
}

export type SandboxPreloadPublicationOptions = {
  isProcessAlive?: (pid: number) => boolean
  lock?: SandboxPreloadPublicationLockOptions
}

let stagingSequence = 0

function assertPublicationRoot(root: string): void {
  if (basename(resolve(root)) !== SANDBOX_PRELOAD_DIRECTORY) {
    throw new Error('sandbox_preload_publication_root_invalid')
  }
}

export function sandboxPreloadSha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function manifestFor(
  artifacts: readonly SandboxPreloadArtifact[],
  allowedNames: readonly string[]
): SandboxPreloadManifest {
  const names = artifacts.map(({ name }) => name).sort()
  const expectedNames = [...allowedNames].sort()
  if (
    new Set(names).size !== names.length ||
    new Set(expectedNames).size !== expectedNames.length ||
    names.length !== expectedNames.length ||
    names.some((name, index) => name !== expectedNames[index])
  ) {
    throw new Error('sandbox_preload_artifact_names_invalid')
  }
  const artifactByName = new Map(artifacts.map((artifact) => [artifact.name, artifact]))
  const hashes = Object.fromEntries(
    names.map((name) => [name, sandboxPreloadSha256(artifactByName.get(name)?.code ?? '')])
  )
  const generation = sandboxPreloadSha256(
    names.map((name) => `${name}\0${hashes[name]}`).join('\0')
  )
  return {
    entries: Object.fromEntries(
      names.map((name) => [
        name,
        {
          file: `generations/${generation}/${name}.js`,
          sha256: hashes[name] as string
        }
      ])
    ),
    generation,
    version: SANDBOX_PRELOAD_MANIFEST_VERSION
  }
}

function removeStaging(root: string): void {
  if (!existsSync(root)) {
    return
  }
  for (const name of readdirSync(root)) {
    if (name.startsWith('.staging-') || name.startsWith('.manifest-')) {
      rmSync(join(root, name), { force: true, recursive: true })
    }
  }
}

function removeInactiveGenerations(
  root: string,
  activeGeneration: string,
  isProcessAlive?: (pid: number) => boolean
): void {
  const generations = join(root, 'generations')
  if (!existsSync(generations)) {
    return
  }
  for (const name of readdirSync(generations)) {
    const retained = sandboxPreloadGenerationHasLiveLease(root, name, isProcessAlive)
    if (name !== activeGeneration && !retained) {
      rmSync(join(generations, name), { force: true, recursive: true })
    }
  }
}

function generationMatches(root: string, manifest: SandboxPreloadManifest): boolean {
  return Object.values(manifest.entries).every((entry) => {
    const file = join(root, ...entry.file.split('/'))
    return existsSync(file) && sandboxPreloadSha256(readFileSync(file)) === entry.sha256
  })
}

export function publishSandboxPreloadArtifacts(
  root: string,
  artifacts: readonly SandboxPreloadArtifact[],
  allowedNames: readonly string[],
  options: SandboxPreloadPublicationOptions = {}
): SandboxPreloadManifest {
  assertPublicationRoot(root)
  const manifest = manifestFor(artifacts, allowedNames)
  mkdirSync(root, { recursive: true })
  const lock = acquireSandboxPreloadPublicationLock(root, options.lock)
  try {
    mkdirSync(join(root, 'generations'), { recursive: true })
    removeStaging(root)
    const sequence = `${process.pid}-${stagingSequence++}-${lock.owner.token}`
    const staging = join(root, `.staging-${sequence}`)
    const generationDirectory = join(root, 'generations', manifest.generation)
    if (!generationMatches(root, manifest)) {
      rmSync(generationDirectory, { force: true, recursive: true })
      mkdirSync(staging)
      try {
        for (const artifact of artifacts) {
          writeFileSync(join(staging, `${artifact.name}.js`), artifact.code)
        }
        renameSync(staging, generationDirectory)
      } catch (error) {
        rmSync(staging, { force: true, recursive: true })
        throw error
      }
    }
    if (!generationMatches(root, manifest)) {
      throw new Error('sandbox_preload_generation_invalid_before_manifest')
    }
    const manifestTemporary = join(root, `.manifest-${sequence}.json`)
    try {
      writeFileSync(manifestTemporary, `${JSON.stringify(manifest, null, 2)}\n`)
      renameSync(manifestTemporary, join(root, SANDBOX_PRELOAD_MANIFEST_FILE))
    } catch (error) {
      rmSync(manifestTemporary, { force: true })
      throw error
    }
    removeInactiveGenerations(root, manifest.generation, options.isProcessAlive)
    removeStaging(root)
    return manifest
  } finally {
    releaseSandboxPreloadPublicationLock(lock)
  }
}

export function sandboxPreloadPublicationMatches(
  root: string,
  artifacts: readonly SandboxPreloadArtifact[],
  allowedNames: readonly string[]
): boolean {
  try {
    assertPublicationRoot(root)
    const expected = manifestFor(artifacts, allowedNames)
    const value: unknown = JSON.parse(
      readFileSync(join(root, SANDBOX_PRELOAD_MANIFEST_FILE), 'utf8')
    )
    const actual = normalizeSandboxPreloadManifest(value, allowedNames)
    if (!actual || JSON.stringify(actual) !== JSON.stringify(expected)) {
      return false
    }
    return Object.values(actual.entries).every((entry) => {
      const file = join(root, ...entry.file.split('/'))
      return existsSync(file) && sandboxPreloadSha256(readFileSync(file)) === entry.sha256
    })
  } catch {
    return false
  }
}
