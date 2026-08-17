import { WebContentsView } from 'electron'
import { is } from '@electron-toolkit/utils'
import { configureCommunicationWebNavigation } from '../communication-web-external-navigation'
import { acquireSandboxPreloadPath } from '../sandbox-preload-path'

export function isDiscordWebNavigationUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'discord.com' || url.hostname.endsWith('.discord.com'))
    )
  } catch {
    return false
  }
}

export function createDiscordWebFastResponseView({
  partition,
  didFinishLoad,
  didStartNavigation,
  didNavigateInPage,
  didFailLoad,
  renderProcessGone,
  destroyed
}: {
  partition: string
  didFinishLoad: (view: WebContentsView) => void
  didStartNavigation: (
    view: WebContentsView,
    url: string,
    isInPlace: boolean,
    isMainFrame: boolean
  ) => void
  didNavigateInPage: (view: WebContentsView, url: string, isMainFrame: boolean) => void
  didFailLoad: (view: WebContentsView, errorCode: number, isMainFrame: boolean) => void
  renderProcessGone: (view: WebContentsView) => void
  destroyed: (view: WebContentsView) => void
}): WebContentsView {
  const preloadLease = acquireSandboxPreloadPath(__dirname, 'discord-web-fast-response-preload', {
    retainGeneration: is.dev
  })
  let view: WebContentsView
  try {
    view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        partition,
        preload: preloadLease.path,
        sandbox: true
      }
    })
  } catch (error) {
    preloadLease.release()
    throw error
  }
  configureCommunicationWebNavigation(view.webContents, isDiscordWebNavigationUrl)
  view.webContents.on('did-finish-load', () => {
    preloadLease.release()
    didFinishLoad(view)
  })
  view.webContents.on('did-start-navigation', (_event, url, isInPlace, isMainFrame) =>
    didStartNavigation(view, url, isInPlace, isMainFrame)
  )
  view.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) =>
    didNavigateInPage(view, url, isMainFrame)
  )
  view.webContents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
    preloadLease.release()
    didFailLoad(view, errorCode, isMainFrame)
  })
  view.webContents.on('render-process-gone', () => {
    preloadLease.release()
    renderProcessGone(view)
  })
  view.webContents.on('destroyed', () => {
    preloadLease.release()
    destroyed(view)
  })
  return view
}
