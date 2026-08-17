import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build, type Rollup } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { normalizeSandboxPreloadManifest } from '../../src/shared/sandbox-preload-manifest'
import {
  buildSandboxPreloadBundles,
  createSandboxPreloadBundlesPlugin,
  type SandboxPreloadEntry
} from '../build-plugins/sandbox-preload-bundles'
import type { SandboxPreloadArtifact } from '../build-plugins/sandbox-preload-publication'

const temporaryDirectories: string[] = []

function temporaryDirectory(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), name))
  temporaryDirectories.push(directory)
  return directory
}

function expectSelfContained(source: string): void {
  expect(source).not.toMatch(/require\(\s*['"]\.\.?[\\/]/)
  expect(source).not.toMatch(/(?:from\s+|import\s+|import\(\s*)['"]\.\.?[\\/]/)
}

function waitForBundleEnd(watcher: Rollup.RollupWatcher): Promise<void> {
  return new Promise((resolve, reject) => {
    let error: Error | undefined
    const listener = (event: Rollup.RollupWatcherEvent): void => {
      if (event.code === 'ERROR') {
        error = event.error
      }
      if (event.code === 'END') {
        watcher.off('event', listener)
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      }
    }
    watcher.on('event', listener)
  })
}

function activeArtifact(root: string, name: string, allowedNames: readonly string[]): string {
  const value: unknown = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
  const manifest = normalizeSandboxPreloadManifest(value, allowedNames)
  if (!manifest) {
    throw new Error('sandbox_preload_test_manifest_invalid')
  }
  const entry = manifest.entries[name]
  if (!entry) {
    throw new Error(`sandbox_preload_test_entry_missing:${name}`)
  }
  return readFileSync(join(root, ...entry.file.split('/')), 'utf8')
}

function chunkSources(outputDirectory: string): { file: string; source: string }[] {
  const directory = join(outputDirectory, 'chunks')
  if (!existsSync(directory)) {
    return []
  }
  return readdirSync(directory, { recursive: true })
    .filter((name): name is string => typeof name === 'string' && name.endsWith('.js'))
    .map((name) => ({ file: name, source: readFileSync(join(directory, name), 'utf8') }))
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('sandbox preload output', () => {
  it('builds every sandbox preload in memory without local runtime imports', async () => {
    const artifacts = await buildSandboxPreloadBundles()
    const browserClose = artifacts.find(({ name }) => name === 'browser-window-close-preload')
    const discord = artifacts.find(({ name }) => name === 'discord-web-fast-response-preload')
    if (!browserClose || !discord) {
      throw new Error('sandbox_preload_test_artifact_missing')
    }
    expectSelfContained(browserClose.code)
    expectSelfContained(discord.code)
    expect(discord.code).toContain('orca:discord-fast-response-intent')
    expect(discord.code).toContain('discordWebFastResponse:compactIntent')
    expect(discord.code).toContain('addEventListener')
  })

  it('publishes atomic dedicated generations with graph-scoped watch invalidation', async () => {
    const directory = temporaryDirectory('orca-sandbox-preload-watch-')
    const mainOutput = join(directory, 'out', 'main')
    const publicationRoot = join(directory, 'out', 'sandbox-preload')
    const browserSource = join(directory, 'browser.ts')
    const discordSource = join(directory, 'discord.ts')
    const unrelatedSource = join(directory, 'unrelated.ts')
    const browserHelper = join(directory, 'browser-value.ts')
    const discordHelper = join(directory, 'discord-value.ts')
    const sandboxShared = join(directory, 'sandbox-shared.ts')
    const mainShared = join(directory, 'main-shared.ts')
    writeFileSync(browserHelper, "export const value = 'browser-value'\n")
    writeFileSync(discordHelper, "export const value = 'first-discord-value'\n")
    writeFileSync(sandboxShared, "export const shared = 'first-sandbox-shared-value'\n")
    writeFileSync(mainShared, "export const shared = 'main-shared-value'\n")
    writeFileSync(
      browserSource,
      "import { value } from './browser-value'\nimport { shared } from './sandbox-shared'\nglobalThis.__browser = value + shared\n"
    )
    writeFileSync(
      discordSource,
      "import { value } from './discord-value'\nimport { shared } from './sandbox-shared'\nglobalThis.__discord = value + shared\n"
    )
    writeFileSync(
      unrelatedSource,
      "import { shared } from './main-shared'\nglobalThis.__unrelated = shared + 'first-unrelated-value'\n"
    )
    const entries: readonly SandboxPreloadEntry[] = [
      { name: 'browser-window-close-preload', source: browserSource },
      { name: 'discord-web-fast-response-preload', source: discordSource }
    ]
    const allowedNames = entries.map(({ name }) => name)
    const builds: string[][] = []
    let failSharedBuild = false
    const buildBundles = async (
      selected: readonly SandboxPreloadEntry[]
    ): Promise<readonly SandboxPreloadArtifact[]> => {
      builds.push(selected.map(({ name }) => name))
      if (failSharedBuild) {
        throw new Error('sandbox_preload_expected_shared_failure')
      }
      return buildSandboxPreloadBundles(selected)
    }
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [createSandboxPreloadBundlesPlugin(entries, buildBundles)],
      publicDir: false,
      root: directory,
      build: {
        outDir: 'out/main',
        rollupOptions: {
          input: {
            'browser-window-close-preload': browserSource,
            'discord-web-fast-response-preload': discordSource,
            main: unrelatedSource
          },
          output: {
            chunkFileNames: 'chunks/[name]-[hash].js',
            entryFileNames: '[name].js',
            format: 'cjs',
            manualChunks(id) {
              if (id.replace(/\\/g, '/').endsWith('/sandbox-shared.ts')) {
                return 'sandbox-exclusive'
              }
              if (id.replace(/\\/g, '/').endsWith('/main-shared.ts')) {
                return 'main-shared'
              }
              return undefined
            }
          }
        },
        watch: {}
      }
    })
    if (Array.isArray(result) || !('on' in result)) {
      throw new Error('sandbox_preload_watch_missing')
    }
    const watcher = result
    try {
      await waitForBundleEnd(watcher)
      const browser = activeArtifact(publicationRoot, entries[0].name, allowedNames)
      const firstDiscord = activeArtifact(publicationRoot, entries[1].name, allowedNames)
      expect(builds).toEqual([allowedNames])
      expectSelfContained(browser)
      expectSelfContained(firstDiscord)
      expect(existsSync(join(mainOutput, `${entries[0].name}.js`))).toBe(false)
      expect(existsSync(join(mainOutput, `${entries[1].name}.js`))).toBe(false)
      const initialChunks = chunkSources(mainOutput)
      expect(
        initialChunks.filter(({ source }) => source.includes('first-sandbox-shared-value'))
      ).toEqual([])
      expect(initialChunks.some(({ source }) => source.includes('main-shared-value'))).toBe(true)

      const unrelatedRebuilt = waitForBundleEnd(watcher)
      writeFileSync(
        unrelatedSource,
        "import { shared } from './main-shared'\nglobalThis.__unrelated = shared + 'second-unrelated-value'\n"
      )
      await unrelatedRebuilt
      expect(builds).toEqual([allowedNames])
      expect(activeArtifact(publicationRoot, entries[0].name, allowedNames)).toBe(browser)
      expect(activeArtifact(publicationRoot, entries[1].name, allowedNames)).toBe(firstDiscord)

      const discordRebuilt = waitForBundleEnd(watcher)
      writeFileSync(discordHelper, "export const value = 'second-discord-value'\n")
      await discordRebuilt
      const secondDiscord = activeArtifact(publicationRoot, entries[1].name, allowedNames)
      expect(builds.at(-1)).toEqual([entries[1].name])
      expect(activeArtifact(publicationRoot, entries[0].name, allowedNames)).toBe(browser)
      expect(secondDiscord).toContain('second-discord-value')

      const browserBeforeFailure = activeArtifact(publicationRoot, entries[0].name, allowedNames)
      const discordBeforeFailure = activeArtifact(publicationRoot, entries[1].name, allowedNames)
      const failed = waitForBundleEnd(watcher)
      failSharedBuild = true
      writeFileSync(sandboxShared, "export const shared = 'failed-sandbox-shared-value'\n")
      await expect(failed).rejects.toThrow('sandbox_preload_expected_shared_failure')
      expect(builds.at(-1)).toEqual(allowedNames)
      expect(activeArtifact(publicationRoot, entries[0].name, allowedNames)).toBe(
        browserBeforeFailure
      )
      expect(activeArtifact(publicationRoot, entries[1].name, allowedNames)).toBe(
        discordBeforeFailure
      )

      const recovered = waitForBundleEnd(watcher)
      failSharedBuild = false
      writeFileSync(sandboxShared, "export const shared = 'recovered-sandbox-shared-value'\n")
      await recovered
      expect(builds.at(-1)).toEqual(allowedNames)
      expect(activeArtifact(publicationRoot, entries[0].name, allowedNames)).toContain(
        'recovered-sandbox-shared-value'
      )
      expect(activeArtifact(publicationRoot, entries[1].name, allowedNames)).toContain(
        'recovered-sandbox-shared-value'
      )
    } finally {
      await watcher.close()
    }

    const priorManifest = normalizeSandboxPreloadManifest(
      JSON.parse(readFileSync(join(publicationRoot, 'manifest.json'), 'utf8')),
      allowedNames
    )
    if (!priorManifest) {
      throw new Error('sandbox_preload_prior_manifest_invalid')
    }
    const renamedSource = join(directory, 'renamed.ts')
    writeFileSync(renamedSource, "globalThis.__renamed = 'renamed-value'\n")
    const renamedEntries: readonly SandboxPreloadEntry[] = [
      { name: 'renamed-preload', source: renamedSource }
    ]
    await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [createSandboxPreloadBundlesPlugin(renamedEntries)],
      publicDir: false,
      root: directory,
      build: {
        outDir: 'out/main',
        rollupOptions: {
          input: { main: unrelatedSource, 'renamed-preload': renamedSource },
          output: { entryFileNames: '[name].js', format: 'cjs' }
        }
      }
    })
    expect(activeArtifact(publicationRoot, 'renamed-preload', ['renamed-preload'])).toContain(
      'renamed-value'
    )
    expect(existsSync(join(mainOutput, 'renamed-preload.js'))).toBe(false)
    for (const entry of Object.values(priorManifest.entries)) {
      expect(existsSync(join(publicationRoot, ...entry.file.split('/')))).toBe(false)
    }
  })
})
