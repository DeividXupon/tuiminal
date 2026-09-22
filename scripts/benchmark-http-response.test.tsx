import "../tests/tui/setup"
import { test } from "bun:test"
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { testRender } from "@opentui/react/test-utils"
import { act, createElement, useState } from "react"
import { useHttpResponse } from "../packages/feature-http/src/hooks/use-http-response"
import type { HttpDocumentState } from "../packages/feature-http/src/model/types"
import {
  createHttpWorkspaceState,
  createScratchRequest,
} from "../packages/feature-http/src/model/workspace"
import { DEFAULT_HTTP_WORKSPACE_CONFIG } from "../packages/feature-http/src/storage/config"
import { defineBenchmark, measureBenchmark } from "./benchmarks/harness"

function benchmarkCounts() {
  const samples = Number(process.env.BENCHMARK_SAMPLES ?? 20)
  const warmup = Number(process.env.BENCHMARK_WARMUP ?? 3)
  if (!Number.isSafeInteger(samples) || samples < 1) throw new Error("Invalid BENCHMARK_SAMPLES")
  if (!Number.isSafeInteger(warmup) || warmup < 0) throw new Error("Invalid BENCHMARK_WARMUP")
  return { samples, warmup }
}

function responseDocument(id: string, url: string): HttpDocumentState {
  const document = createHttpWorkspaceState(createScratchRequest(id, url)).documents[0]
  if (!document) throw new Error("Missing HTTP benchmark document")
  return {
    ...document,
    execution: {
      status: "success",
      response: {
        executionId: id,
        requestId: id,
        requestRevision: 0,
        url,
        status: 200,
        statusText: "OK",
        headers: [],
        body: new Uint8Array([0x5a]),
        bodyKind: "binary",
        contentType: "application/octet-stream",
        capturedBytes: 1,
        truncated: true,
        encoding: "utf-8",
        redirects: [],
        timings: { headersMs: 0, downloadMs: 0, totalMs: 0 },
      },
    },
  }
}

