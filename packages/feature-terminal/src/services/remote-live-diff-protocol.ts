import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"

const MAX_PROTOCOL_BUFFER = 16 * 1024 * 1024
const DEFAULT_REQUEST_TIMEOUT_MS = 6_500

export type RemoteLiveDiffProtocolResult = {
  status: number
  stdout: string
  stderr: string
}

type PendingRequest = {
  resolve: (result: RemoteLiveDiffProtocolResult) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
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

  request(operation: string, fields: readonly string[], signal: AbortSignal) {
    signal.throwIfAborted()
    if (this.closed) return Promise.reject(new Error("Live Diff remoto desconectado."))
    const id = this.nextId++
    return new Promise<RemoteLiveDiffProtocolResult>((resolve, reject) => {
      const abort = () => {
        const request = this.pending.get(id)
        if (!request) return
        const error =
          signal.reason instanceof Error ? signal.reason : new Error("Operação cancelada.")
        this.release(id, request)
        reject(error)
        this.stop(error)
      }
      const timer = setTimeout(() => {
        const request = this.pending.get(id)
        if (!request) return
        const error = new Error("Tempo limite do Live Diff remoto excedido.")
        this.release(id, request)
        reject(error)
        this.stop(error)
      }, this.timeoutMs)
      const request = { resolve, reject, timer, signal, abort }
      this.pending.set(id, request)
      signal.addEventListener("abort", abort, { once: true })
      const line = `${[id, operation, ...fields.map(encodeField)].join("|")}\n`
      this.child.stdin.write(line, (error) => {
        if (!error) return
        const active = this.pending.get(id)
        if (!active) return
        this.release(id, active)
        reject(error)
        this.stop(error)
      })
    })
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
