const MAX_PROXY_MESSAGE_BYTES = 16 * 1024 * 1024
const MAX_UPGRADE_BYTES = 64 * 1024
const WEBSOCKET_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

type ProxyInput = {
  write(value: string | Uint8Array): number | Promise<number>
  end(): void
}

type PendingMessage = {
  resolve(value: string): void
  reject(reason?: unknown): void
  signal: AbortSignal
  onAbort(): void
}

export type CodexProxyProcess = {
  stdin: ProxyInput
  stdout: ReadableStream<Uint8Array>
}

export type CodexProxyHandlers = {
  onMessage?(value: string): void
  onError?(error: Error): void
  onClose?(): void
}

export class CodexProxyDisconnectedError extends Error {
  constructor(message = "O proxy remoto do Codex desconectou.") {
    super(message)
    this.name = "CodexProxyDisconnectedError"
  }
}

type DecodedFrame = { opcode: number; payload: Uint8Array; final: boolean }

function appendBytes(left: Uint8Array, right: Uint8Array): Uint8Array<ArrayBufferLike> {
  if (left.byteLength === 0) return right.slice()
  const joined = new Uint8Array(left.byteLength + right.byteLength)
  joined.set(left)
  joined.set(right, left.byteLength)
  return joined
}

/** Encodes one RFC 6455 client frame. Client frames are always masked. */
export function codexProxyClientFrame(
  payload: string | Uint8Array,
  opcode = 1,
  mask = crypto.getRandomValues(new Uint8Array(4)),
) {
  const body = typeof payload === "string" ? new TextEncoder().encode(payload) : payload
  if (body.byteLength > MAX_PROXY_MESSAGE_BYTES)
    throw new Error("A mensagem enviada ao Codex remoto excedeu o limite permitido.")
  const lengthBytes = body.byteLength < 126 ? 0 : body.byteLength <= 0xffff ? 2 : 8
  const frame = new Uint8Array(2 + lengthBytes + 4 + body.byteLength)
  frame[0] = 0x80 | opcode
  if (lengthBytes === 0) frame[1] = 0x80 | body.byteLength
  else if (lengthBytes === 2) {
    frame[1] = 0x80 | 126
    frame[2] = body.byteLength >>> 8
    frame[3] = body.byteLength
  } else {
    frame[1] = 0x80 | 127
    new DataView(frame.buffer).setBigUint64(2, BigInt(body.byteLength))
  }
  const maskOffset = 2 + lengthBytes
  frame.set(mask, maskOffset)
  const bodyOffset = maskOffset + 4
  for (let index = 0; index < body.byteLength; index += 1)
    frame[bodyOffset + index] = (body[index] ?? 0) ^ (mask[index % 4] ?? 0)
  return frame
}

function frameHeader(bytes: Uint8Array, offset: number) {
  const available = bytes.byteLength - offset
  if (available < 2) return null
  const first = bytes[offset] ?? 0
  const second = bytes[offset + 1] ?? 0
  let length = second & 0x7f
  let headerLength = 2
  if (length === 126) {
    if (available < 4) return null
    length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)
    headerLength = 4
  } else if (length === 127) {
    if (available < 10) return null
    const value = new DataView(bytes.buffer, bytes.byteOffset + offset + 2, 8).getBigUint64(0)
    if (value > BigInt(MAX_PROXY_MESSAGE_BYTES))
      throw new Error("A resposta remota do Codex excedeu o limite permitido.")
    length = Number(value)
    headerLength = 10
  }
  return { first, length, headerLength, masked: (second & 0x80) !== 0 }
}

function unmask(payload: Uint8Array, bytes: Uint8Array, maskOffset: number) {
  for (let index = 0; index < payload.byteLength; index += 1)
    payload[index] = (payload[index] ?? 0) ^ (bytes[maskOffset + (index % 4)] ?? 0)
}

/** Incrementally decodes server WebSocket frames received through the raw proxy. */
export class CodexProxyFrameDecoder {
  private buffered: Uint8Array<ArrayBufferLike> = new Uint8Array()

