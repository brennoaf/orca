import {
  DEFAULT_Z_API_BASE_URL,
  type SaveAndConfigureZApiParams,
  type ZApiCommunicationIntegrationStatus,
  type ZApiCommunicationOperationResult,
  type ZApiConversationPage,
  type ZApiMessagePage,
  type ZApiPreparedIngressSnapshot,
  type ZApiSecretMutation,
  type ZApiSendReplyResult,
  type ZApiListeningValidationSnapshot
} from '../../shared/communication-integrations'
import {
  assertCommunicationEndpointTrust,
  CommunicationApiError,
  normalizeCommunicationApiEndpoint
} from './communication-api-endpoint'
import {
  clearZApiCommunicationCredentials,
  readZApiCommunicationCredentials
} from './z-api-communication-credential-store'
import {
  currentZApiConfiguration,
  disposeZApiCommunicationRuntime,
  getZApiCommunicationRuntime,
  runZApiCommunicationOperation,
  zApiStatusFromRuntime
} from './z-api-communication-runtime'
import { ZApiTransactionError } from './z-api-transaction-service'

function resolveSecret(
  mutation: ZApiSecretMutation,
  current: string | null | undefined,
  field: 'instanceToken' | 'clientToken'
): string {
  if (mutation.action === 'replace') {
    return mutation.value
  }
  if (current) {
    return current
  }
  throw new CommunicationApiError(
    'invalid_configuration',
    `${field === 'instanceToken' ? 'Instance token' : 'Client token'} is required.`
  )
}

export async function prepareZApiIngress(
  listenPort: number
): Promise<ZApiCommunicationOperationResult<ZApiPreparedIngressSnapshot>> {
  return runZApiCommunicationOperation((runtime) => runtime.service.prepareIngress(listenPort))
}

export async function discardPreparedZApiIngress(): Promise<
  ZApiCommunicationOperationResult<undefined>
> {
  return runZApiCommunicationOperation(async (runtime) => {
    await runtime.service.discardPreparedIngress()
    return undefined
  })
}

export async function saveAndConfigureZApi(
  input: SaveAndConfigureZApiParams
): Promise<ZApiCommunicationOperationResult<undefined>> {
  return runZApiCommunicationOperation(async (runtime) => {
    const journal = runtime.journal.read()
    if (journal.pending) {
      throw new ZApiTransactionError(
        'webhook_restore_failed',
        'Resolve the pending Z-API webhook repair before saving.'
      )
    }
    runtime.listeningValidation.cancelPending()
    const active = journal.active?.configuration ?? null
    const legacy = active ? null : readZApiCommunicationCredentials()
    const apiEndpoint = normalizeCommunicationApiEndpoint(input.apiBaseUrl)
    assertCommunicationEndpointTrust(apiEndpoint, input.endpointTrust, DEFAULT_Z_API_BASE_URL)
    const preparedIngress = await runtime.service.prepareIngress(input.listenPort)
    await runtime.service.saveAndConfigure({
      instanceId: input.instanceId,
      instanceToken: resolveSecret(
        input.instanceToken,
        active?.instanceToken ?? legacy?.instanceToken,
        'instanceToken'
      ),
      clientToken: resolveSecret(
        input.clientToken,
        active?.clientToken ?? legacy?.clientToken,
        'clientToken'
      ),
      baseUrl: apiEndpoint.baseUrl,
      endpointTrust: input.endpointTrust,
      publicWebhookBaseUrl: input.publicWebhookBaseUrl,
      listenPort: preparedIngress.listenPort,
      preparedIngress
    })
    const configuration = currentZApiConfiguration(runtime)
    if (active && configuration && active.configurationId !== configuration.configurationId) {
      runtime.listeningValidation.clear(active.configurationId)
    }
    clearZApiCommunicationCredentials()
    return undefined
  })
}

export async function removeZApiCommunicationIntegration(): Promise<
  ZApiCommunicationOperationResult<undefined>
