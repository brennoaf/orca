import { z } from 'zod'
import {
  cancelZApiListeningValidation,
  clearCommunicationIntegration,
  discardPreparedZApiIngress,
  getZApiCommunicationIntegrationStatus,
  getCommunicationIntegrationStatuses,
  listZApiConversations,
  listZApiMessages,
  prepareZApiIngress,
  removeZApiCommunicationIntegration,
  saveAndConfigureZApi,
  saveCommunicationIntegration,
  sendZApiReply,
  startZApiListeningValidation,
  testCommunicationIntegration
} from '../../../messaging/communication-integration-registry'
import { defineMethod, type RpcContext, type RpcMethod } from '../core'

const Provider = z.enum(['discord', 'slack'])

const ProviderParams = z.object({ provider: Provider }).strict()

const SecretMutation = z.discriminatedUnion('action', [
  z.object({ action: z.literal('keep') }).strict(),
  z.object({ action: z.literal('clear') }).strict(),
  z
    .object({
      action: z.literal('replace'),
      value: z.string().trim().min(1).max(4_096)
    })
    .strict()
])

const EndpointTrust = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('default') }).strict(),
  z
    .object({
      kind: z.literal('custom'),
      authority: z.string().trim().min(1).max(2_048)
    })
    .strict()
])

const SaveParams = z.discriminatedUnion('provider', [
  z
    .object({
      provider: z.literal('discord'),
      clientId: z
        .string()
        .trim()
        .regex(/^\d{17,20}$/),
      clientSecret: SecretMutation
    })
    .strict(),
  z
    .object({
      provider: z.literal('slack'),
      baseUrl: z.string().trim().min(1).max(2_048),
      endpointTrust: EndpointTrust,
      appToken: SecretMutation,
      userToken: SecretMutation
    })
    .strict()
])

const ZApiSecretMutation = z.discriminatedUnion('action', [
  z.object({ action: z.literal('keep') }).strict(),
  z
    .object({
      action: z.literal('replace'),
      value: z.string().trim().min(1).max(4_096)
    })
    .strict()
])

const ZApiPrepareIngressParams = z
  .object({ listenPort: z.number().int().min(0).max(65_535) })
  .strict()

const ZApiSaveAndConfigureParams = z
  .object({
    instanceId: z.string().trim().min(1).max(256),
    instanceToken: ZApiSecretMutation,
    clientToken: ZApiSecretMutation,
    apiBaseUrl: z.string().trim().min(1).max(2_048),
    endpointTrust: EndpointTrust,
    publicWebhookBaseUrl: z.string().trim().min(1).max(2_048),
    listenPort: z.number().int().min(1).max(65_535)
  })
  .strict()

const PaginationParams = z
  .object({
    limit: z.number().int().min(1).max(100).default(20),
    offset: z.number().int().min(0).max(1_000_000).default(0)
  })
  .strict()

const ZApiMessageParams = PaginationParams.extend({
  conversationId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
}).strict()

const ZApiSendReplyParams = z
  .object({
    conversationId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    text: z.string().min(1).max(4_096),
    replyTo: z.string().trim().min(1).max(512).optional()
  })
  .strict()

const ZApiListeningValidationParams = z.object({ attemptId: z.string().uuid() }).strict()

function assertLocalWindow(ctx: RpcContext): void {
  if (ctx.clientKind !== undefined) {
    throw new Error('Communication integration credentials are only available to local windows.')
  }
}

export const COMMUNICATION_INTEGRATION_METHODS: RpcMethod[] = [
  defineMethod({
    name: 'communicationIntegrations.getStatuses',
    params: null,
    handler: (_params, ctx) => {
      assertLocalWindow(ctx)
      return getCommunicationIntegrationStatuses()
    }
  }),
  defineMethod({
    name: 'communicationIntegrations.save',
    params: SaveParams,
    handler: (params, ctx) => {
      assertLocalWindow(ctx)
      return saveCommunicationIntegration(params)
    }
  }),
  defineMethod({
    name: 'communicationIntegrations.clear',
    params: ProviderParams,
    handler: (params, ctx) => {
      assertLocalWindow(ctx)
      return clearCommunicationIntegration(params.provider)
    }
  }),
  defineMethod({
    name: 'communicationIntegrations.test',
    params: ProviderParams,
    handler: (params, ctx) => {
      assertLocalWindow(ctx)
      return testCommunicationIntegration(params.provider)
    }
  }),
  defineMethod({
    name: 'communicationIntegrations.zApi.prepareIngress',
    params: ZApiPrepareIngressParams,
    handler: (params, ctx) => {
      assertLocalWindow(ctx)
      return prepareZApiIngress(params.listenPort)
    }
  }),
  defineMethod({
    name: 'communicationIntegrations.zApi.discardPreparedIngress',
    params: null,
    handler: (_params, ctx) => {
      assertLocalWindow(ctx)
      return discardPreparedZApiIngress()
    }
  }),
  defineMethod({
    name: 'communicationIntegrations.zApi.saveAndConfigure',
    params: ZApiSaveAndConfigureParams,
    handler: (params, ctx) => {
      assertLocalWindow(ctx)
      return saveAndConfigureZApi(params)
    }
  }),
  defineMethod({
    name: 'communicationIntegrations.zApi.getStatus',
    params: null,
    handler: (_params, ctx) => {
      assertLocalWindow(ctx)
      return getZApiCommunicationIntegrationStatus()
    }
  }),
  defineMethod({
    name: 'communicationIntegrations.zApi.startListeningValidation',
    params: null,
    handler: (_params, ctx) => {
      assertLocalWindow(ctx)
      return startZApiListeningValidation()
    }
  }),
  defineMethod({
    name: 'communicationIntegrations.zApi.cancelListeningValidation',
    params: ZApiListeningValidationParams,
    handler: (params, ctx) => {
      assertLocalWindow(ctx)
      return cancelZApiListeningValidation(params.attemptId)
    }
  }),
  defineMethod({
    name: 'communicationIntegrations.zApi.listConversations',
    params: PaginationParams,
    handler: (params, ctx) => {
      assertLocalWindow(ctx)
      return listZApiConversations(params)
    }
  }),
  defineMethod({
    name: 'communicationIntegrations.zApi.listMessages',
    params: ZApiMessageParams,
    handler: (params, ctx) => {
      assertLocalWindow(ctx)
      return listZApiMessages(params)
    }
  }),
  defineMethod({
    name: 'communicationIntegrations.zApi.sendReply',
    params: ZApiSendReplyParams,
    handler: (params, ctx) => {
      assertLocalWindow(ctx)
      return sendZApiReply(params)
    }
  }),
  defineMethod({
    name: 'communicationIntegrations.zApi.remove',
    params: null,
    handler: (_params, ctx) => {
      assertLocalWindow(ctx)
      return removeZApiCommunicationIntegration()
    }
  })
]