  push(chunk: Uint8Array) {
    this.buffered = appendBytes(this.buffered, chunk)
    if (this.buffered.byteLength > MAX_PROXY_MESSAGE_BYTES + 14)
      throw new Error("A resposta remota do Codex excedeu o limite permitido.")
    const frames: DecodedFrame[] = []
    let offset = 0
    while (true) {
      const header = frameHeader(this.buffered, offset)
      if (!header) break
      const { first, length, headerLength, masked } = header
      const maskLength = masked ? 4 : 0
      if (length > MAX_PROXY_MESSAGE_BYTES)
        throw new Error("A resposta remota do Codex excedeu o limite permitido.")
      if (this.buffered.byteLength - offset < headerLength + maskLength + length) break
      const maskOffset = offset + headerLength
      const bodyOffset = maskOffset + maskLength
      const payload = this.buffered.slice(bodyOffset, bodyOffset + length)
      if (masked) unmask(payload, this.buffered, maskOffset)
      frames.push({ opcode: first & 0x0f, payload, final: (first & 0x80) !== 0 })
      offset = bodyOffset + length
    }
    if (offset > 0) this.buffered = this.buffered.slice(offset)
    return frames
  }
}

function serializedProxyWriter(input: ProxyInput, onError: (error: Error) => void) {
  let stopped = false
  let pending: Promise<unknown> = Promise.resolve()
  return {
    write(value: string | Uint8Array) {
      pending = pending
        .then(() => (stopped ? undefined : Promise.resolve(input.write(value))))
        .catch((error) => onError(error instanceof Error ? error : new Error(String(error))))
      return pending
    },
    stop() {
      if (stopped) return
      stopped = true
      try {
        input.end()
      } catch {
        // A disconnected SSH proxy may already have closed stdin.
      }
    },
  }
}

async function websocketAccept(key: string) {
  const digest = await crypto.subtle.digest(
    "SHA-1",
    new TextEncoder().encode(`${key}${WEBSOCKET_GUID}`),
  )
  return Buffer.from(digest).toString("base64")
}

function upgradeRequest(key: string) {
  return [
    "GET /rpc HTTP/1.1",
    "Host: localhost",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
    "",
    "",
  ].join("\r\n")
}

function validateUpgrade(header: string, expectedAccept: string) {
  const lines = header.split("\r\n")
  if (!/^HTTP\/1\.[01] 101(?: |$)/u.test(lines[0] ?? ""))
    throw new Error("O proxy remoto rejeitou o WebSocket do Codex.")
  const headers = new Map<string, string>()
  for (const line of lines.slice(1)) {
    const separator = line.indexOf(":")
    if (separator <= 0) continue
    headers.set(line.slice(0, separator).trim().toLowerCase(), line.slice(separator + 1).trim())
  }
  if (headers.get("sec-websocket-accept") !== expectedAccept)
    throw new Error("O proxy remoto respondeu com um WebSocket inválido.")
}

async function readUpgrade(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  expectedAccept: string,
  signal: AbortSignal,
) {
  let buffered: Uint8Array<ArrayBufferLike> = new Uint8Array()
  while (true) {
    signal.throwIfAborted()
    const end = Buffer.from(buffered).indexOf("\r\n\r\n")
    if (end >= 0) {
      validateUpgrade(new TextDecoder().decode(buffered.subarray(0, end)), expectedAccept)
      return buffered.slice(end + 4)
    }
    const cancel = () => void reader.cancel(signal.reason).catch(() => undefined)
    signal.addEventListener("abort", cancel, { once: true })
    const chunk = await reader.read().finally(() => signal.removeEventListener("abort", cancel))
    signal.throwIfAborted()
    if (chunk.done)
      throw new CodexProxyDisconnectedError("O proxy remoto encerrou durante o WebSocket do Codex.")
    buffered = appendBytes(buffered, chunk.value)
    if (buffered.byteLength > MAX_UPGRADE_BYTES)
      throw new Error("A resposta de conexão do proxy remoto é inválida.")
  }
}

export class CodexProxyWebSocket {
  private readonly decoder = new CodexProxyFrameDecoder()
  private readonly messages: string[] = []
  private readonly pendingMessages: PendingMessage[] = []
  private readonly writer
  private fragmentOpcode: number | null = null
  private fragmented: Uint8Array<ArrayBufferLike> = new Uint8Array()
  private stopped = false
  private terminalError: Error | null = null

  private constructor(
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
    private readonly handlers: CodexProxyHandlers,
    input: ProxyInput,
  ) {
    this.writer = serializedProxyWriter(input, (error) => this.fail(error))
  }

