export const SANDBOX_PRELOAD_DIRECTORY = 'sandbox-preload'
export const SANDBOX_PRELOAD_MANIFEST_FILE = 'manifest.json'
export const SANDBOX_PRELOAD_MANIFEST_VERSION = 1
export const SANDBOX_PRELOAD_NAMES = [
  'browser-window-close-preload',
  'discord-web-fast-response-preload'
] as const

export type SandboxPreloadName = (typeof SANDBOX_PRELOAD_NAMES)[number]

export type SandboxPreloadManifestEntry = {
  file: string
  sha256: string
}

export type SandboxPreloadManifest = {
  entries: Record<string, SandboxPreloadManifestEntry>
  generation: string
  version: typeof SANDBOX_PRELOAD_MANIFEST_VERSION
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

export function normalizeSandboxPreloadManifest(
  value: unknown,
  allowedNames: readonly string[] = SANDBOX_PRELOAD_NAMES
): SandboxPreloadManifest | null {
  if (!isRecord(value) || !hasExactKeys(value, ['entries', 'generation', 'version'])) {
    return null
  }
  if (
    value.version !== SANDBOX_PRELOAD_MANIFEST_VERSION ||
    typeof value.generation !== 'string' ||
    !SHA256_PATTERN.test(value.generation) ||
    !isRecord(value.entries)
  ) {
    return null
  }
  const names = Object.keys(value.entries).sort()
  const expectedNames = [...allowedNames].sort()
  if (
    new Set(expectedNames).size !== expectedNames.length ||
    names.length !== expectedNames.length ||
    names.some((name, index) => name !== expectedNames[index])
  ) {
    return null
  }
  const entries: Record<string, SandboxPreloadManifestEntry> = {}
  for (const name of names) {
    const entry = value.entries[name]
    if (
      !isRecord(entry) ||
      !hasExactKeys(entry, ['file', 'sha256']) ||
      typeof entry.file !== 'string' ||
      typeof entry.sha256 !== 'string' ||
      !SHA256_PATTERN.test(entry.sha256) ||
      entry.file !== `generations/${value.generation}/${name}.js`
    ) {
      return null
    }
    entries[name] = { file: entry.file, sha256: entry.sha256 }
  }
  return { entries, generation: value.generation, version: SANDBOX_PRELOAD_MANIFEST_VERSION }
}
