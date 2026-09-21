import { type EmbeddedTerminalHandle, OptimizedBuffer, resolveRenderLib } from "@opentui/core"
import { AgentOutput } from "../model/agent-output"

const MAX_QUEUED_BYTES = 1024 * 1024

/** A bounded live screen, independent of the visible pane and its scroll position. */
export class AgentMonitor extends AgentOutput {
  private lib: ReturnType<typeof resolveRenderLib> | null = null
  private handle: EmbeddedTerminalHandle | null = null
  private buffer: OptimizedBuffer | null = null
  private columns: number
  private rows: number
  private queued: Uint8Array | null = null
  private queuedStart = 0
  private queuedLength = 0
  private dirty = true
  private cached = ""
  private screenDecoder = new TextDecoder()
  private screenUnavailable = false
  private disposed = false
  private outputRevision = 0

  constructor(columns: number, rows: number) {
    super()
    this.columns = Math.max(20, columns)
    this.rows = Math.max(5, rows)
  }

  get revision() {
    return this.outputRevision
  }

  private queue(data: Uint8Array) {
    this.queued ??= new Uint8Array(MAX_QUEUED_BYTES)
    const source =
      data.byteLength > MAX_QUEUED_BYTES ? data.subarray(data.byteLength - MAX_QUEUED_BYTES) : data
    const overflow = Math.max(0, this.queuedLength + source.byteLength - MAX_QUEUED_BYTES)
    this.queuedStart = (this.queuedStart + overflow) % MAX_QUEUED_BYTES
    this.queuedLength -= overflow
    const end = (this.queuedStart + this.queuedLength) % MAX_QUEUED_BYTES
    const firstLength = Math.min(source.byteLength, MAX_QUEUED_BYTES - end)
    this.queued.set(source.subarray(0, firstLength), end)
    if (firstLength < source.byteLength) {
      this.queued.set(source.subarray(firstLength), 0)
    }
    this.queuedLength += source.byteLength
  }

  private ensureScreen() {
    if (this.handle && this.buffer && this.lib) return true
    if (this.disposed || this.screenUnavailable) return false
    try {
      this.lib = resolveRenderLib()
      this.handle = this.lib.createEmbeddedTerminal({
        cols: this.columns,
        rows: this.rows,
        maxScrollback: 0,
      })
      this.buffer = OptimizedBuffer.create(this.columns, this.rows, "wcwidth")
      return true
    } catch {
      this.destroyScreen()
      this.screenUnavailable = true
      return false
    }
  }

  private flush() {
    if (!this.queuedLength || !this.queued || !this.handle || !this.lib) return
    const data = new Uint8Array(this.queuedLength)
    const firstLength = Math.min(this.queuedLength, MAX_QUEUED_BYTES - this.queuedStart)
    data.set(this.queued.subarray(this.queuedStart, this.queuedStart + firstLength))
    if (firstLength < this.queuedLength) {
      data.set(this.queued.subarray(0, this.queuedLength - firstLength), firstLength)
    }
    this.queuedStart = 0
    this.queuedLength = 0
    try {
      this.lib.embeddedTerminalWrite(this.handle, data)
      // Only the real terminal may respond to the process. Drain this observer's replies.
      this.lib.embeddedTerminalDrainResponses(this.handle)
      this.dirty = true
    } catch {
      this.destroyScreen()
      this.screenUnavailable = true
    }
  }

  override write(data: Uint8Array) {
    super.write(data)
    if (this.disposed) return
    this.outputRevision += 1
    this.queue(data)
  }

  resize(columns: number, rows: number) {
    if (this.disposed || columns <= 0 || rows <= 0) return
    const nextColumns = Math.max(20, columns)
    const nextRows = Math.max(5, rows)
    if (nextColumns === this.columns && nextRows === this.rows) return
    this.columns = nextColumns
    this.rows = nextRows
    this.outputRevision += 1
    if (!this.handle || !this.buffer || !this.lib) return
    try {
      this.flush()
      this.lib.embeddedTerminalResize(this.handle, nextColumns, nextRows)
      this.buffer.resize(nextColumns, nextRows)
      this.lib.embeddedTerminalDrainResponses(this.handle)
      this.dirty = true
    } catch {
      this.destroyScreen()
      this.screenUnavailable = true
    }
  }

  screen() {
    if (!this.ensureScreen() || !this.handle || !this.buffer || !this.lib) return ""
    this.flush()
    try {
      if (this.dirty) {
        this.lib.embeddedTerminalInvalidate(this.handle)
        this.lib.embeddedTerminalCompose(this.handle, this.buffer.ptr, 0, 0)
        this.cached = this.screenDecoder.decode(this.buffer.getRealCharBytes(true))
        this.dirty = false
      }
      return this.cached
    } catch {
      this.destroyScreen()
      this.screenUnavailable = true
      return ""
    }
  }

  /** Release the expensive shadow terminal while retaining future output for later detection. */
  suspendScreen() {
    if (this.disposed) return
    this.destroyScreen()
    this.queued = null
    this.queuedStart = 0
    this.queuedLength = 0
  }

  private destroyScreen() {
    if (this.handle && this.lib) this.lib.destroyEmbeddedTerminal(this.handle)
    this.handle = null
    this.buffer?.destroy()
    this.buffer = null
    this.cached = ""
    this.dirty = true
    this.lib = null
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.destroyScreen()
    this.queued = null
    this.queuedStart = 0
    this.queuedLength = 0
  }
}
