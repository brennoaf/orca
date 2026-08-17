import type { Rectangle } from 'electron'
import type {
  DiscordWebFastResponseAttach,
  DiscordWebFastResponseVisibility
} from '../../shared/discord-web-fast-response'

export function discordWebFastResponseOwnerIdentity(
  request: DiscordWebFastResponseAttach | DiscordWebFastResponseVisibility
): string {
  return request.target === 'attached'
    ? `attached:${request.requestId}:${request.surfaceId}:${request.mode}`
    : `dock:${request.generation}:${request.revision}:${request.tabId}`
}

export function discordWebFastResponseVisibilityIdentity(
  request: DiscordWebFastResponseAttach
): DiscordWebFastResponseVisibility {
  const { rectCss: _rectCss, rendererZoomFactor: _zoom, ...identity } = request
  return identity
}

export function discordWebFastResponseContentBounds(
  content: Rectangle,
  request: DiscordWebFastResponseAttach
): Rectangle {
  const { rectCss: rect, rendererZoomFactor: zoom } = request
  const left = Math.max(0, Math.floor(rect.x * zoom))
  const top = Math.max(0, Math.floor(rect.y * zoom))
  const right = Math.min(content.width, Math.ceil((rect.x + rect.width) * zoom))
  const bottom = Math.min(content.height, Math.ceil((rect.y + rect.height) * zoom))
  if (left >= right || top >= bottom) {
    throw new Error('discord_web_fast_response_rect_denied')
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}
