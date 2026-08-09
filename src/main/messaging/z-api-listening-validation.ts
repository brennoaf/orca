import { randomBytes, randomUUID } from 'node:crypto'
import type {
  CommunicationIntegrationRedactedError,
  ZApiListeningValidationSnapshot
} from '../../shared/communication-integrations'
import {
  hashZApiListeningValidationCode,
  type ZApiListeningValidationRecord
} from './z-api-listening-validation-store'
import type { ZApiListeningValidationDatabase } from './z-api-listening-validation-database'
import { ZApiTransactionError } from './z-api-transaction-contract'

const VALIDATION_TTL_MS = 180_000

type ActiveValidation = {
  attemptId: string
  configurationId: string
  code: string
  monotonicDeadlineAt: number
}

type ValidationDependencies = {
  wallNow?: () => number
  monotonicNow?: () => number
  randomCode?: () => string
  randomAttemptId?: () => string
}

function iso(value: number): string {
  return new Date(value).toISOString()
}

function notStarted(): ZApiListeningValidationSnapshot {
  return {
    state: 'not_started',
    attemptId: null,
    code: null,
    deadline: null,
    remainingMs: null,
    confirmedAt: null,
    error: null
  }
}

function failed(error: CommunicationIntegrationRedactedError): ZApiListeningValidationSnapshot {
  return {
    state: 'failed',
    attemptId: null,
    code: null,
    deadline: null,
    remainingMs: null,
    confirmedAt: null,
    error
  }
}

export class ZApiListeningValidation {
  private active: ActiveValidation | null = null

  constructor(
    private readonly store: ZApiListeningValidationDatabase,
    private readonly dependencies: ValidationDependencies = {}
  ) {}

  start(configuration: {
    configurationId: string
    instanceId: string
  }): ZApiListeningValidationSnapshot {
    if (
      !/^[a-f0-9]{32}$/u.test(configuration.configurationId) ||
      !configuration.instanceId ||
      configuration.instanceId.trim() !== configuration.instanceId
    ) {
      throw new ZApiTransactionError('invalid_configuration', 'Z-API configuration is invalid.')
    }
    const wallNow = (this.dependencies.wallNow ?? Date.now)()
    const monotonicNow = (this.dependencies.monotonicNow ?? (() => performance.now()))()
    this.persist(() => this.store.expire(monotonicNow))
    const active = this.active
    if (active?.configurationId === configuration.configurationId) {
      const current = this.persist(() => this.store.readAttempt(active.attemptId))
      if (current?.state === 'awaiting') {
        return this.snapshot(current, monotonicNow)
      }
      this.active = null
    } else if (active) {
      this.persist(() => this.store.cancel(active.attemptId))
      this.active = null
    }
    const code = `orca-${(this.dependencies.randomCode ?? (() => randomBytes(12).toString('hex')))()}`
    const attemptId = (this.dependencies.randomAttemptId ?? randomUUID)()
    if (!/^orca-[a-f0-9]{24}$/u.test(code) || !attemptId) {
      throw new ZApiTransactionError(
        'invalid_configuration',
        'Z-API listening validation could not be created.'
      )
    }
    const record = this.persist(() =>
      this.store.create({
        attemptId,
        configurationId: configuration.configurationId,
        instanceId: configuration.instanceId,
        codeHash: hashZApiListeningValidationCode(code),
        createdAt: wallNow,
        deadlineAt: wallNow + VALIDATION_TTL_MS,
        monotonicCreatedAt: monotonicNow,
        monotonicDeadlineAt: monotonicNow + VALIDATION_TTL_MS
      })
    )
    this.active = {
      attemptId,
      configurationId: configuration.configurationId,
      code,
      monotonicDeadlineAt: record.monotonicDeadlineAt
    }
    return this.snapshot(record, monotonicNow)
  }

