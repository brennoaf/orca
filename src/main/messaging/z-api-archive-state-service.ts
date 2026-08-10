import type { ZApiTransactionConfiguration } from './z-api-transaction-journal'
import { ZApiCommunicationClient } from './z-api-communication-client'

const ARCHIVE_STATE_TTL_MS = 60_000

type ArchiveStateCache = {
  configurationId: string
  expiresAt: number
  states: ReadonlyMap<string, boolean>
}

let cache: ArchiveStateCache | null = null
let pending: { configurationId: string; promise: Promise<ReadonlyMap<string, boolean>> } | null =
  null
let epoch = 0

export async function getZApiArchiveStates(
  configuration: ZApiTransactionConfiguration
): Promise<ReadonlyMap<string, boolean>> {
  const now = Date.now()
  const requestEpoch = epoch
  if (cache?.configurationId === configuration.configurationId && cache.expiresAt > now) {
    return cache.states
  }
  if (pending?.configurationId === configuration.configurationId) {
    return pending.promise
  }
  const promise = new ZApiCommunicationClient({
    baseUrl: configuration.baseUrl,
    endpointTrust: configuration.endpointTrust,
    instanceId: configuration.instanceId,
    instanceToken: configuration.instanceToken,
    clientToken: configuration.clientToken
  })
    .listChatArchiveStates()
    .then((chats) => {
      const states = new Map(chats.map((chat) => [chat.address, chat.archived]))
      if (requestEpoch === epoch) {
        cache = {
          configurationId: configuration.configurationId,
          expiresAt: Date.now() + ARCHIVE_STATE_TTL_MS,
          states
        }
      }
      return states
    })
    .finally(() => {
      if (pending?.promise === promise) {
        pending = null
      }
    })
  pending = { configurationId: configuration.configurationId, promise }
  return promise
}

export function clearZApiArchiveStates(): void {
  epoch += 1
  cache = null
  pending = null
}
