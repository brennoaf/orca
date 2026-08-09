import { createHash } from 'node:crypto'
import type SyncDatabase from '../sqlite/sync-database'

export type ZApiListeningValidationRecord = {
  sequence: number
  attemptId: string
  configurationId: string
  instanceId: string
  codeHash: string | null
  baselineMessageId: number
  createdAt: number
  deadlineAt: number
  monotonicCreatedAt: number
  monotonicDeadlineAt: number
  state: 'awaiting' | 'confirmed' | 'expired' | 'cancelled'
  confirmedAt: number | null
}

export type ZApiWebhookIngestContext = {
  configurationId: string
  persistedAt: number
  monotonicNow: number
}

export function validateZApiWebhookIngestContext(
  context: ZApiWebhookIngestContext | undefined
): void {
  if (
    context &&
    (!/^[a-f0-9]{32}$/u.test(context.configurationId) ||
      !Number.isSafeInteger(context.persistedAt) ||
      context.persistedAt < 0 ||
      !Number.isFinite(context.monotonicNow) ||
      context.monotonicNow < 0)
  ) {
    throw new Error('Z-API webhook ingest context is invalid.')
  }
}

type ValidationRow = {
  sequence?: unknown
  attempt_id?: unknown
  configuration_id?: unknown
  instance_id?: unknown
  code_hash?: unknown
  baseline_message_id?: unknown
  created_at?: unknown
  deadline_at?: unknown
  monotonic_created_at?: unknown
  monotonic_deadline_at?: unknown
  state?: unknown
  confirmed_at?: unknown
}

function stringField(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Invalid Z-API listening validation state.')
  }
  return value
}

function integerField(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error('Invalid Z-API listening validation state.')
  }
  return value
}

function finiteField(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('Invalid Z-API listening validation state.')
  }
  return value
}

function record(row: ValidationRow | undefined): ZApiListeningValidationRecord | null {
  if (!row) {
    return null
  }
  const state = stringField(row.state)
  if (!['awaiting', 'confirmed', 'expired', 'cancelled'].includes(state)) {
    throw new Error('Invalid Z-API listening validation state.')
  }
  const confirmedAt = row.confirmed_at === null ? null : integerField(row.confirmed_at)
  const codeHash = row.code_hash === null ? null : stringField(row.code_hash)
  return {
    sequence: integerField(row.sequence),
    attemptId: stringField(row.attempt_id),
    configurationId: stringField(row.configuration_id),
    instanceId: stringField(row.instance_id),
    codeHash,
    baselineMessageId: integerField(row.baseline_message_id),
    createdAt: integerField(row.created_at),
    deadlineAt: integerField(row.deadline_at),
    monotonicCreatedAt: finiteField(row.monotonic_created_at),
    monotonicDeadlineAt: finiteField(row.monotonic_deadline_at),
    state: state as ZApiListeningValidationRecord['state'],
    confirmedAt
  }
}

export function hashZApiListeningValidationCode(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}

