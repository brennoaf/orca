import type { BrowserWindow } from 'electron'

export abstract class CommunicationsDockWindowState {
  protected window: BrowserWindow | null = null
  protected generation = 0
  protected revision = 0
  protected loaded = false
  protected ready = false
  protected desiredVisible = false
}
