import { z } from 'zod'
import {
  clearCommunicationIntegration,
  getCommunicationIntegrationStatuses,
  saveCommunicationIntegration,
  testCommunicationIntegration
} from '../../../messaging/communication-integration-registry'
import { defineMethod, type RpcContext, type RpcMethod } from '../core'

const Provider = z.literal('discord')
const ProviderParams = z.object({ provider: Provider }).strict()
const SecretMutation = z.discriminatedUnion('action', [
  z.object({ action: z.literal('keep') }).strict(),
  z.object({ action: z.literal('clear') }).strict(),
  z.object({ action: z.literal('replace'), value: z.string().trim().min(1).max(4_096) }).strict()
])
const SaveParams = z
  .object({
    provider: Provider,
    clientId: z
      .string()
      .trim()
      .regex(/^\d{17,20}$/),
    clientSecret: SecretMutation
  })
  .strict()
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
