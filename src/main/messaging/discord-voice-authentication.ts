import type { DiscordIpcConnection } from './discord-ipc-connection'
import { DiscordRpcCommandError, readString } from './discord-ipc-connection'
import {
  DISCORD_OAUTH_SCOPES,
  DiscordOAuthRejectionError,
  exchangeDiscordAuthorizationCode,
  isSpentDiscordGrant,
  refreshDiscordAccessToken,
  type DiscordOAuthTokens
} from './discord-oauth'
import {
  clearDiscordVoiceRefreshTokenIfCurrent,
  saveDiscordVoiceRefreshTokenIfCurrent
} from './discord-voice-credential-store'

export class DiscordVoiceAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscordVoiceAuthError'
  }
}

type Credentials = {
  clientId: string
  clientSecret: string
  refreshToken: string | null
}

function asAuthorizationFailure(error: unknown): Error {
  if (error instanceof DiscordVoiceAuthError) {
    return error
  }
  if (error instanceof DiscordRpcCommandError || error instanceof DiscordOAuthRejectionError) {
    return new DiscordVoiceAuthError(error.message)
  }
  return error instanceof Error ? error : new Error('Discord authorization failed')
}

async function requestAuthorizationCode(
  connection: DiscordIpcConnection,
  clientId: string
): Promise<string> {
  const data = await connection.request('AUTHORIZE', {
    client_id: clientId,
    scopes: DISCORD_OAUTH_SCOPES
  })
  const code = readString(data, 'code')
  if (!code) {
    throw new DiscordVoiceAuthError('Discord did not return an authorization code')
  }
  return code
}

async function obtainTokens(
  connection: DiscordIpcConnection,
  credentials: Credentials
): Promise<DiscordOAuthTokens> {
  if (credentials.refreshToken) {
    try {
      return await refreshDiscordAccessToken({
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        refreshToken: credentials.refreshToken
      })
    } catch (error) {
      if (!isSpentDiscordGrant(error)) {
        throw error
      }
      console.warn('[discord-voice] Stored refresh token was rejected; re-authorizing', error)
      clearDiscordVoiceRefreshTokenIfCurrent(credentials)
    }
  }
  const code = await requestAuthorizationCode(connection, credentials.clientId)
  return exchangeDiscordAuthorizationCode({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    code
  })
}

export async function authenticateDiscordRpc(
  connection: DiscordIpcConnection,
  credentials: Credentials
): Promise<string | null> {
  let tokens: DiscordOAuthTokens
  try {
    tokens = await obtainTokens(connection, credentials)
  } catch (error) {
    throw asAuthorizationFailure(error)
  }
  saveDiscordVoiceRefreshTokenIfCurrent(credentials, tokens.refreshToken)
  let authenticated: Record<string, unknown>
  try {
    authenticated = await connection.request('AUTHENTICATE', { access_token: tokens.accessToken })
  } catch (error) {
    throw asAuthorizationFailure(error)
  }
  const user = authenticated.user
  return typeof user === 'object' && user !== null
    ? readString(user as Record<string, unknown>, 'id')
    : null
}
