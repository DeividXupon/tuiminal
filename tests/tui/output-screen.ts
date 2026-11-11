import { Writable } from "node:stream"
import { OptimizedBuffer, resolveRenderLib } from "@opentui/core"

/** Decode the actual ANSI stream, independently of the renderer's comparison cache. */
export function outputScreen(columns: number, rows: number) {
  const lib = resolveRenderLib()
  const terminal = lib.createEmbeddedTerminal({ cols: columns, rows, maxScrollback: 0 })
  const buffer = OptimizedBuffer.create(columns, rows, "wcwidth")
  const decoder = new TextDecoder()
  const write = (data: Uint8Array) => lib.embeddedTerminalWrite(terminal, data)
  const stdout = Object.assign(
    new Writable({
      write(chunk, _encoding, callback) {
        write(chunk)
        callback()
      },
    }),
    { isTTY: true, columns, rows, getColorDepth: () => 24 },
  )
  function compose() {
    lib.embeddedTerminalCompose(terminal, buffer.ptr, 0, 0)
    return buffer
  }
  return {
    stdout: stdout as unknown as NodeJS.WriteStream,
    write,
    replies: () => lib.embeddedTerminalDrainResponses(terminal),
    read: () => decoder.decode(compose().getRealCharBytes(true)),
    spans: () => compose().getSpanLines(),
    leaveStaleCells() {
      // Corrupt both an unchanged header and cells the renderer believes are blank.
      write(
        new TextEncoder().encode("\x1b7\x1b[1;1HOLD-SCREEN\x1b[1;105HOLD\x1b[25;108HSTALE\x1b8"),
      )
    },
    resize(width: number, height: number) {
      lib.embeddedTerminalResize(terminal, width, height)
      buffer.resize(width, height)
    },
    destroy() {
      lib.destroyEmbeddedTerminal(terminal)
      buffer.destroy()
      stdout.destroy()
    },
  }
}
