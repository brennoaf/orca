import { WebContentsView } from 'electron'
import { configureCommunicationWebNavigation } from '../communication-web-external-navigation'
import { isWhatsAppUrl } from './compact-host-identities'

export function createCompactWhatsAppView({
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
  configureCommunicationWebNavigation(view.webContents, isWhatsAppUrl)
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
