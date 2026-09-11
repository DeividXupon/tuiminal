import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createServer, type Server } from "node:http"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import type { AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { parseHttpFile, requestFromHttpFile } from "../src/features/http/model/http-file"
import { environmentVariableContext } from "../src/features/http/storage/environments"
import {
  loadHttpRunnerDataset,
  loadHttpProjectRunnerDataset,
  redactHttpRunDiagnostic,
  redactHttpRunUrl,
  runHttpCollectionCase,
  runHttpDataset,
} from "../src/features/http/services/collection-runner"
import { formatHttpRunReport, httpRunExitCode } from "../src/features/http/cli/report"

let server: Server
let baseUrl = ""
let root = ""

beforeAll(async () => {
  root = await mkdtemp(resolve(tmpdir(), "tuiminal-http-runner-"))
  server = createServer((request, response) => {
    if (request.url === "/cookie/source") {
      response.writeHead(200, {
        "content-type": "application/json",
        "set-cookie": "scoped=source; Path=/",
      })
      response.end('{"stored":true}')
      return
    }
    if (request.url === "/cookie/target") {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ cookie: request.headers.cookie ?? null }))
      return
    }
    if (request.url === "/login") {
      response.writeHead(200, { "content-type": "application/json" })
      response.end('{"token":"very-secret"}')
      return
    }
    const authorized = request.headers.authorization === "Bearer very-secret"
    response.writeHead(authorized ? 200 : 401, { "content-type": "application/json" })
    response.end(JSON.stringify({ authorized }))
  })
  server.listen(0, "127.0.0.1")
  await new Promise<void>((done) => server.once("listening", done))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  if (server.listening) {
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    )
  }
  server.closeAllConnections()
  await rm(root, { recursive: true })
})

function collection() {
  const source = `### Login
# @name login
# @extract-secret token = $.token
# @assert status == 200
GET ${baseUrl}/login

### User
# @name user
# @depends login
# @assert status == 200
# @assert jsonpath $.authorized == true
GET ${baseUrl}/user
Authorization: Bearer {{token}}
`
  const file = parseHttpFile(source, "api.http")
  return file.requests.map((block) => ({
    filePath: "api.http",
    request: requestFromHttpFile(file, block),
  }))
}

function scopedCookieCollection() {
  const sourceFile = parseHttpFile(
    `### Source\n# @name source\nGET ${baseUrl}/cookie/source\n`,
    "services/a/source.http",
  )
  const targetFile = parseHttpFile(
    `### Target\n# @name target\n# @depends source\nGET ${baseUrl}/cookie/target\n`,
    "services/b/target.http",
  )
  return [sourceFile, targetFile].flatMap((file) =>
    file.requests.map((block) => ({
      filePath: file.path,
      request: requestFromHttpFile(file, block),
    })),
  )
}