  status(configurationId: string | null): ZApiListeningValidationSnapshot {
    if (!configurationId) {
      return notStarted()
    }
    try {
      const monotonicNow = (this.dependencies.monotonicNow ?? (() => performance.now()))()
      this.store.expire(monotonicNow)
      const record = this.store.readLatestAttempt(configurationId)
      if (!record) {
        return notStarted()
      }
      if (record.state !== 'awaiting' && this.active?.attemptId === record.attemptId) {
        this.active = null
      }
      if (record.state === 'awaiting' && this.active?.attemptId !== record.attemptId) {
        this.store.cancel(record.attemptId)
        const cancelled = this.store.readAttempt(record.attemptId)
        return cancelled ? this.snapshot(cancelled, monotonicNow) : notStarted()
      }
      return this.snapshot(record, monotonicNow)
    } catch {
      return failed({
        code: 'message_persistence_failed',
        message: 'Z-API listening validation state is unavailable.',
        field: null
      })
    }
  }

  cancel(attemptId: string): ZApiListeningValidationSnapshot {
    return this.persist(() => {
      const monotonicNow = (this.dependencies.monotonicNow ?? (() => performance.now()))()
      this.store.expire(monotonicNow)
      const record = this.store.readAttempt(attemptId)
      if (!record) {
        throw new ZApiTransactionError(
          'invalid_configuration',
          'Z-API listening validation does not exist.'
        )
      }
      this.store.cancel(attemptId)
      if (this.active?.attemptId === attemptId) {
        this.active = null
      }
      return this.snapshot(this.store.readAttempt(attemptId) ?? record, monotonicNow)
    })
  }

  cancelPending(): void {
    const active = this.active
    if (!active) {
      return
    }
    this.persist(() => {
      this.store.expire((this.dependencies.monotonicNow ?? (() => performance.now()))())
      this.store.cancel(active.attemptId)
      this.active = null
    })
  }

  clear(configurationId: string): void {
    if (this.active?.configurationId === configurationId) {
      this.active = null
    }
    this.persist(() => this.store.clear(configurationId))
  }

  clearInstance(instanceId: string): void {
    this.active = null
    this.persist(() => this.store.clearInstance(instanceId))
  }

  retain(configurationId: string | null): void {
    if (this.active?.configurationId !== configurationId) {
      this.active = null
    }
    this.persist(() => this.store.retain(configurationId))
  }

  confirmedAt(configurationId: string | null): number | null {
    return configurationId ? this.persist(() => this.store.readConfirmedAt(configurationId)) : null
  }

  private persist<T>(run: () => T): T {
    try {
      return run()
    } catch (error) {
      if (error instanceof ZApiTransactionError) {
        throw error
      }
      throw new ZApiTransactionError(
        'message_persistence_failed',
        'Z-API listening validation could not be persisted.',
        { cause: error }
      )
    }
  }

  private snapshot(
    record: ZApiListeningValidationRecord,
    monotonicNow: number
  ): ZApiListeningValidationSnapshot {
    const deadline = iso(record.deadlineAt)
    if (record.state === 'awaiting') {
      const active = this.active?.attemptId === record.attemptId ? this.active : null
      if (!active) {
        return failed({
          code: 'message_persistence_failed',
          message: 'Z-API listening validation state is unavailable.',
          field: null
        })
      }
      return {
        state: 'awaiting',
        attemptId: record.attemptId,
        code: active.code,
        deadline,
        remainingMs: Math.max(0, active.monotonicDeadlineAt - monotonicNow),
        confirmedAt: null,
        error: null
      }
    }
    if (record.state === 'confirmed' && record.confirmedAt !== null) {
      return {
        state: 'confirmed',
        attemptId: record.attemptId,
        code: null,
        deadline,
        remainingMs: 0,
        confirmedAt: iso(record.confirmedAt),
        error: null
      }
    }
    if (record.state === 'confirmed') {
      return failed({
        code: 'message_persistence_failed',
        message: 'Z-API listening validation state is unavailable.',
        field: null
      })
    }
    return {
      state: record.state,
      attemptId: record.attemptId,
      code: null,
      deadline,
      remainingMs: 0,
      confirmedAt: null,
      error: null
    }
  }
}
