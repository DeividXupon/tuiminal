import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { OptimizedBuffer, resolveRenderLib } from "@opentui/core"
import {
  type TermAgentsProcessHandle,
  startTermAgentsProcess,
} from "../packages/feature-terminal/src/services/terminal"

const hostFixture = fileURLToPath(new URL("./fixtures/terminal-render-host.ts", import.meta.url))

function outputScreen() {
  const lib = resolveRenderLib()
  const terminal = lib.createEmbeddedTerminal({ cols: 96, rows: 16, maxScrollback: 0 })
  const buffer = OptimizedBuffer.create(96, 16, "wcwidth")
  const decoder = new TextDecoder()
  let text = ""
  let pending: { marker: string; resolve: () => void } | undefined
  return {
    read() {
      return text
    },
    write(data: Uint8Array) {
      lib.embeddedTerminalWrite(terminal, data)
      const replies = lib.embeddedTerminalDrainResponses(terminal)
      lib.embeddedTerminalCompose(terminal, buffer.ptr, 0, 0)
      text = decoder.decode(buffer.getRealCharBytes(true))
      if (pending && text.includes(pending.marker)) pending.resolve()
      return replies
    },
    resize(columns: number, rows: number) {
      lib.embeddedTerminalResize(terminal, columns, rows)
      buffer.resize(columns, rows)
    },
    async waitFor(marker: string) {
      if (text.includes(marker)) return
      const completion = Promise.withResolvers<void>()
      pending = { marker, resolve: () => completion.resolve() }
      const timer = setTimeout(() => {
        completion.reject(new Error(`Missing ${JSON.stringify(marker)} in PTY output:\n${text}`))
      }, 5_000)
      try {
        await completion.promise
      } finally {
        clearTimeout(timer)
        pending = undefined
      }
    },
    destroy() {
      lib.destroyEmbeddedTerminal(terminal)
      buffer.destroy()
    },
  }
}

for (const mode of ["default", "single-thread"] as const) {
  test.skipIf(process.platform === "win32")(
    `native renderer ${mode} publishes PTY updates without mouse input or forced frames`,
    async () => {
      const root = await mkdtemp(join(tmpdir(), "tuiminal-render-output-"))
      let host: TermAgentsProcessHandle | undefined
      let screen: ReturnType<typeof outputScreen> | undefined
      const exited = Promise.withResolvers<number | null>()
      const latencies: number[] = []
      try {
        screen = outputScreen()
        const view = screen
        host = startTermAgentsProcess([process.execPath, hostFixture, mode], {
          cwd: root,
          columns: 96,
          rows: 16,
          onData(data) {
            const replies = view.write(data)
            if (replies.byteLength) host?.write(replies)
          },
          onExit: (result) => exited.resolve(result.code),
        })
        await view.waitFor("STATUS=READY")
        await view.waitFor(";")
        const childPid = Number(/CHILD=(\d+);/u.exec(view.read())?.[1])
        expect(childPid).toBeGreaterThan(0)

        let input = ""
        for (const char of "paced_typing_1234") {
          input += char
          const start = performance.now()
          host.write(char)
          await view.waitFor(`INPUT=${input}`)
          latencies.push(performance.now() - start)
        }
        const burst = "_burst_ç界🧪"
        host.write(burst)
        input += burst
        await view.waitFor(`INPUT=${input}`)

        host.write("\x06")
        await view.waitFor("STATUS=FRAGMENTED")
        expect(view.read()).toContain(`INPUT=${input}`)

        host.write("\x01")
        await view.waitFor("STATUS=ALTERNATE")
        host.write("_alternate")
        input += "_alternate"
        await view.waitFor(`INPUT=${input}`)

        host.write("\x14")
        await view.waitFor("STATUS=WAITING")
        // Only the child emits output after this idle interval. The host must
        // wake up and publish it without another key, mouse event or frame pump.
        await view.waitFor("STATUS=RESUMED")
        expect(view.read()).toContain(`INPUT=${input}`)

        view.resize(80, 12)
        host.resize(80, 12)
        await view.waitFor("SIZE=80x12")
        expect(view.read()).toContain(`INPUT=${input}`)
        host.write("\x01")
        await view.waitFor("STATUS=PRIMARY")
        expect(view.read()).toContain(`INPUT=${input}`)

        host.write("\x03")
        const exitTimer = setTimeout(() => exited.reject(new Error("Renderer did not exit")), 5000)
        try {
          expect(await exited.promise).toBe(0)
        } finally {
          clearTimeout(exitTimer)
        }
        await host.stop()
        const hostPid = host.pid
        expect(() => process.kill(hostPid, 0)).toThrow()
        expect(() => process.kill(childPid, 0)).toThrow()
        if (process.env.TUIMINAL_TEST_TERMINAL_TIMINGS === "1") {
          latencies.sort((left, right) => left - right)
          console.log({
            platform: process.platform,
            mode,
            samples: latencies.length,
            p50Ms: latencies[Math.ceil(latencies.length * 0.5) - 1],
            p95Ms: latencies[Math.ceil(latencies.length * 0.95) - 1],
            maxMs: latencies.at(-1),
          })
        }
      } finally {
        try {
          await host?.stop()
        } finally {
          screen?.destroy()
          await rm(root, { recursive: true, force: true })
        }
      }
    },
    20_000,
  )
}
