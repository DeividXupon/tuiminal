import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { exportPreparedRequestAsCurl } from "../src/features/http/exporting/curl"
import { importCurl, tokenizeCurl } from "../src/features/http/importing/curl"
import {
  parseHttpFile,
  replaceHttpRequestBlock,
  requestFromHttpFile,
  serializeHttpRequestBlock,
} from "../src/features/http/model/http-file"
import {
  createHttpVariableContext,
  httpVariableSuggestions,
  redactHttpTemplate,
  resolveHttpTemplate,
} from "../src/features/http/model/variables"
import { httpRequestSecretValues } from "../src/features/http/model/secrets"
import { prepareHttpRequest } from "../src/features/http/services/request-builder"
import { createScratchRequest } from "../src/features/http/model/workspace"
import {
  applyHttpWorkspaceConfig,
  loadHttpWorkspaceConfigSnapshot,
  parseHttpWorkspaceConfig,
  saveHttpWorkspaceConfig,
} from "../src/features/http/storage/config"
import {
  deleteHttpRequest,
  duplicateHttpRequest,
  HttpExternalChangeError,
  moveHttpRequest,
  saveHttpRequest,
  scanHttpProject,
  watchHttpProject,
} from "../src/features/http/storage/collections"
import {
  inspectHttpExternalConflict,
  resolveHttpExternalConflict,
} from "../src/features/http/storage/conflicts"
import {
  createPrivateHttpEnvironment,
  environmentVariableContext,
  httpEnvironmentScopeDirectory,
  httpEnvironmentsForRequest,
  HTTP_SECRET_SERVICE,
  HttpEnvironmentConflictError,
  type HttpCredentialStore,
  loadHttpEnvironmentCatalog,
  loadHttpEnvironments,
} from "../src/features/http/storage/environments"
import { saveCapturedHttpResponse } from "../src/features/http/storage/responses"

const temporaryDirectories: string[] = []
const httpFixtureRoot = resolve(import.meta.dir, "fixtures/http")

function readHttpFixture(name: string) {
  return readFile(resolve(httpFixtureRoot, name), "utf8")
}

async function temporaryProject() {
  const directory = await mkdtemp(resolve(tmpdir(), "tuiminal-http-"))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  )
})

