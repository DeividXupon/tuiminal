import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  startTermAgentsProcess,
  type TermAgentsProcessHandle,
} from "../packages/feature-terminal/src/services/terminal"
import { bindFeatureImports, SHARED_FEATURE_IMPORTS } from "../scripts/feature-payload-model"
import { outputScreen } from "./tui/output-screen"

const fixture = fileURLToPath(new URL("./fixtures/workspace-repaint-host.tsx", import.meta.url))
const gitEntry = fileURLToPath(new URL("../packages/feature-git/src/index.ts", import.meta.url))

test.skipIf(process.platform === "win32")(
  "official Git payload preserves the header through real PTY tab transitions on both output backends",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "tuiminal-repaint-output-"))
    try {
      const version = (await Bun.file(new URL("../package.json", import.meta.url)).json()).version
      const build = await Bun.build({
        entrypoints: [gitEntry],
        target: "bun",
        format: "esm",
        external: SHARED_FEATURE_IMPORTS,
        define: { "process.env.NODE_ENV": JSON.stringify("production") },
      })
      expect(build.success).toBe(true)
      const entry = build.outputs[0]
      if (!entry) throw new Error("Git payload build produced no entry")
      const payload = join(root, "git.mjs")
      await writeFile(payload, bindFeatureImports(await entry.text(), version))
      for (const mode of ["default", "single-thread"]) {
        const screen = outputScreen(120, 30)
        let host: TermAgentsProcessHandle | undefined
        const exited = Promise.withResolvers<number | null>()
        try {
          host = startTermAgentsProcess([process.execPath, fixture, payload, version, mode], {
            cwd: root,
            columns: 120,
            rows: 30,
            onData(data) {
              screen.write(data)
              const replies = screen.replies()
              if (replies.byteLength) host?.write(replies)
            },
            onExit: ({ code }) => exited.resolve(code),
          })
          async function waitFor(marker: string) {
            const deadline = performance.now() + 5_000
            let matchedSince: number | undefined
            // Shortcut animations keep producing ANSI output. Wait for the
            // requested scene and preserved header, not a globally silent PTY.
            while (performance.now() < deadline) {
              const frame = screen.read()
              if (frame.includes(marker) && frame.split("\n")[0]?.trim() === "HEADER café 中 🧪") {
                matchedSince ??= performance.now()
                if (performance.now() - matchedSince > 100) return
              } else matchedSince = undefined
              await Bun.sleep(10)
            }
            throw new Error(`Missing ${marker} (${mode}):\n${screen.read()}`)
          }
          await waitFor("No Git repository found")
          for (let cycle = 0; cycle < 2; cycle++) {
            for (const [key, marker] of [
              ["2", "PULL REQUESTS · DEMO"],
              ["3", "ISSUES · DEMO"],
              ["4", "INBOX · DEMO"],
              ["1", "No Git repository found"],
              ["c", "[C] COMPARE"],
              ["c", "No Git repository found"],
            ] as const) {
              host.write(key)
              await waitFor(marker)
              expect(screen.read().split("\n")[0]?.trim()).toBe("HEADER café 中 🧪")
            }
          }
          host.write("\x18")
          const timeout = setTimeout(() => exited.reject(new Error("Host did not exit")), 5_000)
          try {
            expect(await exited.promise).toBe(0)
          } finally {
            clearTimeout(timeout)
          }
        } finally {
          await host?.stop()
          screen.destroy()
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
  30_000,
)
