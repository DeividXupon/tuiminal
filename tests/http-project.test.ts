import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { exportPreparedRequestAsCurl } from "../src/features/http/exporting/curl"
import { importCurl, tokenizeCurl } from "../src/features/http/importing/curl"
import {
  parseHttpFile,
  replaceHttpRequestBlock,
  requestFromHttpFile,
} from "../src/features/http/model/http-file"
import {
  createHttpVariableContext,
  httpVariableSuggestions,
  redactHttpTemplate,
  resolveHttpTemplate,
} from "../src/features/http/model/variables"
import { prepareHttpRequest } from "../src/features/http/services/request-builder"
import { parseHttpWorkspaceConfig } from "../src/features/http/storage/config"
import {
  duplicateHttpRequest,
  saveHttpRequest,
  scanHttpProject,
} from "../src/features/http/storage/collections"
import {
  environmentVariableContext,
  loadHttpEnvironments,
} from "../src/features/http/storage/environments"

const temporaryDirectories: string[] = []

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
    await expect(saveHttpRequest(root, saved)).rejects.toThrow("mudou fora do Tuiminal")
    expect(
      await readFile(
        resolve(root, duplicate.source.kind === "file" ? duplicate.source.path : ""),
        "utf8",
      ),
    ).toContain("List users copy")
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
      `curl 'https://example.test/users?tag=a&tag=b' -H 'Content-Type: application/json' -H 'X-Test: yes' -u 'ada:secret' --max-time 5 --data-raw '{"ok":true}'`,
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
    expect(request.body.kind).toBe("json")
  })

  test("exports POSIX-safe cURL and redacts credential-bearing values by default", () => {
    const request = importCurl(
      `curl https://example.test/users?token=secret -H 'Authorization: Bearer abc' -H "X-Name: O'Reilly"`,
      "curl-export",
    )
    const prepared = prepareHttpRequest(request, "execution", 0)
    const exported = exportPreparedRequestAsCurl(prepared)
    expect(exported).toContain("token=%3Credacted%3E")
    expect(exported).toContain("Authorization: <redacted>")
    expect(exported).toContain(`X-Name: O'\"'\"'Reilly`)
    expect(exportPreparedRequestAsCurl(prepared, { revealSecrets: true })).toContain("Bearer abc")
  })
})