describe(".http project model", () => {
  const source = `@baseUrl = https://example.test\r\n\r\n### List users\r\n# @name list-users\r\nGET {{baseUrl}}/users\r\nAccept: application/json\r\n\r\n### Create user\r\n# @name create-user\r\nPOST {{baseUrl}}/users\r\nContent-Type: application/json\r\n\r\n{"name":"Ada"}\r\n`

  test("parses variables and multiple named requests", () => {
    const file = parseHttpFile(source, "api/users.http")
    expect(file.variables).toEqual({ baseUrl: "https://example.test" })
    expect(file.requests.map((request) => [request.name, request.method])).toEqual([
      ["List users", "GET"],
      ["Create user", "POST"],
    ])
    const request = requestFromHttpFile(file, file.requests[1]!)
    expect(request.body).toMatchObject({ kind: "json", text: '{"name":"Ada"}' })
    expect(request.source).toMatchObject({ kind: "file", path: "api/users.http" })
  })

  test("replaces one block without touching bytes outside it", () => {
    const file = parseHttpFile(source, "api/users.http")
    const block = file.requests[1]!
    const request = requestFromHttpFile(file, block)
    request.url = "{{baseUrl}}/people"
    const changed = replaceHttpRequestBlock(file, block, request)
    expect(changed.slice(0, block.start)).toBe(source.slice(0, block.start))
    expect(changed).toContain("POST {{baseUrl}}/people\r\n")
    expect(changed).toContain("### List users\r\n")
  })

  test("round-trips structured auth, execution options and no-log directives", () => {
    const directiveSource = `### Private\n# @name private\n# @auth {"kind":"bearer","token":"{{token}}"}\n# @timeout 5000 ms\n# @no-redirect\n# @no-log\n# @no-cookie-jar\n# @proxy {{proxyUrl}}\n# @insecure-tls\nGET https://example.test\n`
    const file = parseHttpFile(directiveSource, "private.http")
    const request = requestFromHttpFile(file, file.requests[0]!)
    expect(request.auth).toEqual({ kind: "bearer", token: "{{token}}" })
    expect(request.options).toEqual({
      timeoutMs: 5_000,
      followRedirects: false,
      timeoutExplicit: true,
      followRedirectsExplicit: true,
      cookieJar: false,
      proxy: "{{proxyUrl}}",
      tlsVerification: "insecure",
      noLog: true,
    })
    expect(replaceHttpRequestBlock(file, file.requests[0]!, request)).toBe(directiveSource)
  })

  test("lets explicit request options win over workspace defaults and round-trips follow", () => {
    const source = `### Explicit\n# @name explicit\n# @timeout 30000 ms\n# @follow-redirects\nGET https://example.test\n`
    const file = parseHttpFile(source, "explicit.http")
    const request = requestFromHttpFile(file, file.requests[0]!)
    const config = {
      version: 1 as const,
      headers: {},
      options: { timeoutMs: 5_000, followRedirects: false },
      history: { persistMetadata: false, persistBodies: false },
    }
    expect(applyHttpWorkspaceConfig(request, config).options).toMatchObject({
      timeoutMs: 30_000,
      followRedirects: true,
    })
    expect(replaceHttpRequestBlock(file, file.requests[0]!, request)).toBe(source)

    const inherited = createScratchRequest("inherited", "https://example.test")
    expect(applyHttpWorkspaceConfig(inherited, config).options).toMatchObject({
      timeoutMs: 5_000,
      followRedirects: false,
    })
  })

  test("parses JetBrains names, comments, timeout units, short GET, and multiline URLs", () => {
    const compatible = parseHttpFile(
      `###\n# @name = wrapped\n// @timeout 2 s\n// @no-redirect\nGET https://example.test\n  /api/users\n  ?page=1\n  &tag=a\n// keep this comment\nAccept: application/json\n\n###\n# @name = short\nhttps://example.test/ping\n`,
      "compatible.http",
    )
    expect(compatible.requests).toHaveLength(2)
    const wrapped = requestFromHttpFile(compatible, compatible.requests[0]!)
    expect(wrapped.name).toBe("wrapped")
    expect(wrapped.url).toBe("https://example.test/api/users")
    expect(wrapped.query.map(({ name, value }) => [name, value])).toEqual([
      ["page", "1"],
      ["tag", "a"],
    ])
    expect(wrapped.options).toMatchObject({
      timeoutMs: 2_000,
      timeoutExplicit: true,
      followRedirects: false,
      followRedirectsExplicit: true,
    })
    expect(compatible.requests[0]?.editable).toBe(true)
    expect(compatible.requests[1]).toMatchObject({
      name: "short",
      method: "GET",
      url: "https://example.test/ping",
      editable: true,
    })
  })

  test("covers the editable JetBrains fixture matrix without touching sibling bytes", async () => {
    const source = await readHttpFixture("jetbrains-compatible.http")
    const file = parseHttpFile(source, "jetbrains-compatible.http")
    expect(file.requests).toHaveLength(4)
    expect(file.requests.every((block) => block.editable)).toBe(true)

    const requests = file.requests.map((block) => requestFromHttpFile(file, block))
    expect(requests.map(({ method, name }) => [method, name])).toEqual([
      ["GET", "List users"],
      ["GET", "Health check"],
      ["PROPFIND", "WebDAV metadata"],
      ["GET", "Stateless request"],
    ])
    expect(requests[0]?.url).toBe("{{baseUrl}}/{{api-version}}/users")
    expect(requests[0]?.query.map(({ name, value }) => [name, value])).toEqual([
      ["page", "1"],
      ["tag", "terminal"],
    ])
    expect(requests[0]?.options).toMatchObject({ timeoutMs: 2_000, noLog: true })
    expect(requests[3]?.options.cookieJar).toBe(false)
    expect(requests[3]?.options.proxy).toBe("{{proxyUrl}}")
    expect(requests[3]?.options.tlsVerification).toBe("insecure")

    for (const [index, block] of file.requests.entries()) {
      const request = requests[index]!
      request.url = `${request.url}/edited`
      const replacement = serializeHttpRequestBlock(request)
      expect(replaceHttpRequestBlock(file, block, request)).toBe(
        `${source.slice(0, block.start)}${replacement}${source.slice(block.end)}`,
      )
    }
  })

  test("covers JetBrains request body fixtures", async () => {
    const source = await readHttpFixture("jetbrains-bodies.http")
    const file = parseHttpFile(source, "jetbrains-bodies.http")
    expect(file.requests).toHaveLength(4)
    expect(file.requests.every((block) => block.editable)).toBe(true)
    const requests = file.requests.map((block) => requestFromHttpFile(file, block))
    expect(requests.map((request) => request.body.kind)).toEqual([
      "json",
      "form",
      "file",
      "multipart",
    ])
    expect(requests[1]?.body.form.map(({ name, value }) => [name, value])).toEqual([
      ["field1", "value+value"],
      ["field2", "value&value"],
    ])
    expect(requests[2]?.body.filePath).toBe("./payload.json")
    expect(
      requests[3]?.body.multipart?.map(({ name, value, kind }) => [name, value, kind]),
    ).toEqual([
      ["caption", "terminal workspace", "text"],
      ["upload", "./payload.txt", "file"],
    ])
  })

  test("keeps documented but unsupported JetBrains syntax opaque with exact raw text", async () => {
    for (const fixture of [
      "jetbrains-opaque-directives.http",
      "jetbrains-opaque-scripts.http",
      "jetbrains-opaque-protocols.rest",
    ]) {
      const source = await readHttpFixture(fixture)
      const file = parseHttpFile(source, fixture)
      expect(file.requests.length).toBeGreaterThanOrEqual(3)
      for (const block of file.requests) {
        expect(block.editable).toBe(false)
        expect(block.rawText).toBe(source.slice(block.start, block.end))
        const request = requestFromHttpFile(file, block)
        expect(request.source).toMatchObject({
          kind: "file",
          supported: false,
          rawText: block.rawText,
        })
        expect(() => prepareHttpRequest(request, "opaque-fixture", 0)).toThrow(
          "ainda não executa com segurança",
        )
      }
    }
  })

  test("interprets bare timeouts as seconds and protects opaque JetBrains features", async () => {
    const timeout = parseHttpFile(
      `### Timeout\n# @timeout 0.5\nGET https://example.test\n`,
      "timeout.http",
    )
    expect(timeout.requests[0]?.options.timeoutMs).toBe(500)

    const root = await temporaryProject()
    const path = resolve(root, "scripted.http")
    const scripted = `### Scripted\n# @name scripted\n# @connection-timeout 2 s\nGET https://example.test\n\n> {% client.log(response.status); %}\n`
    await writeFile(path, scripted)
    const file = parseHttpFile(scripted, "scripted.http")
    expect(file.requests[0]?.editable).toBe(false)
    const request = requestFromHttpFile(file, file.requests[0]!)
    expect(request.source).toMatchObject({ rawText: scripted })
    expect(() => prepareHttpRequest(request, "opaque", 0)).toThrow(
      "ainda não executa com segurança",
    )
    await expect(saveHttpRequest(root, request)).rejects.toThrow(
      "bloco HTTP não pode ser editado com segurança",
    )
    await expect(duplicateHttpRequest(root, request)).rejects.toThrow(
      "bloco HTTP não pode ser editado com segurança",
    )
    await expect(moveHttpRequest(root, request, "moved.http")).rejects.toThrow(
      "bloco HTTP não pode ser editado com segurança",
    )
    expect(await readFile(path, "utf8")).toBe(scripted)
  })

  test("round-trips structured query, path and generated multipart bodies", () => {
    const request = createScratchRequest("multipart", "https://example.test/users/{id}")
    request.method = "POST"
    request.query = [
      { id: "tag", enabled: true, name: "tag", value: "a b", sensitivity: "normal" },
      { id: "off", enabled: false, name: "hidden", value: "x", sensitivity: "normal" },
    ]
    request.path = [{ id: "id", enabled: true, name: "id", value: "42", sensitivity: "normal" }]
    request.body = {
      kind: "multipart",
      text: "",
      form: [],
      multipart: [
        {
          id: "caption",
          enabled: true,
          name: "caption",
          value: "hello",
          kind: "text",
          sensitivity: "normal",
        },
        {
          id: "file",
          enabled: true,
          name: "upload",
          value: "asset.png",
          kind: "file",
          sensitivity: "normal",
        },
      ],
    }
    const serialized = replaceHttpRequestBlock(
      parseHttpFile("GET placeholder.test\n", "multipart.http"),
      parseHttpFile("GET placeholder.test\n", "multipart.http").requests[0]!,
      request,
    )
    const parsed = parseHttpFile(serialized, "multipart.http")
    const restored = requestFromHttpFile(parsed, parsed.requests[0]!)
    expect(restored.url).toBe("https://example.test/users/{id}")
    expect(restored.query.map(({ enabled, name, value }) => [enabled, name, value])).toEqual([
      [true, "tag", "a b"],
      [false, "hidden", "x"],
    ])
    expect(restored.path[0]).toMatchObject({ name: "id", value: "42" })
    expect(restored.body).toMatchObject({
      kind: "multipart",
      multipart: [
        expect.objectContaining({ name: "caption", value: "hello", kind: "text" }),
        expect.objectContaining({ name: "upload", value: "asset.png", kind: "file" }),
      ],
    })
  })

  test("discovers project requests and ignores heavy trees and symlinks", async () => {
    const root = await temporaryProject()
    await mkdir(resolve(root, "api"), { recursive: true })
    await mkdir(resolve(root, "node_modules/pkg"), { recursive: true })
    await writeFile(resolve(root, "api/users.http"), source)
    await writeFile(resolve(root, "node_modules/pkg/ignored.http"), "GET ignored.test")
    await symlink(resolve(root, "api/users.http"), resolve(root, "linked.http"))

    const collection = await scanHttpProject(root)
    expect(collection.files.map((file) => file.path)).toEqual(["api/users.http"])
    expect(collection.files[0]?.requests).toHaveLength(2)
  })

  test("starts watching project directories created after initialization", async () => {
    const root = await temporaryProject()
    let changes = 0
    const stop = await watchHttpProject(root, () => {
      changes += 1
    })
    try {
      await mkdir(resolve(root, "new/api"), { recursive: true })
      for (let attempt = 0; attempt < 30 && changes === 0; attempt += 1) {
        await Bun.sleep(20)
      }
      expect(changes).toBeGreaterThan(0)
      await Bun.sleep(120)
      const beforeNestedWrite = changes
      await writeFile(resolve(root, "new/api/users.http"), "GET https://example.test/users\n")
      for (let attempt = 0; attempt < 30 && changes === beforeNestedWrite; attempt += 1) {
        await Bun.sleep(20)
      }
      expect(changes).toBeGreaterThan(beforeNestedWrite)
    } finally {
      stop()
    }
  })

  test("saves scratch atomically, duplicates it, and rejects external changes", async () => {
    const root = await temporaryProject()
    const scratch = importCurl("curl https://example.test/users", "scratch")
    scratch.name = "List users"
    const saved = await saveHttpRequest(root, scratch)
    expect(saved.source.kind).toBe("file")
    const duplicate = await duplicateHttpRequest(root, saved)
    expect(duplicate.name).toBe("List users copy")

    if (saved.source.kind !== "file") throw new Error("request was not saved")
    await writeFile(resolve(root, saved.source.path), "GET changed.test\n")
    await expect(saveHttpRequest(root, saved)).rejects.toBeInstanceOf(HttpExternalChangeError)
    expect(
      await readFile(
        resolve(root, duplicate.source.kind === "file" ? duplicate.source.path : ""),
        "utf8",
      ),
    ).toContain("List users copy")
  })

  test("previews and resolves external edits without overwriting sibling blocks", async () => {
    const root = await temporaryProject()
    const path = resolve(root, "api.http")
    const initial =
      "### One\n# @name one\nGET https://example.test/one\n\n### Two\n# @name two\nGET https://example.test/two\n"
    await writeFile(path, initial)
    const parsed = parseHttpFile(initial, "api.http")
    const local = requestFromHttpFile(parsed, parsed.requests[0]!)
    local.url = "https://example.test/local"
    await writeFile(
      path,
      initial
        .replace("https://example.test/one", "https://example.test/external")
        .replace("https://example.test/two", "https://example.test/two-external"),
    )

    const preview = await inspectHttpExternalConflict(root, local)
    expect(preview.canUseExternal).toBe(true)
    expect(
      preview.diff.some((line) => line.kind === "remove" && line.text.includes("external")),
    ).toBe(true)
    expect(preview.diff.some((line) => line.kind === "add" && line.text.includes("local"))).toBe(
      true,
    )

    const reloaded = await resolveHttpExternalConflict(root, local, "reload")
    expect(reloaded.url).toBe("https://example.test/external")
    const applied = await resolveHttpExternalConflict(root, local, "apply-local")
    expect(applied.url).toBe("https://example.test/local")
    expect(await readFile(path, "utf8")).toContain("https://example.test/two-external")

    const copy = await resolveHttpExternalConflict(root, local, "save-copy")
    expect(copy.source).toMatchObject({ kind: "file" })
    expect(copy.id).not.toBe(local.id)
    if (copy.source.kind !== "file") throw new Error("local copy was not saved")
    expect(await readFile(resolve(root, copy.source.path), "utf8")).toContain(
      "https://example.test/local",
    )
  })

  test("masks credentials and only permits a copy after an external removal", async () => {
    const root = await temporaryProject()
    const path = resolve(root, "secret.http")
    const initial =
      "### Secret\n# @name secret\nGET https://example.test/private\nAuthorization: Bearer opaque-credential\n\n### Keep\n# @name keep\nGET https://example.test/keep\n"
    await writeFile(path, initial)
    const parsed = parseHttpFile(initial, "secret.http")
    const local = requestFromHttpFile(parsed, parsed.requests[0]!)
    await writeFile(path, "### Keep\n# @name keep\nGET https://example.test/keep\n")

    const preview = await inspectHttpExternalConflict(root, local)
    expect(preview.canUseExternal).toBe(false)
    expect(preview.diff.map((line) => line.text).join("\n")).not.toContain("opaque-credential")
    await expect(resolveHttpExternalConflict(root, local, "reload")).rejects.toThrow(
      "removido externamente",
    )
  })

  test("refuses to persist literal credentials in project .http files", async () => {
    const root = await temporaryProject()
    const request = createScratchRequest("secret", "https://example.test")
    request.auth = { kind: "bearer", token: "literal-secret" }
    await expect(saveHttpRequest(root, request)).rejects.toThrow("variável do ambiente privado")
    request.auth = { kind: "bearer", token: "{{token}}" }
    request.options.proxy = "http://user:literal-password@proxy.example.test:8080"
    await expect(saveHttpRequest(root, request)).rejects.toThrow("variável do ambiente privado")
    request.options.proxy = "{{proxyUrl}}"
    const saved = await saveHttpRequest(root, request)
    expect(saved.auth).toEqual({ kind: "bearer", token: "{{token}}" })
    expect(saved.options.proxy).toBe("{{proxyUrl}}")
  })

  test("refuses to persist invalid assertions or extraction definitions", async () => {
    const root = await temporaryProject()
    const request = createScratchRequest("invalid-automation", "https://example.test")
    request.assertions = [{ id: "invalid", expression: "expect magic" }]
    await expect(saveHttpRequest(root, request)).rejects.toThrow("Assertion inválida")
    request.assertions = []
    request.chain = { extract: [{ name: "token", jsonPath: "$[", secret: true }] }
    await expect(saveHttpRequest(root, request)).rejects.toThrow("JSONPath inválido")
    request.chain = { extract: [] }
    request.method = "BAD METHOD"
    await expect(saveHttpRequest(root, request)).rejects.toThrow("método HTTP")
  })

  test("moves and deletes one request block without dropping its siblings", async () => {
    const root = await temporaryProject()
    await mkdir(resolve(root, "api"), { recursive: true })
    await writeFile(resolve(root, "api/users.http"), source)
    const scanned = await scanHttpProject(root)
    const firstFile = scanned.files[0]!
    const first = requestFromHttpFile(firstFile, firstFile.requests[0]!)
    const moved = await moveHttpRequest(root, first, "moved/users.http")
    expect(moved.source).toMatchObject({ kind: "file", path: "moved/users.http" })
    expect(await readFile(resolve(root, "api/users.http"), "utf8")).not.toContain("List users")
    expect(await readFile(resolve(root, "api/users.http"), "utf8")).toContain("Create user")
    expect(await readFile(resolve(root, "moved/users.http"), "utf8")).toContain("List users")

    await deleteHttpRequest(root, moved)
    expect(await Bun.file(resolve(root, "moved/users.http")).exists()).toBe(false)
  })
})

