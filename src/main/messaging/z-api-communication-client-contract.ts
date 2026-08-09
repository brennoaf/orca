import { z } from 'zod'
import type { CommunicationEndpointTrust } from '../../shared/communication-integrations'

export const zApiStatusPayloadSchema = z
  .object({
    connected: z.boolean(),
    smartphoneConnected: z.boolean(),
    error: z.string().nullable().optional(),
    paymentStatus: z.string().nullable().optional(),
    status: z.string().nullable().optional()
  })
  .loose()
export const zApiProviderRecordSchema = z.record(z.string(), z.unknown())
export const zApiTrueResponseSchema = z.object({ value: z.literal(true) }).loose()
export const zApiSendTextResponseSchema = z
  .object({
    zaapId: z.string().min(1),
    messageId: z.string().min(1),
    id: z.string().min(1)
  })
  .loose()

export type ZApiCommunicationClientParams = {
  baseUrl: string
  endpointTrust: CommunicationEndpointTrust
  instanceId: string
  instanceToken: string
  clientToken: string
}

export type ZApiInstanceStatus = {
  connected: boolean
  smartphoneConnected: boolean
  configurationReady: boolean
  paymentStatus: string | null
  statusDetail: string | null
}

export type ZApiInstanceWebhookState = {
  connectedCallbackUrl: string | null
  deliveryCallbackUrl: string | null
  disconnectedCallbackUrl: string | null
  messageStatusCallbackUrl: string | null
  presenceChatCallbackUrl: string | null
  receivedAndDeliveryCallbackUrl: string | null
  receivedCallbackUrl: string | null
  receivedStatusCallbackUrl: string | null
  initialDataCallbackUrl: string | null
  receiveCallbackSentByMe: boolean | null
}

export type ZApiRestorableWebhookState = {
  webhookUrl: string
  receiveCallbackSentByMe: boolean
}

export type ZApiSendTextParams = {
  destination: string
  message: string
  replyMessageId?: string
}

export type ZApiSendTextResult = {
  zaapId: string
  messageId: string
  id: string
}
