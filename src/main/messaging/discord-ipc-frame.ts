export const DISCORD_IPC_OPCODE = {
  handshake: 0,
  frame: 1,
  close: 2,
  ping: 3,
  pong: 4
} as const

export type DiscordIpcFrame = {
  opcode: number
  payload: unknown
}

const HEADER_BYTES = 8
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024

export function encodeDiscordIpcFrame(opcode: number, payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  const header = Buffer.allocUnsafe(HEADER_BYTES)
  header.writeUInt32LE(opcode, 0)
  header.writeUInt32LE(body.length, 4)
  return Buffer.concat([header, body])
}

export class DiscordIpcFrameDecoder {
  private buffered: Buffer = Buffer.alloc(0)

  push(chunk: Buffer): DiscordIpcFrame[] {
    this.buffered = this.buffered.length === 0 ? chunk : Buffer.concat([this.buffered, chunk])
    const frames: DiscordIpcFrame[] = []
    while (this.buffered.length >= HEADER_BYTES) {
      const length = this.buffered.readUInt32LE(4)
      if (length > MAX_PAYLOAD_BYTES) {
        throw new Error('Discord IPC frame exceeds the maximum payload size')
      }
      if (this.buffered.length < HEADER_BYTES + length) {
        break
      }
      const opcode = this.buffered.readUInt32LE(0)
      const body = this.buffered.subarray(HEADER_BYTES, HEADER_BYTES + length).toString('utf8')
      this.buffered = this.buffered.subarray(HEADER_BYTES + length)
      frames.push({ opcode, payload: body.length > 0 ? JSON.parse(body) : null })
    }
    return frames
  }
}