describe("HTTP variables and environments", () => {
  test("uses request/file/private/public/built-in precedence and detects cycles", () => {
    const context = createHttpVariableContext([
      { origin: "request", values: { id: "request" } },
      { origin: "file", values: { id: "file", path: "/users/{{id}}" } },
      { origin: "private", values: { token: "secret" }, secret: true },
      { origin: "public", values: { id: "public" } },
    ])
    expect(resolveHttpTemplate("{{path}}?id={{id}}", context)).toBe("/users/request?id=request")
    expect(redactHttpTemplate("Bearer {{token}}", context)).toBe("Bearer <token:mascarado>")
    expect(httpVariableSuggestions("{{to", context)).toEqual(["token"])
    expect(() => resolveHttpTemplate("{{missing}}", context)).toThrow("não foi definida")

    const cyclic = createHttpVariableContext([
      { origin: "file", values: { a: "{{b}}", b: "{{a}}" } },
    ])
    expect(() => resolveHttpTemplate("{{a}}", cyclic)).toThrow("referência circular")
  })

  test("merges JetBrains-compatible public and private environment files", async () => {
    const root = await temporaryProject()
    await writeFile(
      resolve(root, "http-client.env.json"),
      JSON.stringify({ dev: { baseUrl: "https://public.test", token: "public" } }),
    )
    await writeFile(
      resolve(root, "http-client.private.env.json"),
      JSON.stringify({ dev: { token: "private" } }),
    )
    const environments = await loadHttpEnvironments(root)
    expect(environments[0]?.values).toEqual({ baseUrl: "https://public.test", token: "private" })
    const context = environmentVariableContext(environments[0], { resource: "users" })
    expect(resolveHttpTemplate("{{baseUrl}}/{{resource}}", context)).toBe(
      "https://public.test/users",
    )
    expect(context.get("token")).toMatchObject({ secret: true, origin: "private" })
  })

  test("resolves each request environment from its directory toward the project root", async () => {
    const root = await temporaryProject()
    await mkdir(resolve(root, "services/api"), { recursive: true })
    await mkdir(resolve(root, "services/other"), { recursive: true })
    await writeFile(
      resolve(root, "http-client.env.json"),
      JSON.stringify({
        dev: { host: "root", parentOnly: "root-only" },
        staging: { host: "staging" },
      }),
    )
    await writeFile(
      resolve(root, "http-client.private.env.json"),
      JSON.stringify({ dev: { token: "root-secret" } }),
    )
    await writeFile(
      resolve(root, "services/api/http-client.env.json"),
      JSON.stringify({ dev: { host: "api" } }),
    )
    await writeFile(
      resolve(root, "services/api/http-client.private.env.json"),
      JSON.stringify({ dev: { token: "api-secret" } }),
    )
    await writeFile(
      resolve(root, "services/other/http-client.env.json"),
      JSON.stringify({ qa: { host: "other" } }),
    )

    const catalog = await loadHttpEnvironmentCatalog(root, [
      "services/api/requests.http",
      "services/other/requests.http",
    ])
    const apiEnvironments = httpEnvironmentsForRequest(catalog, "services/api/requests.http")
    const apiDev = apiEnvironments.find((environment) => environment.name === "dev")
    expect(apiEnvironments.map((environment) => environment.name)).toEqual(["dev", "staging"])
    expect(apiDev).toMatchObject({
      directory: "services/api",
      values: { host: "api", token: "api-secret" },
    })
    expect(apiDev?.values).not.toHaveProperty("parentOnly")
    expect(environmentVariableContext(apiDev).get("token")).toMatchObject({
      secret: true,
      origin: "private",
    })

    const otherEnvironments = httpEnvironmentsForRequest(catalog, "services/other/requests.http")
    expect(otherEnvironments.map((environment) => environment.name)).toEqual([
      "dev",
      "qa",
      "staging",
    ])
    expect(otherEnvironments.find((environment) => environment.name === "dev")).toMatchObject({
      directory: "",
      values: { host: "root", parentOnly: "root-only", token: "root-secret" },
    })

    const scratchEnvironments = httpEnvironmentsForRequest(catalog)
    expect(scratchEnvironments.map((environment) => environment.name)).toEqual(["dev", "staging"])
    expect(httpEnvironmentScopeDirectory("services/api/requests.http")).toBe("services/api")
    expect(httpEnvironmentScopeDirectory("../outside.http")).toBe("")
    expect(httpEnvironmentScopeDirectory("/outside.http")).toBe("")
  })

  test("creates a protected private environment and explicitly updates .gitignore", async () => {
    const root = await temporaryProject()
    await writeFile(resolve(root, ".gitignore"), "dist", { mode: 0o640 })
    const result = await createPrivateHttpEnvironment(root, {
      environmentName: "local",
      variableName: "apiToken",
      value: "fixture-token",
      addToGitignore: true,
      storeInKeychain: false,
    })
    expect(result).toMatchObject({
      environmentName: "local",
      variableName: "apiToken",
      gitignoreUpdated: true,
      gitignoreProtected: true,
    })
    const privatePath = resolve(root, "http-client.private.env.json")
    expect((await stat(privatePath)).mode & 0o777).toBe(0o600)
    expect(await readFile(resolve(root, ".gitignore"), "utf8")).toBe(
      "dist\nhttp-client.private.env.json\n",
    )
    expect((await stat(resolve(root, ".gitignore"))).mode & 0o777).toBe(0o640)
    expect((await loadHttpEnvironments(root))[0]).toMatchObject({
      name: "local",
      values: { apiToken: "fixture-token" },
    })
    await expect(
      createPrivateHttpEnvironment(root, {
        environmentName: "local",
        variableName: "apiToken",
        value: "replacement",
        addToGitignore: true,
        storeInKeychain: false,
      }),
    ).rejects.toBeInstanceOf(HttpEnvironmentConflictError)
    expect(await readFile(privatePath, "utf8")).toContain("fixture-token")
    expect(await readFile(privatePath, "utf8")).not.toContain("replacement")
  })

  test("does not follow a private-environment symlink or add .gitignore without consent", async () => {
    const root = await temporaryProject()
    const outside = await temporaryProject()
    const outsideFile = resolve(outside, "outside.json")
    await writeFile(outsideFile, '{"untouched":true}\n')
    await symlink(outsideFile, resolve(root, "http-client.private.env.json"))
    await expect(
      createPrivateHttpEnvironment(root, {
        environmentName: "local",
        variableName: "token",
        value: "fixture-token",
        addToGitignore: false,
        storeInKeychain: false,
      }),
    ).rejects.toBeInstanceOf(HttpEnvironmentConflictError)
    expect(await readFile(outsideFile, "utf8")).toBe('{"untouched":true}\n')
    await expect(readFile(resolve(root, ".gitignore"), "utf8")).rejects.toThrow()
  })

  test("creates private values beside the active request and rejects escaped scopes", async () => {
    const root = await temporaryProject()
    const outside = await temporaryProject()
    await mkdir(resolve(root, "services/api"), { recursive: true })
    const result = await createPrivateHttpEnvironment(
      root,
      {
        environmentName: "dev",
        variableName: "token",
        value: "nested-secret",
        addToGitignore: true,
        storeInKeychain: false,
      },
      undefined,
      "services/api",
    )
    const nestedPath = resolve(root, "services/api/http-client.private.env.json")
    expect(result).toMatchObject({ gitignoreUpdated: true, gitignoreProtected: true })
    expect((await stat(nestedPath)).mode & 0o777).toBe(0o600)
    expect(await readFile(nestedPath, "utf8")).toContain("nested-secret")
    expect(await Bun.file(resolve(root, "http-client.private.env.json")).exists()).toBe(false)
    expect(await readFile(resolve(root, ".gitignore"), "utf8")).toBe(
      "http-client.private.env.json\n",
    )

    await expect(
      createPrivateHttpEnvironment(
        root,
        {
          environmentName: "dev",
          variableName: "escaped",
          value: "blocked",
          addToGitignore: false,
          storeInKeychain: false,
        },
        undefined,
        "../outside",
      ),
    ).rejects.toThrow("permanecer dentro do projeto")

    await symlink(outside, resolve(root, "escaped-directory"), "dir")
    await expect(
      createPrivateHttpEnvironment(
        root,
        {
          environmentName: "dev",
          variableName: "symlinked",
          value: "blocked",
          addToGitignore: false,
          storeInKeychain: false,
        },
        undefined,
        "escaped-directory",
      ),
    ).rejects.toThrow("permanecer dentro do projeto")
  })

  test("stores only an opaque keychain reference and resolves it at load time", async () => {
    const root = await temporaryProject()
    const values = new Map<string, string>()
    const credentialStore: HttpCredentialStore = {
      async get({ service, name }) {
        expect(service).toBe(HTTP_SECRET_SERVICE)
        return values.get(name) ?? null
      },
      async set({ service, name, value }) {
        expect(service).toBe(HTTP_SECRET_SERVICE)
        values.set(name, value)
      },
      async delete({ service, name }) {
        expect(service).toBe(HTTP_SECRET_SERVICE)
        return values.delete(name)
      },
    }
    const result = await createPrivateHttpEnvironment(
      root,
      {
        environmentName: "keychain",
        variableName: "apiToken",
        value: "fixture-keychain-secret",
        addToGitignore: false,
        storeInKeychain: true,
      },
      credentialStore,
    )
    expect(result.keychainStored).toBe(true)
    const source = await readFile(resolve(root, "http-client.private.env.json"), "utf8")
    expect(source).not.toContain("fixture-keychain-secret")
    expect(source).toContain("{{$tuiminal.keychain.")
    const environments = await loadHttpEnvironments(root, credentialStore)
    expect(environments[0]?.values.apiToken).toBe("fixture-keychain-secret")
    expect(environments[0]?.privateNames.has("apiToken")).toBe(true)
  })

  test("accepts versioned workspace defaults but drops credential headers", () => {
    expect(
      parseHttpWorkspaceConfig({
        version: 1,
        defaultEnvironment: "dev",
        headers: { Accept: "application/json", Authorization: "secret" },
        options: { timeoutMs: 5_000, followRedirects: false },
        history: { persistMetadata: true, persistBodies: false },
      }),
    ).toEqual({
      version: 1,
      defaultEnvironment: "dev",
      headers: { Accept: "application/json" },
      options: { timeoutMs: 5_000, followRedirects: false },
      history: { persistMetadata: true, persistBodies: false },
    })
  })

  test("saves workspace defaults atomically and rejects stale or credential-bearing writes", async () => {
    const root = await temporaryProject()
    const saved = await saveHttpWorkspaceConfig(
      root,
      {
        version: 1,
        defaultEnvironment: "local",
        headers: { Accept: "application/json" },
        options: { timeoutMs: 5_000, followRedirects: false },
        history: { persistMetadata: false, persistBodies: true },
      },
      null,
    )
    expect(saved.config.history).toEqual({ persistMetadata: true, persistBodies: true })
    const path = resolve(root, ".tuiminal/http/config.json")
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    expect(await loadHttpWorkspaceConfigSnapshot(root)).toEqual(saved)

    await writeFile(path, '{"version":1,"headers":{"X-External":"yes"}}\n')
    await expect(saveHttpWorkspaceConfig(root, saved.config, saved.sourceHash)).rejects.toThrow(
      "mudou fora do Tuiminal",
    )
    await expect(
      saveHttpWorkspaceConfig(
        root,
        { ...saved.config, headers: { Authorization: "literal" } },
        saved.sourceHash,
      ),
    ).rejects.toThrow("contém credenciais")
    expect(await readFile(path, "utf8")).toContain("X-External")
  })

  test("does not load workspace configuration through a symlink", async () => {
    const root = await temporaryProject()
    const outside = await temporaryProject()
    await mkdir(resolve(root, ".tuiminal/http"), { recursive: true })
    const target = resolve(outside, "config.json")
    await writeFile(target, '{"version":1,"headers":{"X-Leak":"outside"}}\n')
    await symlink(target, resolve(root, ".tuiminal/http/config.json"))
    const snapshot = await loadHttpWorkspaceConfigSnapshot(root)
    expect(snapshot.config).toEqual({
      version: 1,
      headers: {},
      options: {},
      history: { persistMetadata: false, persistBodies: false },
    })
    expect(snapshot.error).toContain("arquivo regular")
  })
})

