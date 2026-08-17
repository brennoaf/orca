import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sandboxPreloadProcessIsAlive } from './sandbox-preload-publication-lock'

export type SandboxPreloadGenerationLease = {
  file: string
  generation: string
  pid: number
  token: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readLease(file: string): SandboxPreloadGenerationLease | null {
  try {
    const value: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'generation,pid,token') {
      return null
    }
    if (
      typeof value.generation !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.generation) ||
      !Number.isSafeInteger(value.pid) ||
      Number(value.pid) <= 0 ||
      typeof value.token !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(value.token)
    ) {
      return null
    }
    return {
      file,
      generation: value.generation,
      pid: Number(value.pid),
      token: value.token
    }
  } catch {
    return null
  }
}

export function acquireSandboxPreloadGenerationLease(
  root: string,
  generation: string
): SandboxPreloadGenerationLease {
  const token = randomUUID()
  const directory = join(root, 'leases', generation)
  const file = join(directory, `${process.pid}-${token}.json`)
  const lease = { file, generation, pid: process.pid, token }
  mkdirSync(directory, { recursive: true })
  writeFileSync(file, JSON.stringify({ generation, pid: lease.pid, token }), { flag: 'wx' })
  return lease
}

export function releaseSandboxPreloadGenerationLease(
  lease: SandboxPreloadGenerationLease,
  afterFileRemoved?: () => void
): void {
  const current = readLease(lease.file)
  if (current?.pid === lease.pid && current.token === lease.token) {
    rmSync(lease.file, { force: true })
    afterFileRemoved?.()
  }
}

export function sandboxPreloadGenerationHasLiveLease(
  root: string,
  generation: string,
  isProcessAlive: (pid: number) => boolean = sandboxPreloadProcessIsAlive
): boolean {
  const directory = join(root, 'leases', generation)
  let names: string[]
  try {
    names = readdirSync(directory)
  } catch (error) {
    return !(isRecord(error) && error.code === 'ENOENT')
  }
  let retained = false
  for (const name of names) {
    const file = join(directory, name)
    const lease = readLease(file)
    if (!lease || isProcessAlive(lease.pid)) {
      retained = true
    } else {
      rmSync(file, { force: true })
    }
  }
  if (!retained) {
    rmSync(directory, { force: true, recursive: true })
  }
  return retained
}
