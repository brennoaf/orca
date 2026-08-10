import { zApiChatsSchema, type ZApiChatArchiveState } from './z-api-communication-client-contract'
import { CommunicationApiError } from './communication-api-endpoint'

function invalidResponse(): CommunicationApiError {
  return new CommunicationApiError('invalid_response', 'Z-API returned an invalid response.')
}

export async function listZApiChatArchiveStates(
  request: (path: string) => Promise<unknown>
): Promise<ZApiChatArchiveState[]> {
  const pageSize = 100
  const chats: ZApiChatArchiveState[] = []
  for (let page = 1; page <= 10_000; page += 1) {
    const parsed = zApiChatsSchema.safeParse(
      await request(`chats?page=${page}&pageSize=${pageSize}`)
    )
    if (!parsed.success) {
      throw invalidResponse()
    }
    chats.push(
      ...parsed.data.map((chat) => ({
        address: chat.phone,
        archived: chat.archived === true || chat.archived === 'true'
      }))
    )
    if (parsed.data.length < pageSize) {
      return chats
    }
  }
  throw invalidResponse()
}