describe("cURL interoperability", () => {
  test("tokenizes quotes and imports method, duplicate query, headers, auth, body, and options", () => {
    expect(tokenizeCurl(`curl 'https://example.test/a b' -H "X-Test: a b"`)).toEqual([
      "curl",
      "https://example.test/a b",
      "-H",
      "X-Test: a b",
    ])
    const request = importCurl(
      `curl 'https://example.test/users?tag=a&tag=b' -H 'Content-Type: application/json' -H 'X-Test: yes' -u 'ada:secret' --proxy 'http://proxy.test:8080' --insecure --max-time 5 --data-raw '{"ok":true}'`,
      "curl-request",
    )
    expect(request).toMatchObject({
      method: "POST",
      url: "https://example.test/users",
      auth: { kind: "basic" },
    })
    expect(request.query.map(({ name, value }) => [name, value])).toEqual([
      ["tag", "a"],
      ["tag", "b"],
    ])
    expect(request.options.timeoutMs).toBe(5_000)
    expect(request.options.proxy).toBe("http://proxy.test:8080")
    expect(request.options.tlsVerification).toBe("insecure")
    expect(request.body.kind).toBe("json")
  })

  test("exports POSIX-safe cURL and redacts credential-bearing values by default", () => {
    const request = importCurl(
      `curl https://example.test/users?token=secret -H 'Authorization: Bearer abc' -H "X-Name: O'Reilly"`,
      "curl-export",
    )
    const prepared = prepareHttpRequest(request, "execution", 0)
    prepared.proxyUrl = "http://proxy-user:proxy-secret@proxy.test:8080/"
    prepared.tlsVerification = "insecure"
    const exported = exportPreparedRequestAsCurl(prepared)
    expect(exported).toContain("token=%3Credacted%3E")
    expect(exported).toContain("Authorization: <redacted>")
    expect(exported).toContain(`X-Name: O'\"'\"'Reilly`)
    expect(exported).toContain("--proxy 'http://redacted:redacted@proxy.test:8080/'")
    expect(exported).toContain("--insecure")
    expect(exportPreparedRequestAsCurl(prepared, { revealSecrets: true })).toContain("Bearer abc")
  })

  test("redacts known private values from harmless URL fields and text bodies", () => {
    const request = createScratchRequest("curl-private", "https://example.test/{{token}}")
    request.method = "POST"
    request.query = [
      { id: "code", enabled: true, name: "code", value: "{{token}}", sensitivity: "normal" },
    ]
    request.body = { kind: "json", text: '{"value":"{{token}}"}', form: [] }
    const context = createHttpVariableContext([
      { origin: "private", values: { token: "opaque/credential" }, secret: true },
    ])
    const prepared = prepareHttpRequest(request, "private", 0, context)
    const exported = exportPreparedRequestAsCurl(prepared, {
      secretValues: httpRequestSecretValues(request, context),
    })
    expect(exported).not.toContain("opaque")
    expect(exported).not.toContain("credential")
    expect(exported).toContain("%3Credacted%3E")
    expect(exported).toContain("<redacted>")
  })

  test("round-trips file and multipart bodies without embedding file content", async () => {
    const root = await temporaryProject()
    await writeFile(resolve(root, "payload.txt"), "private file content")
    const multipart = importCurl(
      "curl -L -F 'token=abc' -F 'upload=@payload.txt;type=text/plain' https://example.test/upload",
      "curl-multipart",
    )
    expect(multipart.options.followRedirects).toBe(true)
    expect(multipart.body.kind).toBe("multipart")
    expect(
      multipart.body.multipart?.map(({ name, value, kind }) => ({ name, value, kind })),
    ).toEqual([
      { name: "token", value: "abc", kind: "text" },
      { name: "upload", value: "payload.txt", kind: "file" },
    ])
    const prepared = prepareHttpRequest(multipart, "multipart", 0, undefined, root)
    expect(prepared.body).toBeInstanceOf(FormData)
    expect(prepared.bodyDescriptor).toMatchObject({ kind: "multipart", parts: { length: 2 } })
    const exported = exportPreparedRequestAsCurl(prepared)
    expect(exported).toContain("--form-string 'token=<redacted>'")
    const payloadPath = await realpath(resolve(root, "payload.txt"))
    expect(exported).toContain(`--form 'upload=@${payloadPath}'`)
    expect(exported).not.toContain("private file content")
    expect(exportPreparedRequestAsCurl(prepared, { revealSecrets: true })).toContain(
      "--form-string 'token=abc'",
    )

    const file = importCurl(
      "curl --data-binary '@payload.txt' https://example.test/upload",
      "curl-file",
    )
    expect(file.body).toMatchObject({ kind: "file", filePath: "payload.txt" })
    const fileExport = exportPreparedRequestAsCurl(
      prepareHttpRequest(file, "file", 0, undefined, root),
    )
    expect(fileExport).toContain(`--data-binary '@${payloadPath}'`)
  })

  test("imports cURL GET data as repeated query parameters", () => {
    const request = importCurl(
      "curl -G -d 'tag=a' -d 'tag=b' https://example.test/search",
      "curl-get",
    )
    expect(request.method).toBe("GET")
    expect(request.options.followRedirects).toBe(false)
    expect(request.query.map(({ name, value }) => [name, value])).toEqual([
      ["tag", "a"],
      ["tag", "b"],
    ])
    expect(request.body.kind).toBe("none")
  })
})

