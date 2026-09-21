import { OptimizedBuffer, resolveRenderLib, type EmbeddedTerminalHandle } from "@opentui/core"
import { AgentOutput } from "../model/agent-output"

/** A bounded live screen, independent of the visible pane and its scroll position. */
export class AgentMonitor extends AgentOutput {
  private lib = resolveRenderLib()
  private handle: EmbeddedTerminalHandle | null = null
  private buffer: OptimizedBuffer | null = null
  private dirty = true
  private cached = ""
  private screenDecoder = new TextDecoder()

  constructor(columns: number, rows: number) {
    super()
    try {
      this.handle = this.lib.createEmbeddedTerminal({
        cols: Math.max(20, columns),
        rows: Math.max(5, rows),
        maxScrollback: 0,
      })
      this.buffer = OptimizedBuffer.create(Math.max(20, columns), Math.max(5, rows), "wcwidth")
    } catch {
      this.dispose()
    }
  }

  override write(data: Uint8Array) {
    super.write(data)
    if (!this.handle) return
    try {
      this.lib.embeddedTerminalWrite(this.handle, data)
      // Only the real terminal may respond to the process. Drain this observer's replies.
      this.lib.embeddedTerminalDrainResponses(this.handle)
      this.dirty = true
    } catch {
      this.dispose()
    }
  }

  resize(columns: number, rows: number) {
    if (!this.handle || !this.buffer || columns <= 0 || rows <= 0) return
    try {
      this.lib.embeddedTerminalResize(this.handle, Math.max(20, columns), Math.max(5, rows))
      this.buffer.resize(Math.max(20, columns), Math.max(5, rows))
      this.lib.embeddedTerminalDrainResponses(this.handle)
      this.dirty = true
    } catch {
      this.dispose()
    }
  }

  screen() {
    if (!this.handle || !this.buffer) return ""
    try {
      if (this.dirty) {
        this.lib.embeddedTerminalInvalidate(this.handle)
        this.lib.embeddedTerminalCompose(this.handle, this.buffer.ptr, 0, 0)
        this.cached = this.screenDecoder.decode(this.buffer.getRealCharBytes(true))
        this.dirty = false
      }
      return this.cached
    } catch {
      this.dispose()
      return ""
    }
  }

  dispose() {
    if (this.handle) this.lib.destroyEmbeddedTerminal(this.handle)
    this.handle = null
    this.buffer?.destroy()
    this.buffer = null
    this.cached = ""
  }
}
