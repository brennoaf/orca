import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { build, type Plugin, type Rollup } from 'vite'
import { SANDBOX_PRELOAD_DIRECTORY } from '../../src/shared/sandbox-preload-manifest'
import {
  publishSandboxPreloadArtifacts,
  sandboxPreloadPublicationMatches,
  type SandboxPreloadArtifact
} from './sandbox-preload-publication'

export type SandboxPreloadEntry = {
  name: string
  source: string
}

type SandboxPreloadBuild = (
  entries: readonly SandboxPreloadEntry[]
) => Promise<readonly SandboxPreloadArtifact[]>

type SandboxPreloadGraph = {
  bundleKey: string
  fileNames: ReadonlySet<string>
  signature: string
}

type CachedSandboxPreload = {
  artifact: SandboxPreloadArtifact
  signature: string
}

export const SANDBOX_PRELOAD_ENTRIES: readonly SandboxPreloadEntry[] = [
  {
    name: 'browser-window-close-preload',
    source: resolve('src/preload/browser-window-close.ts')
  },
  {
    name: 'discord-web-fast-response-preload',
    source: resolve('src/preload/discord-web-fast-response.ts')
  }
]

function chunkDependencies(chunk: Rollup.OutputChunk): string[] {
  return [...chunk.imports, ...chunk.dynamicImports]
}

export async function buildSandboxPreloadBundles(
  entries: readonly SandboxPreloadEntry[] = SANDBOX_PRELOAD_ENTRIES
): Promise<readonly SandboxPreloadArtifact[]> {
  const artifacts: SandboxPreloadArtifact[] = []
  for (const entry of entries) {
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      publicDir: false,
      build: {
        lib: {
          entry: entry.source,
          formats: ['cjs'],
          fileName: () => `${entry.name}.js`
        },
        minify: false,
        rollupOptions: {
          external: ['electron'],
          output: { inlineDynamicImports: true }
        },
        write: false
      }
    })
    if (!Array.isArray(result) && !('output' in result)) {
      throw new Error(`sandbox_preload_memory_output_missing:${entry.name}`)
    }
    const outputs = Array.isArray(result) ? result : [result]
    const chunk = outputs
      .flatMap((output) => output.output)
      .find((item): item is Rollup.OutputChunk => item.type === 'chunk' && item.isEntry)
    if (!chunk || chunk.imports.length > 0 || chunk.dynamicImports.length > 0) {
      throw new Error(`sandbox_preload_memory_output_not_standalone:${entry.name}`)
    }
    artifacts.push({ code: chunk.code, name: entry.name })
  }
  return artifacts
}

function sandboxPreloadGraph(bundle: Rollup.OutputBundle, entryName: string): SandboxPreloadGraph {
  const chunks = Object.entries(bundle).filter(
    (entry): entry is [string, Rollup.OutputChunk] => entry[1].type === 'chunk'
  )
  const entry = chunks.find(([, chunk]) => chunk.isEntry && chunk.name === entryName)
  if (!entry) {
    throw new Error(`sandbox_preload_entry_missing:${entryName}`)
  }
  const byFileName = new Map(chunks.map(([, chunk]) => [chunk.fileName, chunk]))
  const reachable = new Map<string, Rollup.OutputChunk>()
  const pending = [entry[1].fileName]
  while (pending.length > 0) {
    const fileName = pending.pop()
    if (!fileName || reachable.has(fileName)) {
      continue
    }
    const chunk = byFileName.get(fileName)
    if (!chunk) {
      continue
    }
    reachable.set(fileName, chunk)
    for (const imported of chunkDependencies(chunk)) {
      if (byFileName.has(imported)) {
        pending.push(imported)
      }
    }
  }
  const hash = createHash('sha256')
  for (const [fileName, chunk] of [...reachable].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    hash.update(fileName)
    hash.update('\0')
    hash.update(chunk.code)
    hash.update('\0')
    hash.update(chunkDependencies(chunk).sort().join('\0'))
    hash.update('\0')
  }
  return {
    bundleKey: entry[0],
    fileNames: new Set(reachable.keys()),
    signature: hash.digest('hex')
  }
}