describe("project-scoped request bodies", () => {
  test("prepares file and multipart bodies only from files inside the project", async () => {
    const root = await temporaryProject()
    await writeFile(resolve(root, "payload.txt"), "hello")
    const request = createScratchRequest("file-body", "example.test/upload")
    request.method = "POST"
    request.body = { kind: "file", text: "", form: [], filePath: "payload.txt" }
    const filePrepared = prepareHttpRequest(request, "file", 0, undefined, root)
    expect(filePrepared.body).toBeInstanceOf(Blob)
    expect(await (filePrepared.body as Blob).text()).toBe("hello")

    request.body = {
      kind: "multipart",
      text: "",
      form: [],
      multipart: [
        {
          id: "text",
          enabled: true,
          name: "caption",
          value: "hello",
          kind: "text",
          sensitivity: "normal",
        },
        {
          id: "file",
          enabled: true,
          name: "upload",
          value: "payload.txt",
          kind: "file",
          sensitivity: "normal",
        },
      ],
    }
    const multipart = prepareHttpRequest(request, "multipart", 0, undefined, root)
    expect(multipart.body).toBeInstanceOf(FormData)
    expect((multipart.body as FormData).get("caption")).toBe("hello")
    expect((multipart.body as FormData).get("upload")).toBeInstanceOf(Blob)
  })

  test("blocks traversal and symlinks that resolve outside the project", async () => {
    const root = await temporaryProject()
    const outside = await temporaryProject()
    await writeFile(resolve(outside, "secret.txt"), "secret")
    await symlink(resolve(outside, "secret.txt"), resolve(root, "linked.txt"))
    const request = createScratchRequest("blocked-file", "example.test/upload")
    request.method = "POST"
    request.body = { kind: "file", text: "", form: [], filePath: "linked.txt" }
    expect(() => prepareHttpRequest(request, "blocked", 0, undefined, root)).toThrow(
      "permanecer dentro do projeto",
    )
    request.body.filePath = "../secret.txt"
    expect(() => prepareHttpRequest(request, "blocked", 0, undefined, root)).toThrow()
  })
})

