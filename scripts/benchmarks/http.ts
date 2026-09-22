import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createServer, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { join } from "node:path"
import { type BenchmarkCase, defineBenchmark } from "./harness"

function respondChainRequest(
  url: string,
  authorization: string | undefined,
  response: ServerResponse,
) {
  const authorized = authorization === "Bearer benchmark-private-token"
  const login = url === "/chain/login"
  const found = url === "/chain/user" || url === "/chain/users/42"
  response.writeHead(login || (found && authorized) ? 200 : 401, {
    "content-type": "application/json",
  })
  response.end(
    JSON.stringify(login ? { token: "benchmark-private-token" } : { id: 42, authorized }),
  )
}

function respondDatasetRequest(url: string, response: ServerResponse) {
  const id = Number(url.slice("/dataset/".length))
  response.writeHead(Number.isInteger(id) && id > 0 ? 200 : 400, {
    "content-type": "application/json",
  })
  response.end(JSON.stringify({ id }))
}

function respondDatasetChainRequest(
  url: string,
  authorization: string | undefined,
  response: ServerResponse,
) {
  const parsed = new URL(url, "http://benchmark.local")
  const id = Number(parsed.searchParams.get("id") ?? parsed.pathname.split("/").at(-1))
  const login = parsed.pathname === "/dataset-chain/login"
  const lookup = parsed.pathname.startsWith("/dataset-chain/users/")
  const pathId = Number(parsed.pathname.split("/").at(-1))
  const authorized = authorization === `Bearer benchmark-token-${id}` && (!lookup || pathId === id)
  response.writeHead(Number.isInteger(id) && id > 0 && (login || authorized) ? 200 : 401, {
    "content-type": "application/json",
  })
  response.end(JSON.stringify(login ? { token: `benchmark-token-${id}` } : { id, authorized }))
}

