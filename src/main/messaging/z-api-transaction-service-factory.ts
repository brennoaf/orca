import type { MessageStore } from './message-store'
import type { CommunicationApiRequestDependencies } from './communication-api-endpoint'
import { verifyCommunicationWebhookChallenge } from './communication-webhook-challenge'
import { ZApiCommunicationClient } from './z-api-communication-client'
import type { ZApiTransactionJournalPort } from './z-api-transaction-contract'
import { ZApiTransactionJournal } from './z-api-transaction-journal'
import { ZApiTransactionService } from './z-api-transaction-service'
import { ZApiWebhookReceiver } from './z-api-webhook-receiver'

export function createZApiTransactionService(args: {
  messageStore: MessageStore
  onReceiverError: (error: Error) => void
  apiDependencies?: CommunicationApiRequestDependencies
  journal?: ZApiTransactionJournalPort
}): ZApiTransactionService {
  args.messageStore.recoverPendingOutbound()
  const journal = args.journal ?? new ZApiTransactionJournal()
  return new ZApiTransactionService({
    journal,
    messageStore: args.messageStore,
    createReceiver: ({ port, path }) =>
      new ZApiWebhookReceiver({
        port,
        path,
        expectedConfiguration: null,
        store: args.messageStore,
        onError: args.onReceiverError
      }),
    createClient: (configuration) =>
      new ZApiCommunicationClient(
        {
          baseUrl: configuration.baseUrl,
          endpointTrust: configuration.endpointTrust,
          instanceId: configuration.instanceId,
          instanceToken: configuration.instanceToken,
          clientToken: configuration.clientToken
        },
        args.apiDependencies
      ),
    verifyChallenge: async (challenge) => {
      await verifyCommunicationWebhookChallenge(challenge, args.apiDependencies)
    }
  })
}
