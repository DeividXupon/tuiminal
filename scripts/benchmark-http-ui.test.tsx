import "../tests/tui/setup"
import { test } from "bun:test"
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { testRender } from "@opentui/react/test-utils"
import { act, createElement } from "react"
import { getUiSettings, updateUiSettings } from "../packages/core/src/settings/theme"
import { HttpClient } from "../packages/feature-http/src/HttpClient"
import { defineBenchmark, measureBenchmark } from "./benchmarks/harness"

function benchmarkCounts() {
  const samples = Number(process.env.BENCHMARK_SAMPLES ?? 20)
  const warmup = Number(process.env.BENCHMARK_WARMUP ?? 3)
  if (!Number.isSafeInteger(samples) || samples < 1) throw new Error("Invalid BENCHMARK_SAMPLES")
  if (!Number.isSafeInteger(warmup) || warmup < 0) throw new Error("Invalid BENCHMARK_WARMUP")
  return { samples, warmup }
}

test("HTTP request and response latency in the native interface", async () => {
  const { samples, warmup } = benchmarkCounts()
  const project = process.env.TUIMINAL_HTTP_HOME
  if (!project || !process.env.XDG_CONFIG_HOME) {
    throw new Error("Missing isolated HTTP TUI fixture")
  }
  const downloadBody = Buffer.alloc(1_600_000, 0x5a)
  const exportRoot = join(project, "tuiminal-exports", "http")
  let requests = 0
  const streamTimers = new Set<ReturnType<typeof setInterval>>()
  const server = createServer((request, response) => {
    requests += 1
    if (request.url === "/download-stream") {
      response.writeHead(200, { "content-type": "application/octet-stream" })
      response.write(downloadBody)
      const timer = setInterval(() => {
        if (!response.destroyed && !request.socket.destroyed)
          response.write(Buffer.alloc(8_192, 0x5a))
      }, 5)
      streamTimers.add(timer)
      request.socket.once("close", () => {
        clearInterval(timer)
        streamTimers.delete(timer)
      })
      return
    }
    if (request.url === "/download") {
      response.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": downloadBody.length,
      })
      response.end(downloadBody)
      return
    }
    response.writeHead(200, { "content-type": "application/json" })
    response.end('{"user":{"profile":{"name":"Ada"}},"tags":["one","two"],"answer":42}')
  })
  server.listen(0, "127.0.0.1")
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve)
    server.once("error", reject)
  })
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const previousSettings = getUiSettings()
  let tui: Awaited<ReturnType<typeof testRender>> | undefined
  async function waitFor(condition: () => boolean, label: string) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await tui?.renderOnce()
      if (condition()) return tui?.captureCharFrame() ?? ""
      await act(async () => Bun.sleep(5))
    }
    throw new Error(
      `HTTP UI did not show ${label}; focus=${tui?.renderer.currentFocusedRenderable?.id ?? "none"}:\n${tui?.captureCharFrame()}`,
    )
  }
  async function clickVisible(label: string) {
    const lines = (tui?.captureCharFrame() ?? "").split("\n")
    const y = lines.findIndex((line) => line.includes(label))
    const x = y < 0 ? -1 : (lines[y]?.indexOf(label) ?? -1) + Math.floor(label.length / 2)
    if (x < 0 || y < 0) throw new Error(`HTTP control is not visible: ${label}`)
    await act(async () => tui?.mockMouse.click(x, y, 0, { delayMs: 0 }))
  }
  async function reset(sent: boolean, path = "/response") {
    if (tui) {
      act(() => tui?.renderer.destroy())
      tui = undefined
    }
    requests = 0
    if (path.startsWith("/download")) rmSync(exportRoot, { recursive: true, force: true })
    tui = await act(async () =>
      testRender(
        createElement(HttpClient, { active: true, initialUrlRequest: { id: 1, url: base + path } }),
        { width: 120, height: 32 },
      ),
    )
    await waitFor(
      () => tui?.renderer.currentFocusedRenderable?.id === "http-url-input",
      "focused URL input",
    )
    if (sent) {
      await act(async () => tui?.mockInput.pressEnter())
      await waitFor(
        () =>
          (tui?.captureCharFrame() ?? "").includes(
            path.startsWith("/download") ? "Baixar completo" : '"name": "Ada"',
          ),
        path.startsWith("/download") ? "truncated HTTP response" : "prepared HTTP response",
      )
      await waitFor(
        () => tui?.renderer.currentFocusedRenderable?.id === "http-response-scroll-http-scratch-1",
        "focused HTTP response",
      )
    }
  }
  async function prepareResponseSearch() {
    await reset(true)
    await act(async () => tui?.mockInput.pressKey("f", { ctrl: true }))
    await waitFor(
      () => tui?.renderer.currentFocusedRenderable?.id === "http-response-search-http-scratch-1",
      "focused response search",
    )
  }
  try {
    updateUiSettings({ language: "pt-BR", layout: "framed" })
    const cases = [
      defineBenchmark({
        id: "ui.http_send_keyboard",
        tool: "http",
        description: "Send a loopback GET from the URL input to rendered status and JSON",
        beforeEach: () => reset(false),
        run: async () => {
          await act(async () => tui?.mockInput.pressEnter())
          const frame = await waitFor(
            () => (tui?.captureCharFrame() ?? "").includes('"name": "Ada"'),
            "HTTP JSON response",
          )
          return { frame, requests }
        },
        verify: ({ frame, requests }) => {
          if (requests !== 1 || !frame.includes("200 OK") || !frame.includes('"name": "Ada"')) {
            throw new Error("Keyboard HTTP send did not render the loopback response")
          }
        },
      }),
      defineBenchmark({
        id: "ui.http_send_mouse",
        tool: "http",
        description: "Click the HTTP Send control to a rendered loopback JSON response",
        beforeEach: () => reset(false),
        run: async () => {
          const button = tui?.renderer.root.findDescendantById("http-send-button")
          if (!button) throw new Error("HTTP Send control is missing")
          await act(async () =>
            tui?.mockMouse.click(
              button.screenX + Math.max(0, Math.floor(button.width / 2)),
              button.screenY + Math.max(0, Math.floor(button.height / 2)),
              0,
              { delayMs: 0 },
            ),
          )
          const frame = await waitFor(
            () => (tui?.captureCharFrame() ?? "").includes('"name": "Ada"'),
            "mouse-sent HTTP response",
          )
          return { frame, requests }
        },
        verify: ({ frame, requests }) => {
          if (requests !== 1 || !frame.includes("200 OK")) {
            throw new Error("Mouse HTTP send did not render the loopback response")
          }
        },
      }),
      defineBenchmark({
        id: "ui.http_open_search_keyboard",
        tool: "http",
        description: "Open the response search field from its keyboard shortcut",
        beforeEach: () => reset(true),
        run: async () => {
          await act(async () => tui?.mockInput.pressKey("f", { ctrl: true }))
          return waitFor(
            () =>
              tui?.renderer.currentFocusedRenderable?.id === "http-response-search-http-scratch-1",
            "focused response search field",
          )
        },
        verify: (frame) => {
          if (!frame.includes("BUSCAR NA RESPOSTA") || requests !== 1) {
            throw new Error("Keyboard shortcut did not open response search")
          }
        },
      }),
      defineBenchmark({
        id: "ui.http_response_search",
        tool: "http",
        description: "Type into a prepared response search input to render one match",
        beforeEach: prepareResponseSearch,
        run: async () => {
          await act(async () => tui?.mockInput.typeText("answer"))
          return waitFor(
            () => (tui?.captureCharFrame() ?? "").includes("1/1"),
            "one matching response result",
          )
        },
        verify: (frame) => {
          if (!frame.includes("1/1") || requests !== 1) {
            throw new Error("HTTP response search did not find the fixture value")
          }
        },
      }),
      defineBenchmark({
        id: "ui.http_json_collapse",
        tool: "http",
        description: "Navigate and collapse a Pretty JSON object in the native response pane",
        beforeEach: () => reset(true),
        run: async () => {
          await act(async () => tui?.mockInput.pressKey("ARROW_DOWN"))
          await waitFor(
            () => (tui?.captureCharFrame() ?? "").includes("/user"),
            "selected JSON object",
          )
          await act(async () => tui?.mockInput.pressKey("ARROW_LEFT"))
          return waitFor(
            () => (tui?.captureCharFrame() ?? "").includes('▸   "user":'),
            "collapsed JSON object",
          )
        },
        verify: (frame) => {
          if (!frame.includes('▸   "user":') || frame.includes('"name": "Ada"') || requests !== 1) {
            throw new Error("Pretty JSON did not collapse the selected object")
          }
        },
      }),
      defineBenchmark({
        id: "ui.http_complete_download_mouse",
        tool: "http",
        description:
          "Click the visible complete-download control to publish a full binary response",
        beforeEach: () => reset(true, "/download"),
        run: async () => {
          await clickVisible("Baixar completo")
          const frame = await waitFor(
            () => (tui?.captureCharFrame() ?? "").includes("DOWNLOAD COMPLETO"),
            "complete-download notice",
          )
          return { frame, requests }
        },
        verify: ({ frame, requests }) => {
          const files = readdirSync(exportRoot)
          const file = files[0]
          if (
            !frame.includes("DOWNLOAD COMPLETO") ||
            requests !== 2 ||
            files.length !== 1 ||
            !file ||
            statSync(join(exportRoot, file)).size !== downloadBody.length ||
            readFileSync(join(exportRoot, file))[downloadBody.length - 1] !== 0x5a
          ) {
            throw new Error("Mouse download did not publish the full loopback response")
          }
        },
      }),
      defineBenchmark({
        id: "ui.http_cancel_download_mouse",
        tool: "http",
        description: "Start and cancel a streaming complete download through the visible controls",
        beforeEach: () => reset(true, "/download-stream"),
        run: async () => {
          await clickVisible("Baixar completo")
          await waitFor(
            () => (tui?.captureCharFrame() ?? "").includes("Cancelar download") && requests === 2,
            "active complete download",
          )
          await clickVisible("Cancelar download")
          const frame = await waitFor(
            () => (tui?.captureCharFrame() ?? "").includes("DOWNLOAD CANCELADO"),
            "cancelled download notice",
          )
          return { frame, requests }
        },
        verify: ({ frame, requests }) => {
          const files = existsSync(exportRoot) ? readdirSync(exportRoot) : []
          if (!frame.includes("DOWNLOAD CANCELADO") || requests !== 2 || files.length !== 0) {
            throw new Error("Mouse cancellation left a full or partial download")
          }
        },
      }),
    ]
    const results = []
    for (const benchmark of cases) {
      const result = await measureBenchmark(benchmark, samples, warmup)
      results.push(result)
      console.log(
        `${result.id.padEnd(26)} p50 ${result.p50Ms.toFixed(3)} ms  p95 ${result.p95Ms.toFixed(3)} ms`,
      )
    }
    if (process.env.BENCHMARK_OUTPUT) {
      writeFileSync(
        process.env.BENCHMARK_OUTPUT,
        `${JSON.stringify(
          {
            schemaVersion: 1,
            createdAt: new Date().toISOString(),
            runtime: { bun: Bun.version, platform: process.platform, arch: process.arch },
            configuration: { samples, warmup },
            results,
          },
          null,
          2,
        )}\n`,
      )
    }
  } finally {
    if (tui) act(() => tui?.renderer.destroy())
    updateUiSettings(previousSettings)
    server.closeAllConnections()
    for (const timer of streamTimers) clearInterval(timer)
    await new Promise<void>((resolve, reject) =>
      server.close((error) =>
        error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
          ? reject(error)
          : resolve(),
      ),
    )
  }
}, 120_000)
