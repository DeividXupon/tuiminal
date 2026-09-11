import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { formatHttpRunReport } from "../src/features/http/cli/report"
import { exportPreparedRequestAsCurl } from "../src/features/http/exporting/curl"
import {
  parseHttpFile,
  requestFromHttpFile,
  serializeHttpRequestBlock,
} from "../src/features/http/model/http-file"
import { httpRequestSecretValues } from "../src/features/http/model/secrets"
import { createHttpVariableContext } from "../src/features/http/model/variables"
import { createScratchRequest } from "../src/features/http/model/workspace"
import { runHttpCollectionCase } from "../src/features/http/services/collection-runner"
import { prepareHttpRequest } from "../src/features/http/services/request-builder"
import { createHttpPreparedRequestPreview } from "../src/features/http/services/request-preview"
import { saveHttpRequest } from "../src/features/http/storage/collections"
import { inspectHttpExternalConflict } from "../src/features/http/storage/conflicts"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function temporaryProject() {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-http-path-secrets-"))
  roots.push(root)
  return root
}

function sensitiveRequest(secret: string, enabled = true) {
  const request = createScratchRequest("path-secret", "https://example.test/:id")
  request.method = "POST"
  request.body = { kind: "text", text: `value=${secret}`, form: [] }
  request.path = [{ id: "path", name: "id", value: secret, enabled, sensitivity: "literal-secret" }]
  return request
}

function expectRedacted(text: string, secret: string) {
  expect(text).not.toContain(secret)
  expect(text).not.toContain(encodeURIComponent(secret))
  expect(decodeURIComponent(text)).not.toContain(secret)
}