export function createZApiListeningValidation(
  db: SyncDatabase,
  args: {
    attemptId: string
    configurationId: string
    instanceId: string
    codeHash: string
    createdAt: number
    deadlineAt: number
    monotonicCreatedAt: number
    monotonicDeadlineAt: number
  }
): ZApiListeningValidationRecord {
  if (
    !args.attemptId ||
    !/^[a-f0-9]{32}$/u.test(args.configurationId) ||
    !args.instanceId ||
    !/^[a-f0-9]{64}$/u.test(args.codeHash) ||
    !Number.isSafeInteger(args.createdAt) ||
    args.createdAt < 0 ||
    !Number.isSafeInteger(args.deadlineAt) ||
    args.deadlineAt <= args.createdAt ||
    !Number.isFinite(args.monotonicCreatedAt) ||
    args.monotonicCreatedAt < 0 ||
    !Number.isFinite(args.monotonicDeadlineAt) ||
    args.monotonicDeadlineAt <= args.monotonicCreatedAt
  ) {
    throw new Error('Invalid Z-API listening validation input.')
  }
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('DELETE FROM z_api_listening_validation_attempts WHERE configuration_id = ?').run(
      args.configurationId
    )
    const baseline = db
      .prepare(
        `SELECT COALESCE(MAX(id), 0) AS id FROM messages
         WHERE provider = 'z-api' AND instance_id = ?`
      )
      .get(args.instanceId) as { id?: unknown } | undefined
    const baselineMessageId = integerField(baseline?.id)
    db.prepare(
      `INSERT INTO z_api_listening_validation_attempts(
         attempt_id, configuration_id, instance_id, code_hash, baseline_message_id,
         created_at, deadline_at, monotonic_created_at, monotonic_deadline_at, state, confirmed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'awaiting', NULL)`
    ).run(
      args.attemptId,
      args.configurationId,
      args.instanceId,
      args.codeHash,
      baselineMessageId,
      args.createdAt,
      args.deadlineAt,
      args.monotonicCreatedAt,
      args.monotonicDeadlineAt
    )
    const inserted = db
      .prepare('SELECT sequence FROM z_api_listening_validation_attempts WHERE attempt_id = ?')
      .get(args.attemptId) as { sequence?: unknown } | undefined
    const sequence = integerField(inserted?.sequence)
    db.exec('COMMIT')
    return {
      ...args,
      sequence,
      baselineMessageId,
      state: 'awaiting',
      confirmedAt: null
    }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function confirmZApiListeningValidation(
  db: SyncDatabase,
  args: {
    configurationId: string
    instanceId: string
    code: string
    messageId: number
    persistedAt: number
    monotonicNow: number
  }
): void {
  expireZApiListeningValidationAttempts(db, args.monotonicNow)
  db.prepare(
    `UPDATE z_api_listening_validation_attempts
     SET state = 'confirmed', confirmed_at = ?, code_hash = NULL
     WHERE configuration_id = ? AND instance_id = ? AND state = 'awaiting'
       AND baseline_message_id < ? AND monotonic_created_at <= ?
       AND monotonic_deadline_at > ? AND code_hash = ?`
  ).run(
    args.persistedAt,
    args.configurationId,
    args.instanceId,
    args.messageId,
    args.monotonicNow,
    args.monotonicNow,
    hashZApiListeningValidationCode(args.code)
  )
}

export function readZApiListeningValidationAttempt(
  db: SyncDatabase,
  attemptId: string
): ZApiListeningValidationRecord | null {
  return record(
    db
      .prepare('SELECT * FROM z_api_listening_validation_attempts WHERE attempt_id = ?')
      .get(attemptId) as ValidationRow | undefined
  )
}

export function readLatestZApiListeningValidationAttempt(
  db: SyncDatabase,
  configurationId: string
): ZApiListeningValidationRecord | null {
  return record(
    db
      .prepare(
        `SELECT * FROM z_api_listening_validation_attempts
         WHERE configuration_id = ? ORDER BY sequence DESC LIMIT 1`
      )
      .get(configurationId) as ValidationRow | undefined
  )
}

export function readZApiListeningValidationConfirmedAt(
  db: SyncDatabase,
  configurationId: string
): number | null {
  const row = db
    .prepare(
      `SELECT MAX(confirmed_at) AS confirmed_at FROM z_api_listening_validation_attempts
       WHERE configuration_id = ? AND state = 'confirmed'`
    )
    .get(configurationId) as { confirmed_at?: unknown } | undefined
  return row?.confirmed_at === null || row?.confirmed_at === undefined
    ? null
    : integerField(row.confirmed_at)
}

export function expireZApiListeningValidationAttempts(
  db: SyncDatabase,
  monotonicNow: number
): void {
  db.prepare(
    `UPDATE z_api_listening_validation_attempts SET state = 'expired', code_hash = NULL
     WHERE state = 'awaiting' AND monotonic_deadline_at <= ?`
  ).run(monotonicNow)
}

export function cancelZApiListeningValidationAttempt(db: SyncDatabase, attemptId: string): void {
  db.prepare(
    `UPDATE z_api_listening_validation_attempts SET state = 'cancelled', code_hash = NULL
     WHERE attempt_id = ? AND state = 'awaiting'`
  ).run(attemptId)
}

export function cancelPendingZApiListeningValidations(db: SyncDatabase): void {
  db.prepare(
    `UPDATE z_api_listening_validation_attempts SET state = 'cancelled', code_hash = NULL
     WHERE state = 'awaiting'`
  ).run()
}

export function clearZApiListeningValidations(db: SyncDatabase, configurationId: string): void {
  db.prepare('DELETE FROM z_api_listening_validation_attempts WHERE configuration_id = ?').run(
    configurationId
  )
}

export function clearZApiListeningValidationsForInstance(
  db: SyncDatabase,
  instanceId: string
): void {
  db.prepare('DELETE FROM z_api_listening_validation_attempts WHERE instance_id = ?').run(
    instanceId
  )
}

export function retainZApiListeningValidationConfiguration(
  db: SyncDatabase,
  configurationId: string | null
): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    if (configurationId === null) {
      db.prepare('DELETE FROM z_api_listening_validation_attempts').run()
    } else {
      db.prepare('DELETE FROM z_api_listening_validation_attempts WHERE configuration_id <> ?').run(
        configurationId
      )
      db.prepare(
        `DELETE FROM z_api_listening_validation_attempts
         WHERE configuration_id = ? AND sequence < (
           SELECT MAX(sequence) FROM z_api_listening_validation_attempts WHERE configuration_id = ?
         )`
      ).run(configurationId, configurationId)
      db.prepare(
        `UPDATE z_api_listening_validation_attempts SET code_hash = NULL
         WHERE configuration_id = ? AND state <> 'awaiting'`
      ).run(configurationId)
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