export async function httpBenchmarks(parent: string): Promise<{
  cases: BenchmarkCase[]
  cleanup: () => Promise<void>
}> {
  const project = join(parent, "http-project")
  mkdirSync(project)
  const downloadRoot = join(project, "benchmark-downloads")
  mkdirSync(downloadRoot)
  const resetDownloads = () =>
    rmSync(join(downloadRoot, "tuiminal-exports"), { recursive: true, force: true })
  const downloadedNames = () => {
    try {
      return readdirSync(join(downloadRoot, "tuiminal-exports/http"))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
      throw error
    }
  }
  const downloadBody = Buffer.alloc(131_072, 0x5a)
  const continuousReady = new Map<string, { resolve: () => void }>()
  const continuousClosed = new Set<string>()
  let continuousSequence = 0
  let crossOriginBase = ""
  const crossOriginServer = createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" })
    response.end(
      JSON.stringify({
        authorization: request.headers.authorization ?? null,
        cookie: request.headers.cookie ?? null,
        trace: request.headers["x-trace"] ?? null,
      }),
    )
  })
  const server = createServer((request, response) => {
    if (request.url === "/download") {
      response.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-length": downloadBody.length,
      })
      response.end(downloadBody)
      return
    }
    if (request.url === "/download-missing") {
      response.writeHead(404, { "content-type": "text/plain" })
      response.end("missing benchmark response")
      return
    }
    if (request.url === "/redirect") {
      response.writeHead(302, { location: "/small" })
      response.end()
      return
    }
    if (request.url === "/cross-redirect") {
      response.writeHead(307, { location: `${crossOriginBase}/final` })
      response.end()
      return
    }
    if (request.url?.startsWith("/chain/")) {
      respondChainRequest(request.url, request.headers.authorization, response)
      return
    }
    if (request.url?.startsWith("/dataset/")) {
      respondDatasetRequest(request.url, response)
      return
    }
    if (request.url?.startsWith("/dataset-chain/")) {
      respondDatasetChainRequest(request.url, request.headers.authorization, response)
      return
    }
    const continuousId = /^\/continuous\/(\d+)$/.exec(request.url ?? "")?.[1]
    if (continuousId) {
      response.writeHead(200, { "content-type": "application/octet-stream" })
      const retire = () => {
        response.off("close", retire)
        request.socket.off("close", retire)
        continuousClosed.add(continuousId)
      }
      response.once("close", retire)
      request.socket.once("close", retire)
      void (async () => {
        for (let index = 0; !response.destroyed && !request.socket.destroyed; index += 1) {
          if (!response.write(Buffer.alloc(8_192, index % 256))) {
            await new Promise<void>((resolve) => {
              const resume = () => {
                response.off("drain", resume)
                response.off("close", resume)
                request.socket.off("close", resume)
                resolve()
              }
              response.once("drain", resume)
              response.once("close", resume)
              request.socket.once("close", resume)
            })
          }
          if (index === 3) continuousReady.get(continuousId)?.resolve()
          await Bun.sleep(2)
        }
      })()
      return
    }
    const chunks: Uint8Array[] = []
    request.on("data", (chunk: Uint8Array) => chunks.push(chunk))
    request.on("end", () => {
      if (request.url === "/stream") {
        response.writeHead(200, { "content-type": "application/octet-stream" })
        void (async () => {
          for (
            let index = 0;
            index < 16 && !response.destroyed && !request.socket.destroyed;
            index += 1
          ) {
            if (!response.write(Buffer.alloc(8_192, index))) {
              await new Promise<void>((resolve) => {
                const resume = () => {
                  response.off("drain", resume)
                  request.socket.off("close", resume)
                  resolve()
                }
                response.once("drain", resume)
                request.socket.once("close", resume)
              })
            }
            await Bun.sleep(2)
          }
          if (!response.destroyed && !request.socket.destroyed) response.end()
        })()
        return
      }
      if (request.url === "/slow") {
        setTimeout(() => {
          if (!response.destroyed) response.end("late")
        }, 100)
        return
      }
      response.writeHead(200, { "content-type": "application/json" })
      response.end(
        JSON.stringify({
          method: request.method,
          bytes: Buffer.concat(chunks).length,
          payload: "x".repeat(request.url === "/large" ? 2_000_000 : 32_768),
        }),
      )
    })
  })
  const cleanup = async () => {
    for (const ownedServer of [server, crossOriginServer]) {
      ownedServer.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        ownedServer.close((error) =>
          error && (error as NodeJS.ErrnoException).code !== "ERR_SERVER_NOT_RUNNING"
            ? reject(error)
            : resolve(),
        ),
      )
    }
  }
  try {
    crossOriginServer.listen(0, "127.0.0.1")
    await new Promise<void>((resolve, reject) => {
      crossOriginServer.once("listening", resolve)
      crossOriginServer.once("error", reject)
    })
    crossOriginBase = `http://127.0.0.1:${(crossOriginServer.address() as AddressInfo).port}`
    server.listen(0, "127.0.0.1")
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve)
      server.once("error", reject)
    })
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const { parseHttpFile, requestFromHttpFile } = await import(
      "../../packages/feature-http/src/model/http-file"
    )
    const { prepareHttpRequest } = await import(
      "../../packages/feature-http/src/services/request-builder"
    )
    const { executePreparedHttpRequest } = await import(
      "../../packages/feature-http/src/services/fetch-transport"
    )
    const { downloadCompleteHttpResponse } = await import(
      "../../packages/feature-http/src/services/download"
    )
    const { scanHttpProject } = await import(
      "../../packages/feature-http/src/storage/collection-scan"
    )
    const { loadHttpProjectRunnerDataset, runHttpCollectionCase, runHttpDataset } = await import(
      "../../packages/feature-http/src/services/collection-runner"
    )
    const { formatHttpRunReport } = await import("../../packages/feature-http/src/cli/report")
    const { foldHttpJson, findHttpTextMatches, diffHttpText } = await import(
      "../../packages/feature-http/src/model/response"
    )
    const { createHttpVariableContext, resolveHttpTemplate } = await import(
      "../../packages/feature-http/src/model/variables"
    )
    const { HttpCookieJar } = await import("../../packages/feature-http/src/services/cookies")
    const { previewHttpCollectionImport, applyHttpCollectionImport } = await import(
      "../../packages/feature-http/src/services/collection-import"
    )
    const { budgetHttpHistory } = await import("../../packages/feature-http/src/model/history")
    const { DEFAULT_HTTP_WORKSPACE_CONFIG } = await import(
      "../../packages/feature-http/src/storage/config"
    )
    const { loadHttpHistory, persistHttpHistoryEntry } = await import(
      "../../packages/feature-http/src/storage/history"
    )
    type HttpHistoryEntry = import("../../packages/feature-http/src/model/types").HttpHistoryEntry
    const source = `### Small\n# @name small\n# @assert status == 200\nGET ${base}/small\n\n### Post\n# @name post\nPOST ${base}/post\nContent-Type: application/json\n\n{"ok":true}\n\n### Redirect\n# @name redirect\nGET ${base}/redirect\n`
    writeFileSync(join(project, "requests.http"), source)
    for (let index = 0; index < 10; index += 1) {
      writeFileSync(join(project, `collection-${index}.http`), `GET ${base}/small\n`)
    }
    const file = parseHttpFile(source, "requests.http")
    const requests = file.requests.map((block) => requestFromHttpFile(file, block))
    const chainSource = `### Lookup
# @name lookup
# @depends user
# @assert status == 200
GET ${base}/chain/users/{{userId}}
Authorization: Bearer {{token}}

### User
# @name user
# @depends login
# @extract userId = $.id
# @assert jsonpath $.authorized == true
GET ${base}/chain/user
Authorization: Bearer {{token}}

### Login
# @name login
# @extract-secret token = $.token
# @assert status == 200
GET ${base}/chain/login
`
    const chainFile = parseHttpFile(chainSource, "chain.http")
    const chainItems = chainFile.requests.map((block) => ({
      filePath: "chain.http",
      request: requestFromHttpFile(chainFile, block),
    }))
    const chainTarget = chainItems[0]
    if (!chainTarget) throw new Error("Missing HTTP chain fixture target")
    const datasetChainFile = parseHttpFile(
      `### Lookup
# @name dataset-lookup
# @depends dataset-user
# @assert status == 200
GET ${base}/dataset-chain/users/{{userId}}?id={{id}}
Authorization: Bearer {{token}}

### User
# @name dataset-user
# @depends dataset-login
# @extract userId = $.id
# @assert jsonpath $.authorized == true
GET ${base}/dataset-chain/user?id={{id}}
Authorization: Bearer {{token}}

### Login
# @name dataset-login
# @extract-secret token = $.token
# @assert status == 200
GET ${base}/dataset-chain/login?id={{id}}
`,
      "dataset-chain.http",
    )
    const datasetChainItems = datasetChainFile.requests.map((block) => ({
      filePath: "dataset-chain.http",
      request: requestFromHttpFile(datasetChainFile, block),
    }))
    const datasetChainTarget = datasetChainItems[0]
    if (!datasetChainTarget) throw new Error("Missing HTTP dataset-chain fixture")
    writeFileSync(
      join(project, "benchmark-dataset.json"),
      JSON.stringify(Array.from({ length: 10 }, (_, index) => ({ id: index + 1 }))),
    )
    const datasetFile = parseHttpFile(
      `### Dataset\n# @name dataset\n# @assert status == 200\nGET ${base}/dataset/{{id}}\n`,
      "dataset.http",
    )
    const datasetBlock = datasetFile.requests[0]
    if (!datasetBlock) throw new Error("Missing HTTP dataset fixture")
    const datasetRequest = requestFromHttpFile(datasetFile, datasetBlock)
    const firstRequest = requests[0]
    if (!firstRequest) throw new Error("Missing HTTP fixture request")
    writeFileSync(join(project, "payload.txt"), "benchmark file payload")
    const importPath = join(project, "benchmark.postman.json")
    writeFileSync(
      importPath,
      JSON.stringify({
        info: {
          name: "Benchmark",
          schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        item: Array.from({ length: 100 }, (_, index) => ({
          name: `Request ${index}`,
          request: { method: "GET", url: `${base}/small` },
        })),
      }),
    )
    const openApiPath = join(project, "benchmark.openapi.json")
    writeFileSync(
      openApiPath,
      JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Benchmark", version: "1.0.0" },
        servers: [{ url: base }],
        paths: Object.fromEntries(
          Array.from({ length: 100 }, (_, index) => [
            `/item/${index}`,
            {
              get: { operationId: `getItem${index}`, responses: { "200": { description: "OK" } } },
            },
          ]),
        ),
      }),
    )
    const fileRequest = {
      ...firstRequest,
      method: "POST",
      url: `${base}/file`,
      body: { kind: "file" as const, text: "", form: [], filePath: "payload.txt" },
    }
    const multipartRequest = {
      ...firstRequest,
      method: "POST",
      url: `${base}/multipart`,
      body: {
        kind: "multipart" as const,
        text: "",
        form: [],
        multipart: [
          {
            id: "caption",
            enabled: true,
            name: "caption",
            value: "benchmark caption",
            kind: "text" as const,
            sensitivity: "normal" as const,
          },
          {
            id: "upload",
            enabled: true,
            name: "upload",
            value: "payload.txt",
            kind: "file" as const,
            sensitivity: "normal" as const,
          },
        ],
      },
    }
    const largeJson = JSON.stringify({
      items: Array.from({ length: 250 }, (_, index) => ({ id: index, name: `Item ${index}` })),
    })
    const beforeText = Array.from({ length: 200 }, (_, index) => `line ${index}`).join("\n")
    const afterText = `${beforeText}\nnew line`
    const variables = createHttpVariableContext([
      { origin: "public", values: { host: base, path: "{{resource}}", resource: "small" } },
    ])
    const cookieHeaders = new Headers({ "set-cookie": "session=abc; Path=/" })
    const historyResponse = await executePreparedHttpRequest(
      prepareHttpRequest(firstRequest, "history-fixture", 1),
    )
    const historyBody = new Uint8Array(600_000)
    const historyEntries: HttpHistoryEntry[] = Array.from({ length: 100 }, (_, index) => ({
      ...(historyResponse.privacy ? { privacy: historyResponse.privacy } : {}),
      id: `history-${index}`,
      createdAt: Date.now() - index * 1_000,
      requestId: firstRequest.id,
      requestName: firstRequest.name,
      environmentName: null,
      method: firstRequest.method,
      url: firstRequest.url,
      status: 200,
      durationMs: 1,
      error: null,
      response: { ...historyResponse, body: historyBody },
      bodyDiscarded: false,
      persisted: false,
    }))
    const persistedHistoryEntry = historyEntries[0]
    if (!persistedHistoryEntry) throw new Error("Missing HTTP history fixture")
    const historyConfig = {
      ...DEFAULT_HTTP_WORKSPACE_CONFIG,
      history: { persistMetadata: true, persistBodies: true },
    }
    const prepared = (index: number) => {
      const request = requests[index]
      if (!request) throw new Error(`Missing HTTP request ${index}`)
      return prepareHttpRequest(request, `bench-${index}`, 1)
    }
    const downloadNow = new Date("2026-09-22T12:00:00.000Z")
    const downloadRequest = prepareHttpRequest(
      { ...firstRequest, url: `${base}/download` },
      "benchmark-download",
      1,
    )
    const download = (request = downloadRequest, signal = new AbortController().signal) =>
      downloadCompleteHttpResponse({
        root: downloadRoot,
        requestName: "Benchmark response",
        request,
        signal,
        now: downloadNow,
      })
    let firstDownloadPath = ""
    const waitForContinuousClose = async (id: string) => {
      const deadline = performance.now() + 2_000
      while (!continuousClosed.has(id) && performance.now() < deadline) await Bun.sleep(1)
      if (!continuousClosed.delete(id)) throw new Error("Continuous HTTP stream stayed open")
    }
    const cases: BenchmarkCase[] = [
      defineBenchmark({
        id: "http.parse",
        tool: "http",
        description: "Parse a three-request .http source",
        run: () => parseHttpFile(source, "requests.http"),
        verify: (result) => {
          if (result.requests.length !== 3) throw new Error("Missing parsed requests")
        },
      }),
      defineBenchmark({
        id: "http.scan",
        tool: "http",
        description: "Scan an 11-file local HTTP collection",
        run: () => scanHttpProject(project),
        verify: (result) => {
          if (result.files.length !== 11) throw new Error("Incomplete collection scan")
        },
      }),
      defineBenchmark({
        id: "http.prepare",
        tool: "http",
        description: "Build and validate a JSON POST request",
        run: () => prepared(1),
        verify: (result) => {
          if (result.method !== "POST") throw new Error("Wrong request method")
        },
      }),
      defineBenchmark({
        id: "http.prepare_auth",
        tool: "http",
        description: "Build a Bearer-authenticated request",
        run: () =>
          prepareHttpRequest(
            { ...firstRequest, auth: { kind: "bearer", token: "fixture-token" } },
            "auth",
            1,
          ),
        verify: (result) => {
          if (!result.headers.some(([name]) => name.toLowerCase() === "authorization")) {
            throw new Error("Authentication header missing")
          }
        },
      }),
      defineBenchmark({
        id: "http.variables",
        tool: "http",
        description: "Resolve 100 nested request variables",
        operationsPerSample: 100,
        run: () => {
          let total = 0
          for (let index = 0; index < 100; index += 1) {
            total += resolveHttpTemplate("{{host}}/{{path}}", variables).length
          }
          return total
        },
        verify: (result) => {
          if (result < 100) throw new Error("Variables were not resolved")
        },
      }),
      defineBenchmark({
        id: "http.get",
        tool: "http",
        description: "Loopback GET through response capture (32 KiB)",
        run: () => executePreparedHttpRequest(prepared(0)),
        verify: (result) => {
          if (result.status !== 200 || result.body.length < 32_768) {
            throw new Error("Incomplete GET response")
          }
        },
      }),
      defineBenchmark({
        id: "http.post",
        tool: "http",
        description: "Loopback JSON POST through response capture",
        run: () => executePreparedHttpRequest(prepared(1)),
        verify: (result) => {
          if (
            result.status !== 200 ||
            !new TextDecoder().decode(result.body).includes('"bytes":11')
          ) {
            throw new Error("Incomplete POST response")
          }
        },
      }),
      defineBenchmark({
        id: "http.multipart",
        tool: "http",
        description: "Prepare and send a loopback multipart request with a project file",
        run: () =>
          executePreparedHttpRequest(
            prepareHttpRequest(multipartRequest, "multipart", 1, undefined, project),
          ),
        verify: (result) => {
          if (result.status !== 200 || result.body.length < 32_768) {
            throw new Error("Multipart request failed")
          }
        },
      }),
      defineBenchmark({
        id: "http.file_body",
        tool: "http",
        description: "Prepare and send a project-scoped file body",
        run: () =>
          executePreparedHttpRequest(
            prepareHttpRequest(fileRequest, "file", 1, undefined, project),
          ),
        verify: (result) => {
          if (
            result.status !== 200 ||
            !new TextDecoder().decode(result.body).includes('"bytes":22')
          ) {
            throw new Error("File body request failed")
          }
        },
      }),
      defineBenchmark({
        id: "http.capture_limit",
        tool: "http",
        description: "Capture a 2 MB loopback response at the 1.5 MB limit",
        run: () =>
          executePreparedHttpRequest(
            prepareHttpRequest({ ...firstRequest, url: `${base}/large` }, "large", 1),
          ),
        verify: (result) => {
          if (!result.truncated || result.capturedBytes !== 1_500_000) {
            throw new Error("Response capture limit failed")
          }
        },
      }),
      defineBenchmark({
        id: "http.stream_capture",
        tool: "http",
        description: "Capture a finite 128 KiB chunked loopback response",
        run: () =>
          executePreparedHttpRequest(
            prepareHttpRequest({ ...firstRequest, url: `${base}/stream` }, "stream", 1),
          ),
        verify: (result) => {
          if (result.status !== 200 || result.capturedBytes !== 131_072 || result.truncated) {
            throw new Error("Streaming response capture failed")
          }
        },
      }),
      defineBenchmark({
        id: "http.stream_truncate_continuous",
        tool: "http",
        description: "Truncate a continuous loopback stream at 32 KiB and retire its transport",
        run: async () => {
          const id = String(++continuousSequence)
          const response = await executePreparedHttpRequest(
            prepareHttpRequest({ ...firstRequest, url: `${base}/continuous/${id}` }, id, 1),
            undefined,
            32_768,
          )
          await waitForContinuousClose(id)
          return response
        },
        verify: (result) => {
          if (result.status !== 200 || !result.truncated || result.capturedBytes !== 32_768) {
            throw new Error("Continuous response did not truncate and retire")
          }
        },
      }),
      defineBenchmark({
        id: "http.stream_cancel_after_data",
        tool: "http",
        description: "Cancel a continuous loopback response after four produced chunks",
        run: async () => {
          const id = String(++continuousSequence)
          const controller = new AbortController()
          const ready = Promise.withResolvers<void>()
          continuousReady.set(id, ready)
          const pending = executePreparedHttpRequest(
            prepareHttpRequest({ ...firstRequest, url: `${base}/continuous/${id}` }, id, 1),
            controller.signal,
          ).then(
            () => "unexpected-success",
            (error) =>
              error instanceof Error && "kind" in error ? error.kind : "unexpected-error",
          )
          const timer = setTimeout(
            () => ready.reject(new Error("Continuous stream never started")),
            2_000,
          )
          try {
            await ready.promise
            controller.abort()
            const kind = await pending
            await waitForContinuousClose(id)
            return kind
          } finally {
            clearTimeout(timer)
            continuousReady.delete(id)
            controller.abort()
            await pending
          }
        },
        verify: (result) => {
          if (result !== "cancelled") throw new Error(`Mid-stream cancellation failed: ${result}`)
        },
      }),
      defineBenchmark({
        id: "http.download_get",
        tool: "http",
        description: "Download, sync, and publish a complete 128 KiB binary GET response",
        beforeEach: resetDownloads,
        run: () => download(),
        verify: (result) => {
          const body = readFileSync(result.path)
          if (
            result.status !== 200 ||
            result.bytes !== downloadBody.length ||
            !body.equals(downloadBody) ||
            downloadedNames().length !== 1 ||
            (process.platform !== "win32" && (statSync(result.path).mode & 0o777) !== 0o600)
          ) {
            throw new Error("Complete HTTP download was not published intact")
          }
        },
      }),
      defineBenchmark({
        id: "http.download_collision",
        tool: "http",
        description: "Publish a second complete download without replacing the first",
        beforeEach: async () => {
          resetDownloads()
          firstDownloadPath = (await download()).path
        },
        run: () => download(),
        verify: (result) => {
          const names = downloadedNames()
          if (
            result.bytes !== downloadBody.length ||
            result.path === firstDownloadPath ||
            names.length !== 2 ||
            names.some((name) => name.endsWith(".part")) ||
            !readFileSync(firstDownloadPath).equals(downloadBody) ||
            !readFileSync(result.path).equals(downloadBody)
          ) {
            throw new Error("Complete HTTP download replaced a previous file")
          }
        },
      }),
      defineBenchmark({
        id: "http.download_redirect",
        tool: "http",
        description: "Follow a loopback redirect and publish the full JSON response",
        beforeEach: resetDownloads,
        run: () =>
          download(
            prepareHttpRequest(
              { ...firstRequest, url: `${base}/redirect` },
              "download-redirect",
              1,
            ),
          ),
        verify: (result) => {
          if (
            result.status !== 200 ||
            !result.url.endsWith("/small") ||
            !result.path.endsWith(".json") ||
            !readFileSync(result.path, "utf8").includes('"method":"GET"')
          ) {
            throw new Error("Redirected HTTP download was incomplete")
          }
        },
      }),
      defineBenchmark({
        id: "http.download_cancel",
        tool: "http",
        description: "Cancel a streaming download and retire its loopback transport",
        beforeEach: resetDownloads,
        run: async () => {
          const id = String(++continuousSequence)
          const controller = new AbortController()
          const ready = Promise.withResolvers<void>()
          continuousReady.set(id, ready)
          const request = prepareHttpRequest(
            { ...firstRequest, url: `${base}/continuous/${id}` },
            `download-cancel-${id}`,
            1,
          )
          const pending = download(request, controller.signal).then(
            () => false,
            () => true,
          )
          const timer = setTimeout(
            () => ready.reject(new Error("Download stream never started")),
            2_000,
          )
          try {
            await ready.promise
            controller.abort()
            const rejected = await pending
            await waitForContinuousClose(id)
            return rejected
          } finally {
            clearTimeout(timer)
            continuousReady.delete(id)
            controller.abort()
            await pending
          }
        },
        verify: (rejected) => {
          if (!rejected || downloadedNames().length !== 0) {
            throw new Error("Cancelled HTTP download left a published or partial file")
          }
        },
      }),
      defineBenchmark({
        id: "http.download_status_error",
        tool: "http",
        description: "Reject a 404 download without publishing a file",
        beforeEach: resetDownloads,
        run: async () => {
          try {
            await download(
              prepareHttpRequest(
                { ...firstRequest, url: `${base}/download-missing` },
                "download-missing",
                1,
              ),
            )
            return "unexpected-success"
          } catch (error) {
            return String(error)
          }
        },
        verify: (message) => {
          if (!message.includes("status HTTP 404") || downloadedNames().length !== 0) {
            throw new Error("Failed HTTP download was published")
          }
        },
      }),
      defineBenchmark({
        id: "http.download_reject_post",
        tool: "http",
        description: "Reject a POST before a complete-response download can resend it",
        beforeEach: resetDownloads,
        run: async () => {
          try {
            await download(
              prepareHttpRequest(
                { ...firstRequest, method: "POST", url: `${base}/download` },
                "download-post",
                1,
              ),
            )
            return "unexpected-success"
          } catch (error) {
            return String(error)
          }
        },
        verify: (message) => {
          if (!message.includes("requests GET") || downloadedNames().length !== 0) {
            throw new Error("Unsafe HTTP download was not rejected")
          }
        },
      }),
      defineBenchmark({
        id: "http.timeout",
        tool: "http",
        description: "Stop a slow loopback request at its 10 ms deadline",
        run: async () => {
          try {
            await executePreparedHttpRequest(
              prepareHttpRequest(
                {
                  ...firstRequest,
                  url: `${base}/slow`,
                  options: { ...firstRequest.options, timeoutMs: 10 },
                },
                "timeout",
                1,
              ),
            )
            return "unexpected-success"
          } catch (error) {
            return error instanceof Error && "kind" in error ? error.kind : "unexpected-error"
          }
        },
        verify: (result) => {
          if (result !== "timeout") throw new Error(`HTTP timeout failed: ${result}`)
        },
      }),
      defineBenchmark({
        id: "http.cancel",
        tool: "http",
        description: "Cancel a pending loopback request",
        run: async () => {
          const controller = new AbortController()
          const pending = executePreparedHttpRequest(
            prepareHttpRequest({ ...firstRequest, url: `${base}/slow` }, "cancel", 1),
            controller.signal,
          )
          controller.abort()
          try {
            await pending
            return "unexpected-success"
          } catch (error) {
            return error instanceof Error && "kind" in error ? error.kind : "unexpected-error"
          }
        },
        verify: (result) => {
          if (result !== "cancelled") throw new Error(`HTTP cancellation failed: ${result}`)
        },
      }),
      defineBenchmark({
        id: "http.redirect",
        tool: "http",
        description: "Loopback redirect through response capture",
        run: () => executePreparedHttpRequest(prepared(2)),
        verify: (result) => {
          if (result.status !== 200 || result.redirects.length !== 1) {
            throw new Error("Redirect not followed")
          }
        },
      }),
      defineBenchmark({
        id: "http.cross_origin_redirect",
        tool: "http",
        description: "Approve a loopback origin change and strip source credentials",
        run: async () => {
          let approvals = 0
          const postRequest = requests[1]
          if (!postRequest) throw new Error("Missing POST fixture request")
          const request = prepareHttpRequest(
            {
              ...postRequest,
              url: `${base}/cross-redirect`,
              headers: [
                {
                  id: "auth",
                  enabled: true,
                  name: "Authorization",
                  value: "fixture-secret",
                  sensitivity: "literal-secret" as const,
                },
                {
                  id: "cookie",
                  enabled: true,
                  name: "Cookie",
                  value: "sid=fixture-secret",
                  sensitivity: "literal-secret" as const,
                },
                {
                  id: "trace",
                  enabled: true,
                  name: "X-Trace",
                  value: "benchmark",
                  sensitivity: "normal" as const,
                },
              ],
            },
            "cross-origin",
            1,
          )
          const response = await executePreparedHttpRequest(
            request,
            undefined,
            undefined,
            undefined,
            false,
            () => {
              approvals += 1
              return true
            },
          )
          return { response, approvals }
        },
        verify: ({ response, approvals }) => {
          const body = JSON.parse(new TextDecoder().decode(response.body))
          if (
            response.status !== 200 ||
            response.redirects.length !== 1 ||
            !response.redirects[0]?.crossOrigin ||
            approvals !== 1 ||
            body.authorization !== null ||
            body.cookie !== null ||
            body.trace !== "benchmark"
          ) {
            throw new Error("Cross-origin redirect approval or credential stripping failed")
          }
        },
      }),
      defineBenchmark({
        id: "http.collection_run",
        tool: "http",
        description: "Run one saved request with assertions pipeline",
        run: () =>
          runHttpCollectionCase({
            name: "benchmark",
            items: [{ filePath: "requests.http", request: firstRequest }],
            selector: firstRequest.id,
            variables: new Map(),
            root: project,
          }),
        verify: (result) => {
          const response = result.items[0]?.response
          if (response?.status !== 200 || !response.assertions?.every((item) => item.passed)) {
            throw new Error("Collection run failed")
          }
        },
      }),
      defineBenchmark({
        id: "http.collection_chain",
        tool: "http",
        description: "Run three out-of-order dependencies with extraction and a redacted report",
        run: async () => {
          const result = await runHttpCollectionCase({
            name: "benchmark-chain",
            items: chainItems,
            selector: chainTarget.request.id,
            variables: new Map(),
            root: project,
          })
          return { result, report: formatHttpRunReport([result], "json") }
        },
        verify: ({ result, report }) => {
          if (
            result.items.map((item) => item.requestName.toLowerCase()).join(",") !==
              "login,user,lookup" ||
            result.items.some(
              (item) =>
                item.response?.status !== 200 ||
                !item.response.assertions?.every((assertion) => assertion.passed),
            ) ||
            report.includes("benchmark-private-token")
          ) {
            throw new Error("HTTP dependency chain or redacted report failed")
          }
        },
      }),
      defineBenchmark({
        id: "http.collection_dataset",
        tool: "http",
        description: "Load ten dataset rows and run loopback requests with four workers",
        run: async () => {
          const dataset = await loadHttpProjectRunnerDataset(project, "benchmark-dataset.json")
          return runHttpDataset(dataset, 4, (item) =>
            runHttpCollectionCase({
              name: item.name,
              items: [{ filePath: "dataset.http", request: datasetRequest }],
              variables: createHttpVariableContext([{ origin: "public", values: item.values }]),
              root: project,
            }),
          )
        },
        verify: (result) => {
          if (
            result.length !== 10 ||
            result.some((item, index) => {
              const response = item.items[0]?.response
              return (
                response?.status !== 200 ||
                !response.url.endsWith(`/dataset/${index + 1}`) ||
                !response.assertions?.every((assertion) => assertion.passed)
              )
            })
          ) {
            throw new Error("HTTP dataset run was incomplete or out of order")
          }
        },
      }),
      defineBenchmark({
        id: "http.collection_dataset_chain",
        tool: "http",
        description: "Run ten three-request dependency chains with four dataset workers",
        run: async () => {
          const dataset = await loadHttpProjectRunnerDataset(project, "benchmark-dataset.json")
          return runHttpDataset(dataset, 4, (item) =>
            runHttpCollectionCase({
              name: item.name,
              items: datasetChainItems,
              selector: datasetChainTarget.request.id,
              variables: createHttpVariableContext([{ origin: "public", values: item.values }]),
              root: project,
            }),
          )
        },
        verify: (result) => {
          if (
            result.length !== 10 ||
            result.some(
              (item, index) =>
                item.items.length !== 3 ||
                item.items.some(
                  (step) =>
                    step.response?.status !== 200 ||
                    !step.response.url.includes(`id=${index + 1}`) ||
                    !step.response.assertions?.every((assertion) => assertion.passed),
                ),
            )
          ) {
            throw new Error("HTTP dataset dependency chains were incomplete")
          }
        },
      }),
      defineBenchmark({
        id: "http.response_json",
        tool: "http",
        description: "Fold and search a 250-item JSON response",
        run: () => ({
          folded: foldHttpJson(largeJson, 2),
          matches: findHttpTextMatches(largeJson, "Item 249"),
        }),
        verify: (result) => {
          if (!result.folded || !result.matches.length) throw new Error("Response inspector failed")
        },
      }),
      defineBenchmark({
        id: "http.response_diff",
        tool: "http",
        description: "Diff two 200-line HTTP responses",
        run: () => diffHttpText(beforeText, afterText),
        verify: (result) => {
          if (!result.some((line) => line.kind === "add")) throw new Error("Response diff failed")
        },
      }),
      defineBenchmark({
        id: "http.cookies",
        tool: "http",
        description: "Store and attach a scoped cookie",
        run: () => {
          const jar = new HttpCookieJar()
          jar.store(`${base}/small`, cookieHeaders)
          return jar.header(`${base}/small`)
        },
        verify: (result) => {
          if (result !== "session=abc") throw new Error("Cookie jar failed")
        },
      }),
      defineBenchmark({
        id: "http.history_budget",
        tool: "http",
        description: "Apply count and body budgets to 100 response history entries",
        run: () => budgetHttpHistory(historyEntries),
        verify: (result) => {
          if (result.length !== 30 || result.filter((entry) => entry.bodyDiscarded).length !== 10) {
            throw new Error("HTTP history budget failed")
          }
        },
      }),
      defineBenchmark({
        id: "http.history_roundtrip",
        tool: "http",
        description: "Persist and reload a captured HTTP response",
        run: async () => {
          await persistHttpHistoryEntry(project, historyConfig, persistedHistoryEntry)
          return loadHttpHistory(project, historyConfig)
        },
        verify: (result) => {
          if (result.length !== 1 || !result[0]?.persisted) {
            throw new Error("HTTP response history was not restored")
          }
        },
      }),
      defineBenchmark({
        id: "http.import_preview",
        tool: "http",
        description: "Preview a 100-request Postman collection import",
        run: () => previewHttpCollectionImport(project, importPath),
        verify: (result) => {
          if (result.report.requests.length !== 100)
            throw new Error("Postman import preview failed")
        },
      }),
      defineBenchmark({
        id: "http.openapi_preview",
        tool: "http",
        description: "Preview a 100-operation OpenAPI 3.0 import",
        run: () => previewHttpCollectionImport(project, openApiPath),
        verify: (result) => {
          if (result.report.requests.length !== 100) {
            throw new Error("OpenAPI import preview failed")
          }
        },
      }),
      defineBenchmark({
        id: "http.import_apply",
        tool: "http",
        description: "Validate and write a 100-request Postman collection import",
        run: async () =>
          applyHttpCollectionImport(
            project,
            await previewHttpCollectionImport(project, importPath),
          ),
        verify: (result) => {
          if (result.report.requests.length !== 100 || !result.outputPath.endsWith(".http")) {
            throw new Error("Postman collection import failed")
          }
        },
      }),
      defineBenchmark({
        id: "http.openapi_apply",
        tool: "http",
        description: "Validate and write a 100-operation OpenAPI import",
        run: async () =>
          applyHttpCollectionImport(
            project,
            await previewHttpCollectionImport(project, openApiPath),
          ),
        verify: (result) => {
          if (result.report.requests.length !== 100 || !result.outputPath.endsWith(".http")) {
            throw new Error("OpenAPI import failed")
          }
        },
      }),
    ]
    return { cases, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}
