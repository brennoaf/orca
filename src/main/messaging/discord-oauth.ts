import { asRecord } from './discord-ipc-connection'

const DISCORD_TOKEN_ENDPOINT = 'https://discord.com/api/oauth2/token'
const SPENT_GRANT_ERROR_CODE = 'invalid_grant'
const RATE_LIMITED_STATUS = 429

export const DISCORD_OAUTH_SCOPES = ['rpc']

export type DiscordOAuthTokens = {
  accessToken: string
  refreshToken: string
}

export class DiscordOAuthRejectionError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'DiscordOAuthRejectionError'
    this.code = code
  }
}

export function isSpentDiscordGrant(error: unknown): boolean {
  return error instanceof DiscordOAuthRejectionError && error.code === SPENT_GRANT_ERROR_CODE
}

async function requestDiscordTokens(body: URLSearchParams): Promise<DiscordOAuthTokens> {
  const response = await fetch(DISCORD_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body
  })
  const payload = asRecord(await response.json().catch(() => null))
  if (!response.ok) {
    const code = typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`
    const description =
      typeof payload?.error_description === 'string' ? `: ${payload.error_description}` : ''
    const message = `Discord rejected the token request (${code}${description})`
    throw response.status >= 500 || response.status === RATE_LIMITED_STATUS
      ? new Error(message)
      : new DiscordOAuthRejectionError(message, code)
  }
  const accessToken = typeof payload?.access_token === 'string' ? payload.access_token : null
  const refreshToken = typeof payload?.refresh_token === 'string' ? payload.refresh_token : null
  if (!accessToken || !refreshToken) {
    throw new Error('Discord returned an incomplete token response')
  }
  return { accessToken, refreshToken }
}

export function exchangeDiscordAuthorizationCode(args: {
  clientId: string
  clientSecret: string
  code: string
}): Promise<DiscordOAuthTokens> {
  return requestDiscordTokens(
    new URLSearchParams({
      client_id: args.clientId,
      client_secret: args.clientSecret,
      grant_type: 'authorization_code',
      code: args.code
    })
  )
}

export function refreshDiscordAccessToken(args: {
  clientId: string
  clientSecret: string
  refreshToken: string
}): Promise<DiscordOAuthTokens> {
  return requestDiscordTokens(
    new URLSearchParams({
      client_id: args.clientId,
      client_secret: args.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: args.refreshToken
    })
  )
}
