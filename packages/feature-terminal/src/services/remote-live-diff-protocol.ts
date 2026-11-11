import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"

const MAX_PROTOCOL_BUFFER = 16 * 1024 * 1024
// Includes the SSH handshake (ConnectTimeout=10) on the first request.
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000

export type RemoteLiveDiffProtocolResult = {
  status: number
  stdout: string
  stderr: string
}

type PendingRequest = {
  resolve: (result: RemoteLiveDiffProtocolResult) => void
  reject: (error: Error) => void
  line: string
  timer?: ReturnType<typeof setTimeout>
  signal: AbortSignal
  abort: () => void
}

function encodeField(value: string) {
  return [...Buffer.from(value, "utf8")]
    .map((byte) => `\\${byte.toString(8).padStart(3, "0")}`)
    .join("")
}

function decodeField(value: string) {
  if (value.length % 3 !== 0 || /[^0-7]/.test(value))
    throw new Error("Resposta inválida do Live Diff remoto.")
  const result = Buffer.alloc(value.length / 3)
  for (let index = 0; index < value.length; index += 3)
    result[index / 3] = Number.parseInt(value.slice(index, index + 3), 8)
  return result.toString("utf8")
}

export class RemoteLiveDiffProtocol {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<number, PendingRequest>()
  private readonly timeoutMs: number
  private nextId = 1
  private output = ""
  private errorOutput = ""
  closed = false

  constructor(command: readonly string[], timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS) {
    const [executable, ...args] = command
    if (!executable) throw new Error("Comando SSH do Live Diff remoto ausente.")
    this.timeoutMs = timeoutMs
    this.child = spawn(executable, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
    // Bun may emit a buffered write failure after cancellation destroys stdin.
    // Keep this listener through teardown; the request callback cannot consume it.
    this.child.stdin.on("error", (error) => this.stop(error))
    this.child.stdout.setEncoding("utf8")
    this.child.stderr.setEncoding("utf8")
    this.child.stdout.on("data", (chunk: string) => this.receive(chunk))
    this.child.stderr.on("data", (chunk: string) => {
      this.errorOutput = `${this.errorOutput}${chunk}`.slice(-8_192)
    })
    this.child.on("error", (error) => this.stop(error))
    this.child.on("exit", (code, signal) =>
      this.stop(
        new Error(
          this.errorOutput.trim() ||
            `Live Diff remoto encerrado (${signal ?? String(code ?? "desconhecido")}).`,
        ),
      ),
    )
  }

  request(
    operation: string,
    fields: readonly string[],
    signal: AbortSignal,
    cancellation: "close" | "discard" = "close",
  ) {
    signal.throwIfAborted()
    if (this.closed) return Promise.reject(new Error("Live Diff remoto desconectado."))
    const id = this.nextId++
    return new Promise<RemoteLiveDiffProtocolResult>((resolve, reject) => {
      const abort = () => {
        const request = this.pending.get(id)
        if (!request) return
        const error =
          signal.reason instanceof Error ? signal.reason : new Error("Operação cancelada.")
        reject(error)
        if (cancellation === "close") this.stop(error)
        else if (request.timer) {
          // A preview selection can change while a snapshot shares this helper.
          // Drain the active reply, retaining its deadline, without killing SSH.
          signal.removeEventListener("abort", abort)
        } else this.release(id, request)
      }
      const line = `${[id, operation, ...fields.map(encodeField)].join("|")}\n`
      const request = { resolve, reject, line, signal, abort }
      this.pending.set(id, request)
      signal.addEventListener("abort", abort, { once: true })
      this.sendNext()
    })
  }

  private sendNext() {
    if (this.closed) return
    const next = this.pending.entries().next().value
    if (!next) return
    const [id, request] = next
    if (request.timer) return
    // The shell handles one operation at a time. Queued reads must not spend
    // their timeout waiting for another root or a file preview to finish.
    request.timer = setTimeout(() => {
      const request = this.pending.get(id)
      if (!request) return
      const error = new Error("Tempo limite do Live Diff remoto excedido.")
      this.stop(error)
    }, this.timeoutMs)
    try {
      this.child.stdin.write(request.line, (error) => {
        if (error) this.stop(error)
      })
    } catch (error) {
      this.stop(error instanceof Error ? error : new Error(String(error)))
    }
  }

  close() {
    this.stop(new Error("Live Diff remoto fechado."))
  }

  private receive(chunk: string) {
    this.output += chunk
    if (this.output.length > MAX_PROTOCOL_BUFFER) {
      this.stop(new Error("Resposta do Live Diff remoto excedeu o limite."))
      return
    }
    let newline = this.output.indexOf("\n")
    while (newline >= 0) {
      const line = this.output.slice(0, newline)
      this.output = this.output.slice(newline + 1)
      this.receiveLine(line)
      newline = this.output.indexOf("\n")
    }
  }

  private receiveLine(line: string) {
    const [marker, rawId, rawStatus, stdout = "", stderr = ""] = line.split("|")
    if (marker !== "TUIMINAL_LIVE_DIFF") return
    const id = Number(rawId)
    const status = Number(rawStatus)
    const request = this.pending.get(id)
    if (!request || !Number.isSafeInteger(status)) return
    try {
      const result = { status, stdout: decodeField(stdout), stderr: decodeField(stderr) }
      this.release(id, request)
      request.resolve(result)
    } catch (error) {
      this.release(id, request)
      request.reject(error instanceof Error ? error : new Error(String(error)))
    }
    this.sendNext()
  }

  private release(id: number, request: PendingRequest) {
    this.pending.delete(id)
    clearTimeout(request.timer)
    request.signal.removeEventListener("abort", request.abort)
  }

  private stop(error: Error) {
    if (this.closed) return
    this.closed = true
    if (this.child.exitCode === null && this.child.signalCode === null) this.child.kill()
    this.child.stdin.destroy()
    for (const [id, request] of this.pending) {
      this.release(id, request)
      request.reject(error)
    }
  }
}
