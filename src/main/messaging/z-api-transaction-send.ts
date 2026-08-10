import { randomUUID } from 'node:crypto'
import type { MessagingReplyDestination } from './message-store'
import { isZApiGroupConversationAddress } from './z-api-message-normalizer'
import { ZApiAmbiguousSendError } from './z-api-communication-client'
import type { ZApiSendTextResult } from './z-api-communication-client-contract'
import type { ZApiTransactionActive } from './z-api-transaction-journal'
import {
  ZApiTransactionError,
  type ZApiTransactionServiceDependencies
} from './z-api-transaction-contract'

export class ZApiPostAcceptPersistenceError extends ZApiTransactionError {
  readonly retrySafe = false
  readonly providerAccepted = true

  constructor() {
    super(
      'message_persistence_failed',
      'The provider accepted the message, but local persistence failed.'
    )
    this.name = 'ZApiPostAcceptPersistenceError'
  }
}

function bestEffortMarkUnknown(
  dependencies: ZApiTransactionServiceDependencies,
  clientMessageId: string,
  instanceId: string
): boolean {
  try {
    dependencies.messageStore.markOutboundUnknown(clientMessageId, instanceId)
    return true
  } catch {
    return false
  }
}

function replyDestination(
  dependencies: ZApiTransactionServiceDependencies,
  conversationId: number,
  instanceId: string
): MessagingReplyDestination {
  const destination = dependencies.messageStore.getReplyDestination(conversationId)
  if (!destination || destination.instanceId !== instanceId) {
    throw new ZApiTransactionError(
      'invalid_configuration',
      'The conversation does not belong to the active Z-API instance.'
    )
  }
  if (
    destination.conversationKind === 'newsletter' ||
    destination.conversationKind === 'broadcast'
  ) {
    throw new ZApiTransactionError(
      'conversation_not_replyable',
      'Z-API newsletters and broadcast lists do not support replies.'
    )
  }
  if (
    destination.conversationKind === 'group' &&
    !isZApiGroupConversationAddress(destination.conversationAddress)
  ) {
    throw new ZApiTransactionError(
      'invalid_configuration',
      'The stored Z-API group destination is invalid.'
    )
  }
  return destination
}

export async function sendZApiTransactionText(args: {
  active: ZApiTransactionActive
  conversationId: number
  text: string
  replyTo?: string
  dependencies: ZApiTransactionServiceDependencies
}): Promise<ZApiSendTextResult> {
  if (args.text.length === 0 || args.replyTo === '') {
    throw new ZApiTransactionError('invalid_configuration', 'Message text is invalid.')
  }
  const { dependencies, active } = args
  const destination = replyDestination(
    dependencies,
    args.conversationId,
    active.configuration.instanceId
  )
  const clientMessageId = (dependencies.randomClientMessageId ?? randomUUID)()
  dependencies.messageStore.registerOutboundPending({
    instanceId: active.configuration.instanceId,
    conversationAddress: destination.conversationAddress,
    conversationKind: destination.conversationKind,
    clientMessageId,
    text: args.text,
    occurredAt: (dependencies.now ?? Date.now)()
  })
  const client = dependencies.createClient(active.configuration)
  let result: ZApiSendTextResult
  try {
    result = await client.sendText({
      destination: destination.conversationAddress,
      message: args.text,
      ...(args.replyTo === undefined ? {} : { replyMessageId: args.replyTo })
    })
  } catch (error) {
    if (error instanceof ZApiAmbiguousSendError) {
      dependencies.messageStore.markOutboundUnknown(
        clientMessageId,
        active.configuration.instanceId
      )
      throw error
    }
    dependencies.messageStore.markOutboundFailed(clientMessageId, active.configuration.instanceId)
    throw error
  }
  try {
    dependencies.messageStore.markOutboundSent(
      clientMessageId,
      active.configuration.instanceId,
      result.messageId
    )
  } catch {
    void bestEffortMarkUnknown(dependencies, clientMessageId, active.configuration.instanceId)
    throw new ZApiPostAcceptPersistenceError()
  }
  return result
}
