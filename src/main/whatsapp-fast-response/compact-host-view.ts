import { WebContentsView } from 'electron'
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
  view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  view.webContents.on('will-navigate', (event, url) => {
    if (!isWhatsAppUrl(url)) {
      event.preventDefault()
    }
  })
  view.webContents.on('will-redirect', (event, url) => {
    if (!isWhatsAppUrl(url)) {
      event.preventDefault()
    }
  })
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