describe("HTTP sensitive path values", () => {
  test("redacts prepared URLs and shared raw values in preview and default cURL export", () => {
    const secret = "opaque/credential with spaces"
    const request = sensitiveRequest(secret)
    const original = structuredClone(request)
    const variables = createHttpVariableContext([])
    const prepared = prepareHttpRequest(request, "preview", 0, variables)
    expect(prepared.url).toContain(encodeURIComponent(secret))
    expect(prepared.body).toContain(secret)
    const preview = createHttpPreparedRequestPreview({
      sourceRequest: request,
      effectiveRequest: request,
      revision: 0,
      variables,
    })
    expect(preview.ok).toBe(true)
    expectRedacted(JSON.stringify(preview), secret)
    const secretValues = httpRequestSecretValues(request, variables)
    expect(secretValues).toContain(secret)
    expectRedacted(exportPreparedRequestAsCurl(prepared, { secretValues }), secret)
    expect(exportPreparedRequestAsCurl(prepared, { secretValues, revealSecrets: true })).toContain(
      secret,
    )
    expect(request).toEqual(original)
  })

  test("keeps disabled sensitive rows secret even though they are not sent as path parameters", () => {
    const secret = "disabled/credential"
    const request = sensitiveRequest(secret, false)
    const variables = createHttpVariableContext([])
    expect(prepareHttpRequest(request, "disabled", 0, variables).url).toBe(request.url)
    const preview = createHttpPreparedRequestPreview({
      sourceRequest: request,
      effectiveRequest: request,
      revision: 0,
      variables,
    })
    expect(preview.ok).toBe(true)
    expectRedacted(JSON.stringify(preview), secret)
    expect(request.path[0]).toMatchObject({ value: secret, enabled: false })
  })

  test.each([true, false])(
    "refuses public persistence of literal path secrets (enabled=%s)",
    async (enabled) => {
      const root = await temporaryProject()
      const request = sensitiveRequest("literal-path-credential", enabled)
      await expect(saveHttpRequest(root, request)).rejects.toThrow("variável do ambiente privado")
      expect(await readdir(root)).toEqual([])
      expect(request.path[0]).toMatchObject({ value: "literal-path-credential", enabled })
    },
  )

  test.each(["literal-secret", "secret-ref"] as const)(
    "preserves private variable references through saving and sending (%s)",
    async (sensitivity) => {
      const root = await temporaryProject()
      const secret = "private/reference value"
      const request = sensitiveRequest("{{credential}}")
      request.path[0]!.sensitivity = sensitivity
      const variables = createHttpVariableContext([
        { origin: "private", secret: true, values: { credential: secret } },
      ])
      const saved = await saveHttpRequest(root, request)
      expect(saved.path[0]).toMatchObject({ value: "{{credential}}", sensitivity })
      if (saved.source.kind !== "file") throw new Error("Expected saved request")
      const source = await readFile(resolve(root, saved.source.path), "utf8")
      expect(source).toContain("{{credential}}")
      expectRedacted(source, secret)
      const prepared = prepareHttpRequest(saved, "saved", 0, variables)
      expect(prepared.url).toContain(encodeURIComponent(secret))
      expectRedacted(
        exportPreparedRequestAsCurl(prepared, {
          secretValues: httpRequestSecretValues(saved, variables),
        }),
        secret,
      )
    },
  )

  test("keeps ordinary path values saveable and refuses secret updates without changing the file", async () => {
    const root = await temporaryProject()
    const request = sensitiveRequest("public-value")
    request.path[0]!.sensitivity = "normal"
    const saved = await saveHttpRequest(root, request)
    expect(saved.path[0]?.value).toBe("public-value")
    if (saved.source.kind !== "file") throw new Error("Expected saved request")
    const path = resolve(root, saved.source.path)
    const before = await readFile(path, "utf8")
    saved.path[0]!.value = "new-secret-value"
    saved.path[0]!.sensitivity = "literal-secret"
    await expect(saveHttpRequest(root, saved)).rejects.toThrow("variável do ambiente privado")
    expect(await readFile(path, "utf8")).toBe(before)
  })

  test("redacts both sides of a conflict, including repeated raw and encoded URL secrets", async () => {
    const root = await temporaryProject()
    const secret = "conflict/credential"
    const request = sensitiveRequest(secret)
    request.url = `https://example.test/${encodeURIComponent(secret)}?trace=${encodeURIComponent(secret)}`
    const source = serializeHttpRequestBlock(request)
    const file = parseHttpFile(source, "api.http")
    const local = requestFromHttpFile(file, file.requests[0]!)
    local.body.text = `local=${secret}`
    await writeFile(resolve(root, "api.http"), source.replace("value=", "external="))
    const preview = await inspectHttpExternalConflict(root, local)
    expect(preview.canUseExternal).toBe(true)
    expectRedacted(JSON.stringify(preview), secret)
    expect(local.path[0]?.value).toBe(secret)
  })

  test("redacts collection report URLs while sending the actual path value", async () => {
    const root = await temporaryProject()
    const secret = "runner/credential with spaces"
    let receivedUrl = ""
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        receivedUrl = request.url
        return Response.json({ path: decodeURIComponent(new URL(request.url).pathname.slice(1)) })
      },
    })
    try {
      const request = sensitiveRequest(secret)
      request.url = new URL("/:id", server.url).href
      request.assertions = [
        { id: "matching", expression: `jsonpath $.path == ${secret}` },
        { id: "different", expression: `jsonpath $.path == ${secret}-expected` },
      ]
      const result = await runHttpCollectionCase({
        name: "secret-path",
        items: [{ filePath: "", request }],
        root,
        variables: createHttpVariableContext([]),
      })
      expect(result.items[0]?.response?.status).toBe(200)
      expect(result.items[0]?.response?.assertions?.map((assertion) => assertion.passed)).toEqual([
        true,
        false,
      ])
      expect(receivedUrl).toContain(encodeURIComponent(secret))
      expectRedacted(result.items[0]!.url, secret)
      for (const kind of ["text", "json", "junit"] as const) {
        expectRedacted(formatHttpRunReport([result], kind), secret)
      }
    } finally {
      await server.stop(true)
    }
  })

  test.each([false, true])(
    "redacts failed report URLs and diagnostics (encoded=%s)",
    async (encoded) => {
      const root = await temporaryProject()
      const secret = "failed/credential"
      const request = sensitiveRequest(secret)
      const value = encoded ? encodeURIComponent(secret) : secret
      request.url = `https://example.test/${value}`
      request.body = { kind: "file", filePath: value, text: "", form: [] }
      const result = await runHttpCollectionCase({
        name: "failure",
        items: [{ filePath: "", request }],
        root,
        variables: createHttpVariableContext([]),
      })
      expect(result.items[0]?.error?.kind).toBe("body")
      for (const kind of ["text", "json", "junit"] as const) {
        expectRedacted(formatHttpRunReport([result], kind), secret)
      }
    },
  )
})
