import type { ZApiConversationAvatarSnapshot } from '../../shared/communication-integrations'
import type { MessageStore } from './message-store'
import { downloadCommunicationRemoteImage } from './communication-remote-image'
import { ZApiCommunicationClient } from './z-api-communication-client'
import {
  ZApiConversationAvatarCache,
  type ZApiConversationAvatarCacheValue
} from './z-api-conversation-avatar-cache'
import type { ZApiTransactionConfiguration } from './z-api-transaction-journal'
import { ZApiTransactionError } from './z-api-transaction-service'

type ZApiConversationAvatarClient = Pick<ZApiCommunicationClient, 'getChatMetadata'>

function avatarSnapshot(value: ZApiConversationAvatarCacheValue): ZApiConversationAvatarSnapshot {
  return value.state === 'unavailable'
    ? value
    : {
        state: 'available',
        mimeType: value.mimeType,
        contentBase64: value.content.toString('base64')
      }
}

export type ZApiConversationAvatarServiceDependencies = {
  messageStore: Pick<MessageStore, 'getReplyDestination'>
  getConfiguration: () => ZApiTransactionConfiguration | null
  createClient?: (configuration: ZApiTransactionConfiguration) => ZApiConversationAvatarClient
  downloadImage?: typeof downloadCommunicationRemoteImage
  cache?: ZApiConversationAvatarCache
}

export class ZApiConversationAvatarService {
  private readonly cache: ZApiConversationAvatarCache
  private readonly createClient: (
    configuration: ZApiTransactionConfiguration
  ) => ZApiConversationAvatarClient
  private readonly downloadImage: typeof downloadCommunicationRemoteImage

  constructor(private readonly dependencies: ZApiConversationAvatarServiceDependencies) {
    this.cache = dependencies.cache ?? new ZApiConversationAvatarCache()
    this.createClient =
      dependencies.createClient ??
      ((configuration) =>
        new ZApiCommunicationClient({
          baseUrl: configuration.baseUrl,
          endpointTrust: configuration.endpointTrust,
          instanceId: configuration.instanceId,
          instanceToken: configuration.instanceToken,
          clientToken: configuration.clientToken
        }))
    this.downloadImage = dependencies.downloadImage ?? downloadCommunicationRemoteImage
  }

  async getConversationAvatar(conversationId: number): Promise<ZApiConversationAvatarSnapshot> {
    const configuration = this.dependencies.getConfiguration()
    const destination = this.dependencies.messageStore.getReplyDestination(conversationId)
    if (!configuration || !destination || destination.instanceId !== configuration.instanceId) {
      throw new ZApiTransactionError(
        'invalid_configuration',
        'The conversation does not belong to the active Z-API instance.'
      )
    }
    if (destination.conversationKind !== 'private' && destination.conversationKind !== 'group') {
      return { state: 'unavailable' }
    }
    try {
      const value = await this.cache.load({
        configurationId: configuration.configurationId,
        conversationId,
        load: async () => {
          const currentConfiguration = this.dependencies.getConfiguration()
          const currentDestination =
            this.dependencies.messageStore.getReplyDestination(conversationId)
          if (
            !currentConfiguration ||
            currentConfiguration.configurationId !== configuration.configurationId ||
            !currentDestination ||
            currentDestination.instanceId !== currentConfiguration.instanceId
          ) {
            throw new Error('Z-API conversation avatar load was cancelled.')
          }
          if (
            currentDestination.conversationKind !== 'private' &&
            currentDestination.conversationKind !== 'group'
          ) {
            return { state: 'unavailable' as const }
          }
          const metadata = await this.createClient(currentConfiguration).getChatMetadata(
            currentDestination.conversationAddress
          )
          if (metadata.profileThumbnail === null) {
            return { state: 'unavailable' as const }
          }
          const image = await this.downloadImage(metadata.profileThumbnail)
          return {
            state: 'available' as const,
            mimeType: image.mimeType,
            content: image.content
          }
        }
      })
      return avatarSnapshot(value)
    } catch {
      throw new Error('The WhatsApp conversation avatar could not be loaded.')
    }
  }

  clearConfiguration(configurationId: string): void {
    this.cache.clearConfiguration(configurationId)
  }

  clear(): void {
    this.cache.clear()
  }

  dispose(): Promise<void> {
    return this.cache.dispose()
  }
}
