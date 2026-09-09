import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

// Opt-in native terminal check, separate from the in-memory renderer matrix.
// TUIMINAL_HTTP_PTY=1 bun test tests/http-redirect-pty.test.ts
for (const layout of ["compact", "framed"]) {
  test.skipIf(process.env.TUIMINAL_HTTP_PTY !== "1" || process.platform === "win32")(
    `real PTY owns redirect Escape/Y and never sends to an unapproved target (${layout})`,
    async () => {
      const root = await mkdtemp(resolve(tmpdir(), "tuiminal-redirect-pty-"))
      const config = resolve(root, "config")
      await mkdir(resolve(config, "tuiminal"), { recursive: true })
      await writeFile(
        resolve(config, "tuiminal/settings.json"),
        JSON.stringify({ layout, language: "pt-BR" }),
      )
      let received = 0
      let initial = 0
      const target = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch() {
          received++
          return new Response("PTY_REDIRECT_ACCEPTED")
        },
      })
      const source = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch() {
          initial++
          return new Response(null, {
            status: 302,
            headers: {
              location: `http://127.0.0.1:${target.port}/?token=FAKE_PTY_REDIRECT_SECRET`,
            },
          })
        },
      })
      let output = ""
      const child = Bun.spawn(
        [process.execPath, resolve(import.meta.dir, "../bin/tuiminal.ts"), "http", root],
        {
          cwd: root,
          env: {
            TERM: "xterm-256color",
            COLORTERM: "truecolor",
            XDG_CONFIG_HOME: config,
            TUIMINAL_TEST_SKIP_STARTUP: "1",
          },
          terminal: {
            cols: 120,
            rows: 30,
            name: "xterm-256color",
            data(_terminal, data) {
              output = (output + new TextDecoder().decode(data)).slice(-150_000)
            },
          },
        },
      )
      const terminal = child.terminal
      const waitFor = async (predicate: () => boolean) => {
        const until = performance.now() + 6_000
        while (!predicate() && performance.now() < until && child.exitCode === null)
          await Bun.sleep(20)
        if (!predicate())
          throw new Error(`PTY did not settle: ${Bun.stripANSI(output).slice(-8_000)}`)
      }
      const send = async (keys: string) => {
        if (!terminal) throw new Error("PTY unavailable")
        terminal.write(keys)
        await Bun.sleep(100)
      }
      try {
        await waitFor(() => Bun.stripANSI(output).includes("Scratch"))
        await send("/")
        await send(`http://127.0.0.1:${source.port}/start`)
        await send("\x1b")
        output = ""
        await send("s")
        await waitFor(() => Bun.stripANSI(output).includes("AUTORIZAR ESTE REDIRECT?"))
        expect(initial).toBe(1)
        expect(received).toBe(0)
        expect(Bun.stripANSI(output)).not.toContain("FAKE_PTY_REDIRECT_SECRET")
        output = ""
        await send("\x1b")
        await waitFor(() => Bun.stripANSI(output).includes("Redirect não autorizado"))
        expect(child.exitCode).toBeNull()
        expect(received).toBe(0)
        output = ""
        await send("s")
        await waitFor(() => Bun.stripANSI(output).includes("AUTORIZAR ESTE REDIRECT?"))
        await send("y")
        await waitFor(() => received === 1)
        await waitFor(() => Bun.stripANSI(output).includes("PTY_REDIRECT_ACCEPTED"))
        expect(initial).toBe(2)
        output = ""
        await send("q")
        await waitFor(() => Bun.stripANSI(output).includes("SAIR COM ALTERAÇÕES"))
        await send("q")
        await waitFor(() => child.exitCode !== null)
        expect(await child.exited).toBe(0)
      } finally {
        // This exact child was created by this fixture; no name/group/port kill.
        if (child.exitCode === null) child.kill("SIGKILL")
        await child.exited
        terminal?.close()
        await Promise.all([source.stop(true), target.stop(true)])
        await rm(root, { recursive: true })
      }
    },
    25_000,
  )
}
