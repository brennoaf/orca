import { randomUUID } from 'node:crypto'
import { connect, type Socket } from 'node:net'
import { join } from 'node:path'
import {
  DISCORD_IPC_OPCODE,
  DiscordIpcFrameDecoder,
  encodeDiscordIpcFrame
} from './discord-ipc-frame'

const SOCKET_CANDIDATE_COUNT = 10
const HANDSHAKE_TIMEOUT_MS = 10_000
const COMMAND_TIMEOUT_MS = 10_000

export type DiscordRpcEvent = {
  event: string
  data: Record<string, unknown>
}

export class DiscordRpcCommandError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiscordRpcCommandError'
  }
}

type PendingCommand = {
  resolve: (data: Record<string, unknown>) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function discordIpcSocketPath(index: number): string {
  if (process.platform === 'win32') {
    return `\\\\?\\pipe\\discord-ipc-${index}`
  }
  const base =
    process.env.XDG_RUNTIME_DIR ??
    process.env.TMPDIR ??
    process.env.TMP ??
    process.env.TEMP ??
    '/tmp'
  return join(base, `discord-ipc-${index}`)
}

function openSocket(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = connect(path)
    const onError = (error: Error): void => {
      socket.destroy()
      reject(error)
    }
    socket.once('error', onError)
    socket.once('connect', () => {
      socket.removeListener('error', onError)
      resolve(socket)
    })
  })
}

async function openFirstAvailableSocket(): Promise<Socket> {
  for (let index = 0; index < SOCKET_CANDIDATE_COUNT; index += 1) {
    try {
      return await openSocket(discordIpcSocketPath(index))
    } catch {
      continue
    }
  }
  throw new Error('Discord desktop is not running')
}

export class DiscordIpcConnection {
  private readonly socket: Socket
  private readonly decoder = new DiscordIpcFrameDecoder()
  private readonly pending = new Map<string, PendingCommand>()
  private readonly onEvent: (event: DiscordRpcEvent) => void
  private onUnexpectedClose: ((reason: string) => void) | null
  private closed = false

  private constructor(
    socket: Socket,
    onEvent: (event: DiscordRpcEvent) => void,
    onUnexpectedClose: (reason: string) => void
  ) {
    this.socket = socket
    this.onEvent = onEvent
    this.onUnexpectedClose = onUnexpectedClose
    socket.on('data', (chunk: Buffer) => this.consume(chunk))
    socket.on('error', (error: Error) => this.fail(error.message))
    socket.on('close', () => this.fail('Discord closed the RPC connection'))
  }

  static async open(args: {
    clientId: string
    onEvent: (event: DiscordRpcEvent) => void
    onUnexpectedClose: (reason: string) => void
  }): Promise<{ connection: DiscordIpcConnection; ready: Record<string, unknown> }> {
    const socket = await openFirstAvailableSocket()
    let readyResolve: ((data: Record<string, unknown>) => void) | null = null
    let readyReject: ((error: Error) => void) | null = null
    const readyPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
      readyResolve = resolve
      readyReject = reject
    })
    const connection = new DiscordIpcConnection(
      socket,
      (event) => {
        if (event.event === 'READY') {
          readyResolve?.(event.data)
          readyResolve = null
          readyReject = null
          return
        }
        args.onEvent(event)
      },
      (reason) => {
        if (readyReject) {
          readyReject(new Error(reason))
          readyReject = null
          return
        }
        args.onUnexpectedClose(reason)
      }
    )
    connection.send(DISCORD_IPC_OPCODE.handshake, { v: 1, client_id: args.clientId })
    const timer = setTimeout(
      () => connection.fail('Discord did not answer the RPC handshake'),
      HANDSHAKE_TIMEOUT_MS
    )
    try {
      const ready = await readyPromise
      return { connection, ready }
    } catch (error) {
      connection.close()
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  request(
    cmd: string,
    args?: Record<string, unknown>,
    evt?: string
  ): Promise<Record<string, unknown>> {
    if (this.closed) {
      return Promise.reject(new Error('Discord RPC connection is closed'))
    }
    const nonce = randomUUID()
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(nonce)
        reject(new Error(`Discord did not answer ${cmd}`))
      }, COMMAND_TIMEOUT_MS)
      this.pending.set(nonce, { resolve, reject, timer })
      this.send(DISCORD_IPC_OPCODE.frame, {
        cmd,
        nonce,
        ...(args ? { args } : {}),
        ...(evt ? { evt } : {})
      })
    })
  }

  async subscribe(event: string, args?: Record<string, unknown>): Promise<void> {
    await this.request('SUBSCRIBE', args, event)
  }

  async unsubscribe(event: string, args?: Record<string, unknown>): Promise<void> {
    await this.request('UNSUBSCRIBE', args, event)
  }

  close(): void {
    if (this.closed) {
      return
    }
    this.closed = true
    this.onUnexpectedClose = null
    this.rejectPending('Discord RPC connection is closed')
    this.socket.destroy()
  }

  private send(opcode: number, payload: unknown): void {
    this.socket.write(encodeDiscordIpcFrame(opcode, payload))
  }

  private consume(chunk: Buffer): void {
    let frames: ReturnType<DiscordIpcFrameDecoder['push']>
    try {
      frames = this.decoder.push(chunk)
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Malformed Discord RPC frame')
      return
    }
    for (const frame of frames) {
      this.handleFrame(frame.opcode, frame.payload)
    }
  }

  private handleFrame(opcode: number, payload: unknown): void {
    if (opcode === DISCORD_IPC_OPCODE.ping) {
      this.send(DISCORD_IPC_OPCODE.pong, payload)
      return
    }
    if (opcode === DISCORD_IPC_OPCODE.close) {
      const record = asRecord(payload)
      this.fail((record && readString(record, 'message')) ?? 'Discord closed the RPC connection')
      return
    }
    if (opcode !== DISCORD_IPC_OPCODE.frame) {
      return
    }
    const message = asRecord(payload)
    if (!message) {
      return
    }
    const nonce = readString(message, 'nonce')
    const data = asRecord(message.data) ?? {}
    const evt = readString(message, 'evt')
    if (!nonce) {
      if (evt) {
        this.onEvent({ event: evt, data })
      }
      return
    }
    const pending = this.pending.get(nonce)
    if (!pending) {
      return
    }
    this.pending.delete(nonce)
    clearTimeout(pending.timer)
    if (evt === 'ERROR') {
      pending.reject(
        new DiscordRpcCommandError(
          readString(data, 'message') ?? 'Discord rejected the RPC command'
        )
      )
      return
    }
    pending.resolve(data)
  }

  private fail(reason: string): void {
    if (this.closed) {
      return
    }
    this.closed = true
    const notify = this.onUnexpectedClose
    this.onUnexpectedClose = null
    this.rejectPending(reason)
    this.socket.destroy()
    notify?.(reason)
  }

  private rejectPending(reason: string): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error(reason))
    }
    this.pending.clear()
  }
}