> {
  return runZApiCommunicationOperation(async (runtime) => {
    const configuration = currentZApiConfiguration(runtime)
    runtime.listeningValidation.cancelPending()
    await runtime.service.remove()
    if (configuration) {
      runtime.listeningValidation.clearInstance(configuration.instanceId)
    }
    clearZApiCommunicationCredentials()
    return undefined
  })
}

export async function startZApiListeningValidation(): Promise<
  ZApiCommunicationOperationResult<ZApiListeningValidationSnapshot>
> {
  return runZApiCommunicationOperation((runtime) => {
    const journal = runtime.journal.read()
    const active = journal.active
    const status = runtime.service.getStatus()
    if (
      !active ||
      journal.pending ||
      !status.configured ||
      !status.verified ||
      !status.ingress.prepared ||
      !status.ingress.challengeVerified ||
      !status.ingress.webhooksVerified
    ) {
      throw new ZApiTransactionError(
        'not_configured',
        'Z-API receiving must be configured before validation.'
      )
    }
    return runtime.listeningValidation.start({
      configurationId: active.configuration.configurationId,
      instanceId: active.configuration.instanceId
    })
  })
}

export async function cancelZApiListeningValidation(
  attemptId: string
): Promise<ZApiCommunicationOperationResult<ZApiListeningValidationSnapshot>> {
  return runZApiCommunicationOperation((runtime) => runtime.listeningValidation.cancel(attemptId))
}

export async function getZApiCommunicationIntegrationStatus(): Promise<ZApiCommunicationIntegrationStatus> {
  return zApiStatusFromRuntime(await getZApiCommunicationRuntime())
}

export async function listZApiConversations(args: {
  limit: number
  offset: number
}): Promise<ZApiConversationPage> {
  const runtime = await getZApiCommunicationRuntime()
  const configuration = currentZApiConfiguration(runtime)
  if (!configuration) {
    return { conversations: [], nextOffset: null }
  }
  const rows = runtime.store.listConversations(
    args.limit + 1,
    args.offset,
    configuration.instanceId
  )
  return {
    conversations: rows.slice(0, args.limit).map((conversation) => ({
      id: conversation.id,
      conversationKind: conversation.conversationKind,
      displayName: conversation.displayName,
      lastMessageAt: conversation.lastMessageAt
    })),
    nextOffset: rows.length > args.limit ? args.offset + args.limit : null
  }
}

export async function listZApiMessages(args: {
  conversationId: number
  limit: number
  offset: number
}): Promise<ZApiMessagePage> {
  const runtime = await getZApiCommunicationRuntime()
  const configuration = currentZApiConfiguration(runtime)
  const destination = runtime.store.getReplyDestination(args.conversationId)
  if (!configuration || destination?.instanceId !== configuration.instanceId) {
    throw new ZApiTransactionError(
      'invalid_configuration',
      'The conversation does not belong to the active Z-API instance.'
    )
  }
  const rows = runtime.store.listRecentMessages(args.conversationId, args.limit + 1, args.offset)
  return {
    messages: rows.slice(rows.length > args.limit ? 1 : 0).map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      providerMessageId: message.providerMessageId,
      senderName: message.senderName,
      direction: message.direction,
      contentKind: message.contentKind,
      text: message.text,
      providerContentType: message.providerContentType,
      occurredAt: message.occurredAt,
      deliveryStatus: message.deliveryStatus
    })),
    nextOffset: rows.length > args.limit ? args.offset + args.limit : null
  }
}

export async function sendZApiReply(args: {
  conversationId: number
  text: string
  replyTo?: string
}): Promise<ZApiCommunicationOperationResult<ZApiSendReplyResult>> {
  return runZApiCommunicationOperation(async (runtime) => {
    const result = await runtime.service.sendText(args)
    return { providerMessageId: result.messageId, deliveryStatus: 'sent' }
  })
}

export function disposeZApiCommunicationIntegration(): Promise<void> {
  return disposeZApiCommunicationRuntime()
}