  static async connect(
    process: CodexProxyProcess,
    signal: AbortSignal,
    handlers: CodexProxyHandlers = {},
  ) {
    signal.throwIfAborted()
    const reader = process.stdout.getReader()
    const key = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64")
    const expectedAccept = await websocketAccept(key)
    try {
      await Promise.resolve(process.stdin.write(upgradeRequest(key)))
      const remaining = await readUpgrade(reader, expectedAccept, signal)
      const connection = new CodexProxyWebSocket(reader, handlers, process.stdin)
      connection.consume(remaining)
      void connection.read().catch((error) => connection.fail(error))
      return connection
    } catch (error) {
      reader.releaseLock()
      throw error
    }
  }

  send(value: string) {
    if (this.stopped) return Promise.resolve()
    return this.writer.write(codexProxyClientFrame(value))
  }

  nextMessage(signal: AbortSignal) {
    signal.throwIfAborted()
    const queued = this.messages.shift()
    if (queued !== undefined) return Promise.resolve(queued)
    if (this.terminalError) return Promise.reject(this.terminalError)
    return new Promise<string>((resolve, reject) => {
      const pending: PendingMessage = {
        resolve,
        reject,
        signal,
        onAbort: () => {
          const index = this.pendingMessages.indexOf(pending)
          if (index >= 0) this.pendingMessages.splice(index, 1)
          reject(signal.reason)
        },
      }
      signal.addEventListener("abort", pending.onAbort, { once: true })
      this.pendingMessages.push(pending)
    })
  }

  stop() {
    if (this.stopped) return
    this.stopped = true
    this.terminalError = new Error("O proxy remoto do Codex foi encerrado.")
    this.writer.stop()
    void this.reader.cancel().catch(() => undefined)
    this.rejectPending(this.terminalError)
  }

  private async read() {
    try {
      while (!this.stopped) {
        const chunk = await this.reader.read()
        if (chunk.done) break
        this.consume(chunk.value)
      }
      if (!this.stopped) this.close()
    } finally {
      this.reader.releaseLock()
    }
  }

  private consume(chunk: Uint8Array) {
    for (const frame of this.decoder.push(chunk)) this.consumeFrame(frame)
  }

  private consumeFrame(frame: DecodedFrame) {
    if (frame.opcode === 8) return this.close()
    if (frame.opcode === 9) {
      void this.writer.write(codexProxyClientFrame(frame.payload, 10))
      return
    }
    if (frame.opcode === 10) return
    if (frame.opcode === 1 || frame.opcode === 2) {
      if (this.fragmentOpcode !== null)
        throw new Error("O proxy remoto enviou uma sequência WebSocket incompatível.")
      this.fragmentOpcode = frame.final ? null : frame.opcode
      this.fragmented = frame.payload
    } else if (frame.opcode === 0 && this.fragmentOpcode !== null) {
      this.fragmented = appendBytes(this.fragmented, frame.payload)
    } else throw new Error("O proxy remoto enviou um frame WebSocket incompatível.")
    if (this.fragmented.byteLength > MAX_PROXY_MESSAGE_BYTES)
      throw new Error("A resposta remota do Codex excedeu o limite permitido.")
    if (!frame.final) return
    const opcode = frame.opcode === 0 ? this.fragmentOpcode : frame.opcode
    const payload = this.fragmented
    this.fragmentOpcode = null
    this.fragmented = new Uint8Array()
    if (opcode !== 1) return
    this.publish(new TextDecoder("utf-8", { fatal: true }).decode(payload))
  }

  private publish(value: string) {
    this.handlers.onMessage?.(value)
    const pending = this.pendingMessages.shift()
    if (!pending) {
      if (!this.handlers.onMessage) this.messages.push(value)
      return
    }
    pending.signal.removeEventListener("abort", pending.onAbort)
    pending.resolve(value)
  }

  private close() {
    if (this.stopped) return
    this.stopped = true
    this.terminalError = new CodexProxyDisconnectedError()
    this.writer.stop()
    this.rejectPending(this.terminalError)
    this.handlers.onClose?.()
  }

  private fail(value: unknown) {
    const error = value instanceof Error ? value : new Error(String(value))
    if (this.stopped) return
    this.stopped = true
    this.terminalError = error
    this.writer.stop()
    this.rejectPending(error)
    this.handlers.onError?.(error)
  }

  private rejectPending(error: Error) {
    for (const pending of this.pendingMessages.splice(0)) {
      pending.signal.removeEventListener("abort", pending.onAbort)
      pending.reject(error)
    }
  }
}
