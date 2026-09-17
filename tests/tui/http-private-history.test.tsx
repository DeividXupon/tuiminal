import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { act } from "react"
import { HttpClient } from "../../packages/feature-http/src/HttpWorkspace"
import { getUiSettings, updateUiSettings } from "../../packages/core/src/settings/theme"

let tui: TestRendererSetup | undefined
let server: ReturnType<typeof Bun.serve> | undefined
const root = process.env.TUIMINAL_WORKDIR
if (!root) throw new Error("Isolated HTTP test directory is required")
const originalSettings = getUiSettings()
const savedFiles = new Map<string, Uint8Array | null>()
const secret = "FAKE_TUI_HTTP_PRIVATE_7291"
const historyPath = resolve(root, ".tuiminal/http/history.json")

function currentTui() {
  if (!tui) throw new Error("HTTP TUI is not mounted")
  return tui
}

async function fixture(path: string, content: string | null) {
  savedFiles.set(path, await readFile(path).catch(() => null))
  await mkdir(dirname(path), { recursive: true })
  if (content === null) await unlink(path).catch(() => undefined)
  else await writeFile(path, content, { mode: 0o600 })
}

async function settle(until: () => boolean | Promise<boolean>) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await act(async () => {
      await Bun.sleep(10)
    })
    await currentTui().renderOnce()
    if (await until()) return
  }
  throw new Error(`HTTP privacy TUI did not settle:\n${currentTui().captureCharFrame()}`)
}

async function press(id: string) {
  await act(async () => {
    const button = currentTui().renderer.root.findDescendantById(id) as
      | { press?: () => void }
      | undefined
    if (!button?.press) throw new Error(`Missing HTTP control: ${id}`)
    button.press()
  })
  await currentTui().renderOnce()
}

afterEach(async () => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  await server?.stop(true)
  server = undefined
  for (const [path, content] of savedFiles) {
    if (content === null) await unlink(path).catch(() => undefined)
    else await writeFile(path, content)
  }
  savedFiles.clear()
  updateUiSettings(originalSettings)
})

for (const layout of ["compact", "framed"] as const) {
  test(`legacy defaults are ignored and private values stay out of persisted history (${layout})`, async () => {
    updateUiSettings({ layout })
    const received: string[] = []
    server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(request) {
        received.push(request.url)
        if (new URL(request.url).pathname === "/fail") {
          return new Response(null, { status: 302, headers: { location: `http://[${secret}` } })
        }
        return Response.json({ value: secret })
      },
    })
    const base = `http://127.0.0.1:${server.port}`
    await fixture(
      resolve(root, "alpha-history.http"),
      [
        `### Private success\n# @name success\nGET ${base}/ok?q={{private_value}}`,
        `### Private failure\n# @name failure\nGET ${base}/fail?q={{private_value}}`,
        `### No log\n# @name no-log\n# @no-log\nGET ${base}/ok?q={{private_value}}`,
      ].join("\n\n"),
    )
    await fixture(
      resolve(root, "http-client.private.env.json"),
      JSON.stringify({ "alpha-fixture": { private_value: secret } }),
    )
    await fixture(
      resolve(root, ".tuiminal/http/config.json"),
      JSON.stringify({
        version: 1,
        defaultEnvironment: "alpha-fixture",
        history: { persistMetadata: true, persistBodies: true },
      }),
    )
    await fixture(historyPath, null)
    tui = await testRender(<HttpClient active />, { width: 140, height: 36 })
    await settle(() =>
      Boolean(
        currentTui().renderer.root.findDescendantById(
          "http-navigation-project-alpha-history.http#success",
        ),
      ),
    )
    await press("http-navigation-project-alpha-history.http#success")
    await press("http-environment-button")
    await settle(() =>
      Boolean(
        currentTui().renderer.root.findDescendantById("http-environment-choice-alpha-fixture"),
      ),
    )
    expect(currentTui().captureCharFrame()).toContain("Sem ambiente")
    await press("http-environment-choice-alpha-fixture")
    await settle(() => currentTui().captureCharFrame().includes("[E] alpha-fixture"))
    await press("http-send-button")
    await settle(() => received.length === 1 && currentTui().captureCharFrame().includes(secret))
    expect(received[0]).toContain(`q=${secret}`)
    expect(tui.captureCharFrame()).toContain(secret)
    expect(await readFile(historyPath, "utf8").catch(() => "")).toBe("")

    await press("http-navigation-project-alpha-history.http#failure")
    await press("http-send-button")
    await settle(() => received.length === 2)
    expect(await readFile(historyPath, "utf8").catch(() => "")).toBe("")
    expect(tui.captureCharFrame()).not.toContain(secret)

    await press("http-navigation-project-alpha-history.http#no-log")
    await press("http-send-button")
    await settle(() => currentTui().captureCharFrame().includes(secret))
    expect(await readFile(historyPath, "utf8").catch(() => "")).toBe("")
    expect(received.filter((url) => new URL(url).pathname === "/ok")).toHaveLength(2)
  }, 15_000)
}
