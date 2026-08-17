import { WebContentsView } from 'electron'
import { configureCommunicationWebNavigation } from '../communication-web-external-navigation'

const ALLOWED_SLACK_IDENTITY_PROVIDER_HOSTS = new Set([
  'accounts.google.com',
  'login.microsoftonline.com',
  'appleid.apple.com'
])

export function isSlackNavigationUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && isSlackHostname(url.hostname)
  } catch {
    return false
  }
}

function isSlackHostname(hostname: string): boolean {
  return (
    hostname === 'slack.com' ||
    hostname.endsWith('.slack.com') ||
    ALLOWED_SLACK_IDENTITY_PROVIDER_HOSTS.has(hostname)
  )
}

export function createCompactSlackView({
  partition,
  didFinishLoad,
  didStartNavigation,
  didFailLoad,
  renderProcessGone
}: {
  partition: string
  didFinishLoad: (view: WebContentsView) => void
  didStartNavigation: (view: WebContentsView, isInPlace: boolean, isMainFrame: boolean) => void
  didFailLoad: (view: WebContentsView, errorCode: number, isMainFrame: boolean) => void
  renderProcessGone: (view: WebContentsView) => void
}): WebContentsView {
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, partition, sandbox: true }
  })
  configureCommunicationWebNavigation(view.webContents, isSlackNavigationUrl)
  view.webContents.on('did-finish-load', () => didFinishLoad(view))
  view.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) =>
    didStartNavigation(view, isInPlace, isMainFrame)
  )
  view.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) =>
    didFailLoad(view, errorCode, isMainFrame)
  )
  view.webContents.on('render-process-gone', () => renderProcessGone(view))
  return view
}