describe("HTTP response exports", () => {
  test("writes exact captured bytes to a protected, collision-safe project export", async () => {
    const root = await temporaryProject()
    const response = {
      executionId: "export",
      requestId: "request",
      requestRevision: 0,
      url: "https://example.test/file",
      status: 200,
      statusText: "OK",
      headers: [],
      body: new Uint8Array([0, 1, 2, 255]),
      bodyKind: "binary" as const,
      contentType: "application/octet-stream",
      capturedBytes: 4,
      truncated: false,
      encoding: "utf-8",
      redirects: [],
      timings: { headersMs: 1, downloadMs: 1, totalMs: 2 },
    }
    const now = new Date("2026-09-04T12:34:56.000Z")
    const first = await saveCapturedHttpResponse(root, "User avatar", response, now)
    const second = await saveCapturedHttpResponse(root, "User avatar", response, now)

    expect(first).toEndWith("user-avatar-2026-09-04T12-34-56-000Z.octet-stream")
    expect(second).toEndWith("user-avatar-2026-09-04T12-34-56-000Z-2.octet-stream")
    expect(new Uint8Array(await readFile(first))).toEqual(response.body)
    expect((await stat(first)).mode & 0o777).toBe(0o600)
    expect((await stat(resolve(root, "tuiminal-exports/http"))).mode & 0o777).toBe(0o700)
  })
})
