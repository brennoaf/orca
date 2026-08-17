import { readFileSync } from 'node:fs'
import type { IpcRenderer } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { subscribeDiscordWebCompactModeChanged } from './discord-web-fast-response-subscriptions'

type CompactListener = (event: Electron.IpcRendererEvent, value: unknown) => void

describe('Discord Web compact preload subscriptions', () => {
  it('publishes only strict compact mode payloads', () => {
    const listeners = new Map<string, CompactListener>()
    const ipcRenderer = {
      on: vi.fn((channel: string, listener: CompactListener) => {
        listeners.set(channel, listener)
        return ipcRenderer
      }),
      removeListener: vi.fn((channel: string, listener: CompactListener) => {
        if (listeners.get(channel) === listener) {
          listeners.delete(channel)
        }
        return ipcRenderer
      })
    } as unknown as Pick<IpcRenderer, 'on' | 'removeListener'>
    const callback = vi.fn()
    const cleanup = subscribeDiscordWebCompactModeChanged(ipcRenderer, callback)
    const listener = listeners.get('discordWebFastResponse:compactModeChanged')
    if (!listener) {
      throw new Error('Discord compact listener was not registered')
    }

    listener({} as Electron.IpcRendererEvent, {
      canClose: true,
      mode: { kind: 'server-channels', serverId: '12345678901234567', serverName: ' EGB ' }
    })
    listener({} as Electron.IpcRendererEvent, {
      mode: { kind: 'manager', tab: 'servers', unexpected: true }
    })
    listener({} as Electron.IpcRendererEvent, {
      mode: { kind: 'dedicated', source: { kind: 'direct-message', href: '/channels/@me/nope' } }
    })

    expect(callback).toHaveBeenCalledOnce()
    expect(callback).toHaveBeenCalledWith({
      canClose: true,
      mode: { kind: 'server-channels', serverId: '12345678901234567', serverName: 'EGB' }
    })
    cleanup()
    expect(listeners.has('discordWebFastResponse:compactModeChanged')).toBe(false)
  })

  it('keeps preload sources free of runtime imports from the zod contract', () => {
    const sources = [
      './index.ts',
      './discord-web-fast-response.ts',
      './discord-web-fast-response-navigation.ts',
      './discord-web-fast-response-subscriptions.ts'
    ].map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))

    for (const source of sources) {
      expect(source).not.toMatch(/from\s+['"]zod['"]/)
      const contractImports = (source.match(/import[\s\S]*?from\s+['"][^'"]+['"]/g) ?? []).filter(
        (statement) => statement.includes("../shared/discord-web-fast-response'")
      )
      expect(contractImports.every((statement) => /^import\s+type\b/.test(statement))).toBe(true)
    }
  })
})
