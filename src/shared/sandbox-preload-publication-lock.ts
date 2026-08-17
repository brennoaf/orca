import { randomUUID } from 'node:crypto'
import { closeSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const LOCK_FILE = '.publish.lock'
const RECLAIM_FENCE_FILE = '.publish.reclaim'

type SandboxPreloadExclusiveOwner = {
  pid: number
  token: string
}

export type SandboxPreloadPublicationLockOptions = {
  afterLockCreated?: (lock: SandboxPreloadPublicationLock) => void
  afterStaleOwnerRead?: (lock: SandboxPreloadPublicationLock) => void
  isProcessAlive?: (pid: number) => boolean
  retryIntervalMs?: number
  sleep?: (milliseconds: number) => void
  waitTimeoutMs?: number
}

export type SandboxPreloadPublicationLock = {
  file: string
  owner: SandboxPreloadExclusiveOwner
}

type ReadExclusiveOwner = {
  owner: SandboxPreloadExclusiveOwner
  source: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeOwner(value: unknown): SandboxPreloadExclusiveOwner | null {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'pid,token') {
    return null
  }
  if (
    !Number.isSafeInteger(value.pid) ||
    Number(value.pid) <= 0 ||
    typeof value.token !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(value.token)
  ) {
    return null
  }
  return { pid: Number(value.pid), token: value.token }
}

export function sandboxPreloadProcessIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return !(isRecord(error) && error.code === 'ESRCH')
  }
}

function wait(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

function readOwner(file: string): ReadExclusiveOwner | null {
  try {
    const source = readFileSync(file, 'utf8')
    const owner = normalizeOwner(JSON.parse(source))
    return owner ? { owner, source } : null
  } catch {
    return null
  }
}

function exclusiveFileExists(file: string): boolean {
  try {
    statSync(file)
    return true
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') {
      return false
    }
    return true
  }
}

function tryCreateOwnedFile(file: string, owner: SandboxPreloadExclusiveOwner): boolean {
  let descriptor: number | null = null
  try {
    descriptor = openSync(file, 'wx')
    writeFileSync(descriptor, JSON.stringify(owner))
    closeSync(descriptor)
    descriptor = null
    return true
  } catch (error) {
    if (descriptor !== null) {
      try {
        closeSync(descriptor)
      } finally {
        rmSync(file, { force: true })
      }
    }
    if (isRecord(error) && error.code === 'EEXIST') {
      return false
    }
    throw error
  }
}

function ownerMatches(file: string, owner: SandboxPreloadExclusiveOwner): boolean {
  const current = readOwner(file)
  return current?.owner.pid === owner.pid && current.owner.token === owner.token
}

function releaseOwnedFile(file: string, owner: SandboxPreloadExclusiveOwner): void {
  if (ownerMatches(file, owner)) {
    rmSync(file, { force: true })
  }
}

function removeMatchingSource(file: string, expected: ReadExclusiveOwner): boolean {
  const confirmed = readOwner(file)
  if (confirmed?.source !== expected.source) {
    return false
  }
  rmSync(file, { force: true })
  return true
}

function waitForRetry(
  deadline: number,
  retryIntervalMs: number,
  sleep: (milliseconds: number) => void
): void {
  const remaining = deadline - Date.now()
  if (remaining <= 0) {
    throw new Error('sandbox_preload_publication_lock_timeout')
  }
  sleep(Math.min(retryIntervalMs, remaining))
}

export function acquireSandboxPreloadPublicationLock(
  root: string,
  options: SandboxPreloadPublicationLockOptions = {}
): SandboxPreloadPublicationLock {
  const file = join(root, LOCK_FILE)
  const fenceFile = join(root, RECLAIM_FENCE_FILE)
  const owner = { pid: process.pid, token: randomUUID() }
  const lock = { file, owner }
  const isProcessAlive = options.isProcessAlive ?? sandboxPreloadProcessIsAlive
  const sleep = options.sleep ?? wait
  const retryIntervalMs = options.retryIntervalMs ?? 25
  const waitTimeoutMs = options.waitTimeoutMs ?? 5_000
  const deadline = Date.now() + waitTimeoutMs
  while (true) {
    if (exclusiveFileExists(fenceFile)) {
      waitForRetry(deadline, retryIntervalMs, sleep)
      continue
    }
    if (tryCreateOwnedFile(file, owner)) {
      try {
        options.afterLockCreated?.(lock)
        if (!exclusiveFileExists(fenceFile) && ownerMatches(file, owner)) {
          return lock
        }
      } catch (error) {
        releaseOwnedFile(file, owner)
        throw error
      }
      releaseOwnedFile(file, owner)
      waitForRetry(deadline, retryIntervalMs, sleep)
      continue
    }
    const current = readOwner(file)
    if (current && !isProcessAlive(current.owner.pid)) {
      options.afterStaleOwnerRead?.({ file, owner: current.owner })
      const fenceOwner = { pid: process.pid, token: randomUUID() }
      if (tryCreateOwnedFile(fenceFile, fenceOwner)) {
        let reclaimed = false
        try {
          const confirmed = readOwner(file)
          if (
            confirmed?.source === current.source &&
            !isProcessAlive(confirmed.owner.pid) &&
            removeMatchingSource(file, confirmed)
          ) {
            reclaimed = tryCreateOwnedFile(file, owner)
            if (reclaimed) {
              options.afterLockCreated?.(lock)
              if (!ownerMatches(fenceFile, fenceOwner) || !ownerMatches(file, owner)) {
                releaseOwnedFile(file, owner)
                reclaimed = false
              }
            }
          }
        } catch (error) {
          if (reclaimed) {
            releaseOwnedFile(file, owner)
          }
          throw error
        } finally {
          releaseOwnedFile(fenceFile, fenceOwner)
        }
        if (reclaimed) {
          return lock
        }
      }
    }
    waitForRetry(deadline, retryIntervalMs, sleep)
  }
}

export function releaseSandboxPreloadPublicationLock(lock: SandboxPreloadPublicationLock): void {
  releaseOwnedFile(lock.file, lock.owner)
}
