import type SyncDatabase from '../sqlite/sync-database'
import {
  cancelPendingZApiListeningValidations,
  cancelZApiListeningValidationAttempt,
  clearZApiListeningValidations,
  clearZApiListeningValidationsForInstance,
  createZApiListeningValidation,
  expireZApiListeningValidationAttempts,
  readLatestZApiListeningValidationAttempt,
  readZApiListeningValidationAttempt,
  readZApiListeningValidationConfirmedAt,
  retainZApiListeningValidationConfiguration,
  type ZApiListeningValidationRecord
} from './z-api-listening-validation-store'

export class ZApiListeningValidationDatabase {
  constructor(private readonly db: SyncDatabase) {}

  create(args: {
    attemptId: string
    configurationId: string
    instanceId: string
    codeHash: string
    createdAt: number
    deadlineAt: number
    monotonicCreatedAt: number
    monotonicDeadlineAt: number
  }): ZApiListeningValidationRecord {
    return createZApiListeningValidation(this.db, args)
  }

  readAttempt(attemptId: string): ZApiListeningValidationRecord | null {
    return readZApiListeningValidationAttempt(this.db, attemptId)
  }

  readLatestAttempt(configurationId: string): ZApiListeningValidationRecord | null {
    return readLatestZApiListeningValidationAttempt(this.db, configurationId)
  }

  readConfirmedAt(configurationId: string): number | null {
    return readZApiListeningValidationConfirmedAt(this.db, configurationId)
  }

  expire(now: number): void {
    expireZApiListeningValidationAttempts(this.db, now)
  }

  cancel(attemptId: string): void {
    cancelZApiListeningValidationAttempt(this.db, attemptId)
  }

  cancelPending(): void {
    cancelPendingZApiListeningValidations(this.db)
  }

  clear(configurationId: string): void {
    clearZApiListeningValidations(this.db, configurationId)
  }

  clearInstance(instanceId: string): void {
    clearZApiListeningValidationsForInstance(this.db, instanceId)
  }

  retain(configurationId: string | null): void {
    retainZApiListeningValidationConfiguration(this.db, configurationId)
  }
}
