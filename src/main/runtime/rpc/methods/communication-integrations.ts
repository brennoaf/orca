import { z } from 'zod'
import {
  clearCommunicationIntegration,
  getCommunicationIntegrationStatuses,
  saveCommunicationIntegration,
  testCommunicationIntegration
} from '../../../messaging/communication-integration-registry'
import { defineMethod, type RpcContext, type RpcMethod } from '../core'

const Provider = z.enum(['discord', 'slack'])
const ProviderParams = z.object({ provider: Provider }).strict()
const SecretMutation = z.discriminatedUnion('action', [
  z.object({ action: z.literal('keep') }).strict(),
  z.object({ action: z.literal('clear') }).strict(),
  z.object({ action: z.literal('replace'), value: z.string().trim().min(1).max(4_096) }).strict()
])
const EndpointTrust = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('default') }).strict(),
  z.object({ kind: z.literal('custom'), authority: z.string().trim().min(1).max(2_048) }).strict()
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
  })
]