function removeUnreachableSandboxChunks(
  bundle: Rollup.OutputBundle,
  candidates: ReadonlySet<string>
): void {
  const chunks = Object.entries(bundle).filter(
    (entry): entry is [string, Rollup.OutputChunk] => entry[1].type === 'chunk'
  )
  const byFileName = new Map(chunks.map(([key, chunk]) => [chunk.fileName, { chunk, key }]))
  const reachable = new Set<string>()
  const pending = chunks
    .filter(([, chunk]) => chunk.isEntry && !candidates.has(chunk.fileName))
    .map(([, chunk]) => chunk.fileName)
  while (pending.length > 0) {
    const fileName = pending.pop()
    if (!fileName || reachable.has(fileName)) {
      continue
    }
    const item = byFileName.get(fileName)
    if (!item) {
      continue
    }
    reachable.add(fileName)
    for (const imported of chunkDependencies(item.chunk)) {
      if (byFileName.has(imported)) {
        pending.push(imported)
      }
    }
  }
  for (const fileName of candidates) {
    const item = byFileName.get(fileName)
    if (item && !reachable.has(fileName)) {
      delete bundle[item.key]
    }
  }
}

export function createSandboxPreloadBundlesPlugin(
  entries: readonly SandboxPreloadEntry[] = SANDBOX_PRELOAD_ENTRIES,
  buildBundles: SandboxPreloadBuild = buildSandboxPreloadBundles
): Plugin {
  const cache = new Map<string, CachedSandboxPreload>()
  let pendingPublication: {
    artifacts: readonly SandboxPreloadArtifact[]
    cache: ReadonlyMap<string, CachedSandboxPreload>
  } | null = null
  return {
    name: 'orca-sandbox-preload-bundles',
    async generateBundle(_options, bundle) {
      const graphs = entries.map((entry) => ({
        entry,
        graph: sandboxPreloadGraph(bundle, entry.name)
      }))
      const invalidated = graphs.filter(
        ({ entry, graph }) => cache.get(entry.name)?.signature !== graph.signature
      )
      const built =
        invalidated.length > 0 ? await buildBundles(invalidated.map(({ entry }) => entry)) : []
      const builtByName = new Map(built.map((artifact) => [artifact.name, artifact]))
      if (
        builtByName.size !== invalidated.length ||
        invalidated.some(({ entry }) => !builtByName.has(entry.name))
      ) {
        throw new Error('sandbox_preload_memory_output_incomplete')
      }
      const nextCache = new Map<string, CachedSandboxPreload>()
      for (const { entry, graph } of graphs) {
        const artifact = builtByName.get(entry.name) ?? cache.get(entry.name)?.artifact
        if (!artifact) {
          throw new Error(`sandbox_preload_artifact_missing:${entry.name}`)
        }
        nextCache.set(entry.name, { artifact, signature: graph.signature })
      }
      const candidates = new Set<string>()
      for (const { graph } of graphs) {
        delete bundle[graph.bundleKey]
        for (const fileName of graph.fileNames) {
          candidates.add(fileName)
        }
      }
      removeUnreachableSandboxChunks(bundle, candidates)
      pendingPublication = {
        artifacts: entries
          .map(({ name }) => nextCache.get(name)?.artifact)
          .filter((artifact): artifact is SandboxPreloadArtifact => Boolean(artifact)),
        cache: nextCache
      }
    },
    writeBundle(options) {
      if (!pendingPublication) {
        throw new Error('sandbox_preload_publication_missing')
      }
      if (!options.dir) {
        throw new Error('sandbox_preload_output_directory_missing')
      }
      const publication = pendingPublication
      const root = resolve(options.dir, '..', SANDBOX_PRELOAD_DIRECTORY)
      const allowedNames = entries.map(({ name }) => name)
      if (!sandboxPreloadPublicationMatches(root, publication.artifacts, allowedNames)) {
        publishSandboxPreloadArtifacts(root, publication.artifacts, allowedNames)
      }
      cache.clear()
      for (const [name, value] of publication.cache) {
        cache.set(name, value)
      }
      pendingPublication = null
    }
  }
}
