import type {
  FloatingCommsDetachRequest,
  FloatingCommsSessionState
} from '../../shared/floating-comms-surface'
import type { FloatingCommsAttachedRecord } from './floating-comms-detached-surface-controller'
import { destroyAttachedFloatingCommsWindow } from './floating-comms-attached-window'
import { emitFloatingCommsSurfaceChange } from './floating-comms-surface-presentation'

export function takeAttachedFloatingCommsForDock(
  record: FloatingCommsAttachedRecord,
  request: FloatingCommsDetachRequest
): FloatingCommsSessionState {
  if (record.identity.appId !== request.sessionState.appId) {
    throw new Error('floating_comms_session_app_mismatch')
  }
  destroyAttachedFloatingCommsWindow(record.identity)
  emitFloatingCommsSurfaceChange(record.identity, null, 'detached', request.sessionState)
  return request.sessionState
}