test("mounted HTTP response download latency and ownership", async () => {
  const { samples, warmup } = benchmarkCounts()
  const project = process.env.TUIMINAL_HTTP_HOME ?? ""
  if (!project || !process.env.XDG_CONFIG_HOME) throw new Error("Missing isolated HTTP fixture")
  const body = Buffer.alloc(131_072, 0x5a)
  let requestCount = 0
  let streamReady = Promise.withResolvers<void>()
  let streamClosed = Promise.withResolvers<void>()
  const server = createServer((request, response) => {
    requestCount += 1
    if (request.url === "/complete") {
      response.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": body.length,
      })
      response.end(body)
      return
    }
    response.writeHead(200, { "content-type": "application/octet-stream" })
    let chunks = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const retire = () => {
      if (timer) clearTimeout(timer)
      streamClosed.resolve()
    }
    request.socket.once("close", retire)
    const writeNext = () => {
      if (response.destroyed || request.socket.destroyed) return
      response.write(Buffer.alloc(8_192, chunks % 256))
      chunks += 1
      if (chunks === 4) streamReady.resolve()
      timer = setTimeout(writeNext, 2)
    }
    writeNext()
  })
  server.listen(0, "127.0.0.1")
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve)
    server.once("error", reject)
  })
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  let renderer: Awaited<ReturnType<typeof testRender>> | undefined
  let api: ReturnType<typeof useHttpResponse> | undefined
  let setDocuments: ((documents: HttpDocumentState[]) => void) | undefined
  let second: HttpDocumentState | undefined
  let notices: string[] = []
  let streamSequence = 0
  let url = ""
  function Harness() {
    const [documents, updateDocuments] = useState([
      responseDocument("first", url),
      responseDocument("second", `${base}/complete`),
    ])
    const [notice, updateNotice] = useState("IDLE")
    setDocuments = updateDocuments
    second = documents.find((document) => document.request.id === "second")
    api = useHttpResponse({
      documents,
      activeRequest: documents[0]?.request,
      environmentName: null,
      clipboard: { copyToClipboardOSC52: () => true },
      setNotice: (message) => {
        notices.push(message)
        updateNotice(message)
      },
      workspaceConfig: DEFAULT_HTTP_WORKSPACE_CONFIG,
      variablesForRequest: () => new Map(),
      isInsecureTlsApproved: () => false,
      authorizeRedirect: () => false,
    })
    return createElement("text", { content: notice })
  }
  const exportedNames = () => {
    try {
      return readdirSync(join(project, "tuiminal-exports/http"))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
      throw error
    }
  }
  async function reset(streaming: boolean) {
    if (renderer) {
      act(() => renderer?.renderer.destroy())
      renderer = undefined
    }
    rmSync(join(project, "tuiminal-exports"), { recursive: true, force: true })
    requestCount = 0
    notices = []
    api = undefined
    setDocuments = undefined
    second = undefined
    streamReady = Promise.withResolvers<void>()
    streamClosed = Promise.withResolvers<void>()
    url = streaming ? `${base}/stream/${++streamSequence}` : `${base}/complete`
    renderer = await act(async () => testRender(createElement(Harness), { width: 70, height: 6 }))
    if (!api) throw new Error("HTTP response hook did not mount")
  }
  async function waitForStream(promise: Promise<void>, label: string) {
    const timeout = Promise.withResolvers<never>()
    const timer = setTimeout(() => timeout.reject(new Error(`${label} timed out`)), 2_000)
    try {
      await Promise.race([promise, timeout.promise])
    } finally {
      clearTimeout(timer)
    }
  }
  try {
    const cases = [
      defineBenchmark({
        id: "ui.http_download_complete",
        tool: "http",
        description: "Mounted HTTP response hook: complete 128 KiB download to rendered notice",
        beforeEach: () => reset(false),
        run: async () => {
          const current = api
          if (!current) throw new Error("Missing mounted HTTP response hook")
          await act(async () => current.downloadComplete("first"))
          await renderer?.renderOnce()
          return { frame: renderer?.captureCharFrame() ?? "", notices, requestCount }
        },
        verify: ({ frame, notices, requestCount }) => {
          const names = exportedNames()
          const path = join(project, "tuiminal-exports/http", names[0] ?? "")
          if (
            requestCount !== 1 ||
            names.length !== 1 ||
            !notices.at(-1)?.startsWith("DOWNLOAD COMPLETO") ||
            !frame.includes("DOWNLOAD COMPLETO") ||
            !readFileSync(path).equals(body) ||
            (process.platform !== "win32" && (statSync(path).mode & 0o777) !== 0o600)
          ) {
            throw new Error("Mounted HTTP download did not publish and render its result")
          }
        },
      }),
      defineBenchmark({
        id: "ui.http_download_duplicate",
        tool: "http",
        description:
          "Mounted HTTP response hook: suppress duplicate activation and cancel one transfer",
        beforeEach: () => reset(true),
        run: async () => {
          const current = api
          if (!current) throw new Error("Missing mounted HTTP response hook")
          let pending: Promise<void>[] = []
          act(() => {
            pending = Array.from({ length: 3 }, () => current.downloadComplete("first"))
          })
          await waitForStream(streamReady.promise, "HTTP stream start")
          act(() => current.cancelDownload())
          await act(async () => Promise.all(pending))
          await waitForStream(streamClosed.promise, "HTTP stream retirement")
          await renderer?.renderOnce()
          return { frame: renderer?.captureCharFrame() ?? "", notices, requestCount }
        },
        verify: ({ frame, notices, requestCount }) => {
          if (
            requestCount !== 1 ||
            exportedNames().length !== 0 ||
            notices.at(-1) !== "DOWNLOAD CANCELADO" ||
            !frame.includes("DOWNLOAD CANCELADO")
          ) {
            throw new Error("Duplicate HTTP download was launched or cancellation failed")
          }
        },
      }),
      defineBenchmark({
        id: "ui.http_download_close_owner",
        tool: "http",
        description: "Mounted HTTP response hook: closing the owning document cancels its transfer",
        beforeEach: () => reset(true),
        run: async () => {
          const current = api
          const replace = setDocuments
          const remaining = second
          if (!current || !replace || !remaining) throw new Error("Missing mounted HTTP document")
          let pending: Promise<void> | undefined
          act(() => {
            pending = current.downloadComplete("first")
          })
          await waitForStream(streamReady.promise, "HTTP stream start")
          act(() => replace([remaining]))
          await act(async () => pending)
          await waitForStream(streamClosed.promise, "HTTP stream retirement")
          await renderer?.renderOnce()
          return { frame: renderer?.captureCharFrame() ?? "", notices, requestCount }
        },
        verify: ({ frame, notices, requestCount }) => {
          if (
            requestCount !== 1 ||
            exportedNames().length !== 0 ||
            notices.at(-1) !== "DOWNLOAD CANCELADO" ||
            !frame.includes("DOWNLOAD CANCELADO")
          ) {
            throw new Error("Closing the HTTP download owner did not cancel its transfer")
          }
        },
      }),
    ]
    const results = []
    for (const benchmark of cases) {
      const result = await measureBenchmark(benchmark, samples, warmup)
      results.push(result)
      console.log(
        `${result.id.padEnd(30)} p50 ${result.p50Ms.toFixed(3)} ms  p95 ${result.p95Ms.toFixed(3)} ms`,
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
    if (renderer) act(() => renderer?.renderer.destroy())
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) =>
        error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
          ? reject(error)
          : resolve(),
      ),
    )
  }
}, 120_000)