describe("HTTP headless collection runner", () => {
  test("runs dependencies, keeps extracted secrets in memory and evaluates assertions", async () => {
    const items = collection()
    const result = await runHttpCollectionCase({
      name: "default",
      items,
      selector: items[1]!.request.id,
      variables: environmentVariableContext(undefined),
      root,
    })
    expect(result.items).toHaveLength(2)
    expect(result.items[1]?.response?.status).toBe(200)
    expect(result.items[1]?.response?.assertions?.every((assertion) => assertion.passed)).toBe(true)
    const report = formatHttpRunReport([result], "json")
    expect(report).not.toContain("very-secret")
    expect(httpRunExitCode([result])).toBe(0)
  })

  test("does not share collection cookies between sibling request scopes", async () => {
    const items = scopedCookieCollection()
    const result = await runHttpCollectionCase({
      name: "scoped-cookies",
      items,
      selector: "target",
      variables: environmentVariableContext(undefined),
      root,
      environmentName: "local",
    })

    expect(result.items).toHaveLength(2)
    const targetBody = new TextDecoder().decode(result.items[1]?.response?.body)
    expect(JSON.parse(targetBody)).toEqual({ cookie: null })
  })

  test("redacts private values even when URL fields have harmless names", () => {
    const variables = environmentVariableContext({
      name: "private",
      production: false,
      values: { credential: "a secret/value" },
      privateNames: new Set(["credential"]),
      directory: "",
    })
    const redacted = redactHttpRunUrl(
      "https://example.test/a%20secret%2Fvalue?code=a+secret%2Fvalue",
      variables,
    )
    expect(redacted).not.toContain("secret")
    expect(decodeURIComponent(redacted)).toContain("<redacted>")
    expect(redactHttpRunDiagnostic("failed a secret/value", variables)).toBe("failed <redacted>")
  })

  test("uses a stable assertion exit code and emits JUnit failures", async () => {
    const items = collection()
    items[0]!.request.assertions = [{ id: "fail", expression: "status == 201" }]
    const result = await runHttpCollectionCase({
      name: "failure",
      items,
      selector: "login",
      variables: environmentVariableContext(undefined),
      root,
    })
    expect(httpRunExitCode([result])).toBe(4)
    expect(formatHttpRunReport([result], "junit")).toContain("<failure")
  })

  test("topologically orders a full collection before applying extracted values", async () => {
    const result = await runHttpCollectionCase({
      name: "reversed",
      items: collection().reverse(),
      variables: environmentVariableContext(undefined),
      root,
    })
    expect(result.items.map((item) => item.requestName)).toEqual(["Login", "User"])
    expect(result.items[1]?.response?.status).toBe(200)
  })

  test("loads JSON/CSV datasets and preserves result order with bounded concurrency", async () => {
    const jsonPath = resolve(root, "data.json")
    const csvPath = resolve(root, "data.csv")
    await writeFile(jsonPath, '[{"id":1},{"id":2}]')
    await writeFile(csvPath, 'id,name\n1,"Ada, Lovelace"\n')
    expect((await loadHttpRunnerDataset(jsonPath)).map((item) => item.values.id)).toEqual([
      "1",
      "2",
    ])
    expect((await loadHttpRunnerDataset(csvPath))[0]?.values.name).toBe("Ada, Lovelace")
    const ordered = await runHttpDataset([30, 1, 10], 2, async (delay, index) => {
      await Bun.sleep(delay)
      return { name: String(index), items: [] }
    })
    expect(ordered.map((item) => item.name)).toEqual(["0", "1", "2"])
  })

  test("stops scheduling dataset cases after cancellation and sandboxes TUI datasets", async () => {
    const controller = new AbortController()
    const started: number[] = []
    const results = await runHttpDataset(
      [1, 2, 3],
      1,
      async (_value, index) => {
        started.push(index)
        controller.abort()
        return { name: String(index), items: [] }
      },
      controller.signal,
    )
    expect(started).toEqual([0])
    expect(results).toHaveLength(1)

    const dataset = resolve(root, "safe-data.json")
    await writeFile(dataset, '[{"id":9}]')
    expect((await loadHttpProjectRunnerDataset(root, "safe-data.json"))[0]?.values.id).toBe("9")
    const outside = await mkdtemp(resolve(tmpdir(), "tuiminal-http-runner-outside-"))
    try {
      const outsideDataset = resolve(outside, "outside.json")
      await writeFile(outsideDataset, "[]")
      await expect(loadHttpProjectRunnerDataset(root, outsideDataset)).rejects.toThrow(
        "dentro do projeto",
      )
    } finally {
      await rm(outside, { recursive: true })
    }
  })

  test("executes the public CLI with a machine-readable report", async () => {
    const file = resolve(root, "api.http")
    const source = `### Ping\n# @name ping\n# @assert status == 200\nGET ${baseUrl}/login\n`
    await writeFile(file, source)
    const process = Bun.spawn(
      [
        "bun",
        resolve(import.meta.dir, "../bin/tuiminal.ts"),
        "http",
        "run",
        "api.http#ping",
        "--report",
        "json",
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    )
    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      new Response(process.stdout).text(),
      new Response(process.stderr).text(),
    ])
    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
    expect(JSON.parse(stdout).cases[0].requests[0].status).toBe(200)
  })

  test("requires an explicit CLI opt-in for insecure TLS requests", async () => {
    const file = resolve(root, "insecure.http")
    await writeFile(
      file,
      "### Insecure\n# @name insecure\n# @insecure-tls\nGET https://127.0.0.1:1/probe\n",
    )
    const run = async (allow: boolean) => {
      const process = Bun.spawn(
        [
          "bun",
          resolve(import.meta.dir, "../bin/tuiminal.ts"),
          "http",
          "run",
          "insecure.http#insecure",
          "--report",
          "json",
          ...(allow ? ["--allow-insecure-tls"] : []),
        ],
        { cwd: root, stdout: "pipe", stderr: "pipe" },
      )
      const [exitCode, stdout, stderr] = await Promise.all([
        process.exited,
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
      ])
      return { exitCode, report: JSON.parse(stdout), stderr }
    }

    const blocked = await run(false)
    expect(blocked.exitCode).toBe(3)
    expect(blocked.stderr).toBe("")
    expect(blocked.report.cases[0].requests[0].error).toMatchObject({ kind: "tls" })
    expect(blocked.report.cases[0].requests[0].error.message).toContain("confirmação")

    const allowed = await run(true)
    expect(allowed.exitCode).toBe(3)
    expect(allowed.stderr).toBe("")
    expect(allowed.report.cases[0].requests[0].error).toMatchObject({ kind: "network" })
    expect(allowed.report.cases[0].requests[0].error.message).not.toContain("confirmação")
  })
})
