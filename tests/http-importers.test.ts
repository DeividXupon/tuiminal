import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import YAML from "yaml"
import { importOpenApiDocument } from "../packages/feature-http/src/importing/openapi"
import { importPostmanCollection } from "../packages/feature-http/src/importing/postman"
import {
  applyHttpCollectionImport,
  previewHttpCollectionImport,
} from "../packages/feature-http/src/services/collection-import"
import { writeImportedHttpCollection } from "../packages/feature-http/src/storage/imports"

const roots: string[] = []
const importFixtures = resolve(import.meta.dir, "fixtures/http/import")

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })))
})

describe("HTTP collection importers", () => {
  test("covers the versioned Postman v2.1 compatibility matrix", async () => {
    const source = JSON.parse(await readFile(resolve(importFixtures, "postman-v2.1.json"), "utf8"))
    const report = importPostmanCollection(source)
    expect(report.requests).toHaveLength(8)

    const structured = report.requests.find((request) => request.name.endsWith("Get structured"))
    expect(structured).toMatchObject({
      url: "https://api.example.test:8443/users/:id",
      auth: {
        kind: "basic",
        username: "fixture-user",
        password: "{{postman_1_users_get_structured_basic_password}}",
      },
      query: [
        expect.objectContaining({ name: "expand", value: "profile", enabled: true }),
        expect.objectContaining({ name: "disabled", enabled: false }),
      ],
      path: [expect.objectContaining({ name: "id", value: "42" })],
    })
    expect(structured?.headers.map(({ name, value }) => [name, value])).toEqual([
      ["Accept", "application/json"],
      ["X-Trace", "fixture"],
    ])

    const created = report.requests.find((request) => request.name.endsWith("Create JSON"))
    expect(created).toMatchObject({
      auth: { kind: "none" },
      body: { kind: "json", text: '{"name":"Ada"}' },
    })
    expect(created?.headers.find((header) => header.name === "X-API-Key")).toMatchObject({
      value: "{{postman_2_users_create_json_header_2}}",
      sensitivity: "secret-ref",
    })
    expect(created?.headers.find((header) => header.name === "X-Disabled")?.enabled).toBe(false)

    const form = report.requests.find((request) => request.name.endsWith("Submit form"))
    expect(form?.body).toMatchObject({
      kind: "form",
      form: [
        expect.objectContaining({ name: "enabled", enabled: true }),
        expect.objectContaining({ name: "disabled", enabled: false }),
      ],
    })
    const multipart = report.requests.find((request) => request.name.endsWith("Upload multipart"))
    expect(multipart?.body.multipart).toEqual([
      expect.objectContaining({ name: "caption", kind: "text", enabled: true }),
      expect.objectContaining({ name: "asset", kind: "file", value: "fixtures/asset.bin" }),
      expect.objectContaining({ name: "ignored", enabled: false }),
    ])
    const graphql = report.requests.find((request) => request.name.endsWith("GraphQL body"))
    expect(graphql?.body.kind).toBe("json")
    expect(JSON.parse(graphql?.body.text ?? "{}")).toMatchObject({ variables: { id: "42" } })
    expect(report.ignored).toContain("Coleção: variáveis")
    expect(report.ignored).toContain("Users / Get structured: respostas salvas")
    expect(report.warnings).toContain("Coleção: scripts ignorados.")
    expect(report.warnings).toContain(
      "Users / Unsupported auth: autenticação oauth2 não suportada.",
    )
    expect(report.warnings.join("\n")).not.toContain("literal-password")
    expect(report.warnings.join("\n")).not.toContain("root-literal-token")
    const basicPasswords = report.requests.flatMap((request) =>
      request.auth.kind === "basic" ? [request.auth.password] : [],
    )
    expect(new Set(basicPasswords).size).toBe(basicPasswords.length)
  })

  test("covers OpenAPI 3.0 JSON and 3.1 YAML fixtures with safe local refs", async () => {
    const openApi30 = importOpenApiDocument(
      JSON.parse(await readFile(resolve(importFixtures, "openapi-3.0.json"), "utf8")),
    )
    expect(openApi30.requests).toHaveLength(2)
    expect(openApi30.requests[0]).toMatchObject({
      name: "Get user",
      url: "http://localhost/tenant-api/users/{id}",
      auth: { kind: "none" },
      path: [expect.objectContaining({ name: "id", value: "42" })],
      query: [expect.objectContaining({ name: "expand", value: '["profile","teams"]' })],
      headers: [expect.objectContaining({ name: "X-Tenant", value: "acme" })],
      assertions: [{ expression: "status == 200" }],
    })
    expect(openApi30.requests[1]).toMatchObject({
      name: "Create user",
      url: "https://write.example.test/v2/users",
      auth: { kind: "api-key", name: "X-API-Key", value: "{{ApiKeyAlias}}" },
      body: { kind: "json" },
      assertions: [{ expression: "status == 201" }],
    })
    expect(JSON.parse(openApi30.requests[1]?.body.text ?? "{}")).toEqual({
      name: "Ada",
      active: true,
      roles: ["admin"],
    })
    expect(openApi30.ignored).toContain("Get user: parâmetros cookie")
    expect(openApi30.ignored).toContain("Create user: callbacks")
    expect(openApi30.warnings).toContain("/external: path item: referência externa não suportada.")

    const openApi31 = importOpenApiDocument(
      YAML.parse(await readFile(resolve(importFixtures, "openapi-3.1.yaml"), "utf8")),
    )
    expect(openApi31.requests.map((request) => request.name)).toEqual([
      "health",
      "submitForm",
      "uploadAsset",
    ])
    expect(openApi31.requests[0]?.url).toBe("https://health.example.test/health")
    expect(openApi31.requests[1]?.body).toMatchObject({
      kind: "form",
      form: [
        expect.objectContaining({ name: "mode", value: "compact" }),
        expect.objectContaining({ name: "attempts", value: "3" }),
      ],
    })
    expect(openApi31.requests[2]?.body.multipart).toEqual([
      expect.objectContaining({ name: "caption", kind: "text", value: "fixture" }),
      expect.objectContaining({ name: "asset", kind: "file", value: "{{asset_file}}" }),
    ])
    expect(openApi31.ignored).toContain("webhooks")
    expect(openApi31.warnings).toContain(
      "uploadAsset: parâmetro: referência externa não suportada.",
    )
  })

  test("imports nested Postman v2.1 requests and reports unsupported scripts", () => {
    const report = importPostmanCollection({
      info: { schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
      item: [
        {
          name: "Users",
          item: [
            {
              name: "Create",
              event: [{ listen: "test", script: { exec: ["pm.test('ok')"] } }],
              request: {
                method: "POST",
                url: { raw: "https://api.example.test/users" },
                header: [{ key: "X-Trace", value: "yes" }],
                auth: { type: "bearer", bearer: [{ key: "token", value: "{{token}}" }] },
                body: {
                  mode: "raw",
                  raw: '{"name":"Ada"}',
                  options: { raw: { language: "json" } },
                },
              },
            },
          ],
        },
      ],
    })
    expect(report.requests).toHaveLength(1)
    expect(report.requests[0]).toMatchObject({
      name: "Users / Create",
      method: "POST",
      url: "https://api.example.test/users",
      auth: { kind: "bearer", token: "{{token}}" },
      body: { kind: "json", text: '{"name":"Ada"}' },
    })
    expect(report.warnings).toEqual(["Users / Create: scripts ignorados."])
  })

  test("rejects an explicitly incompatible Postman collection version", () => {
    expect(() =>
      importPostmanCollection({
        info: {
          schema: "https://schema.getpostman.com/json/collection/v2.0.0/collection.json",
        },
        item: [{ name: "Ping", request: { method: "GET", url: "https://example.test" } }],
      }),
    ).toThrow("Postman v2.1")
  })

  test("imports OpenAPI 3 paths, parameters, auth, body examples and status assertions", () => {
    const report = importOpenApiDocument({
      openapi: "3.1.0",
      servers: [{ url: "https://{host}/v1", variables: { host: { default: "api.example.test" } } }],
      security: [{ bearerAuth: [] }],
      components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
      paths: {
        "/users/{id}": {
          get: {
            operationId: "getUser",
            summary: "Get user",
            parameters: [
              { in: "path", name: "id", example: 42 },
              { in: "query", name: "verbose", schema: { default: true } },
            ],
            responses: { 200: { description: "OK" } },
          },
        },
        "/users": {
          post: {
            operationId: "createUser",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { name: { type: "string", example: "Ada" } },
                  },
                },
              },
            },
            responses: { 201: { description: "Created" } },
          },
        },
      },
    })
    expect(report.requests).toHaveLength(2)
    expect(report.requests[0]).toMatchObject({
      url: "https://api.example.test/v1/users/{id}",
      path: [expect.objectContaining({ name: "id", value: "42" })],
      query: [expect.objectContaining({ name: "verbose", value: "true" })],
      auth: { kind: "bearer", token: "{{bearerAuth}}" },
      assertions: [{ expression: "status == 200" }],
    })
    expect(report.requests[1]?.body).toMatchObject({ kind: "json", text: '{\n  "name": "Ada"\n}' })
  })

  test("writes protected imports without overwriting an existing file", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tuiminal-http-import-"))
    roots.push(root)
    const report = importPostmanCollection({
      item: [{ name: "Ping", request: { method: "GET", url: "https://example.test" } }],
    })
    const first = await writeImportedHttpCollection(root, "collection.json", report)
    const second = await writeImportedHttpCollection(root, "collection.json", report)
    expect(second).not.toBe(first)
    expect(await readFile(first, "utf8")).toContain("GET https://example.test")
    expect((await stat(first)).mode & 0o777).toBe(0o600)
    expect((await stat(root)).mode & 0o777).toBe(0o700)
  })

  test("previews before writing and keeps TUI imports inside the project", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tuiminal-http-preview-"))
    roots.push(root)
    await writeFile(
      resolve(root, "collection.json"),
      JSON.stringify({
        item: [{ name: "Ping", request: { method: "GET", url: "https://example.test" } }],
      }),
    )

    const preview = await previewHttpCollectionImport(
      root,
      "postman",
      "collection.json",
      ".tuiminal/http/imported",
    )
    expect(preview).toMatchObject({
      sourcePath: "collection.json",
      plannedPath: ".tuiminal/http/imported/collection.http",
      conflicts: 0,
    })
    expect(await Bun.file(resolve(root, preview.plannedPath)).exists()).toBe(false)

    const applied = await applyHttpCollectionImport(root, preview)
    expect(applied.outputPath).toBe(preview.plannedPath)
    expect(await readFile(resolve(root, applied.outputPath), "utf8")).toContain("# @name ping")

    const next = await previewHttpCollectionImport(
      root,
      "postman",
      "collection.json",
      ".tuiminal/http/imported",
    )
    expect(next.conflicts).toBe(1)
    expect(next.plannedPath).toEndWith("collection-2.http")
    await writeFile(
      resolve(root, "collection.json"),
      JSON.stringify({
        item: [
          { name: "Ping", request: { method: "GET", url: "https://example.test" } },
          { name: "Pong", request: { method: "GET", url: "https://example.test/pong" } },
        ],
      }),
    )
    await expect(applyHttpCollectionImport(root, next)).rejects.toThrow(
      "origem mudou depois da prévia",
    )

    const racePreview = await previewHttpCollectionImport(
      root,
      "postman",
      "collection.json",
      ".tuiminal/http/imported",
    )
    await writeFile(resolve(root, racePreview.plannedPath), "occupied")
    await expect(applyHttpCollectionImport(root, racePreview)).rejects.toThrow(
      "destino mudou depois da prévia",
    )
    const outside = await mkdtemp(resolve(tmpdir(), "tuiminal-http-outside-"))
    roots.push(outside)
    const outsideFile = resolve(outside, "outside.json")
    await writeFile(outsideFile, "{}")
    await expect(
      previewHttpCollectionImport(root, "postman", outsideFile, ".tuiminal/http/imported"),
    ).rejects.toThrow("dentro do projeto")
    await expect(
      previewHttpCollectionImport(root, "postman", "collection.json", "../outside"),
    ).rejects.toThrow("dentro do projeto")
  })

  test("imports a versioned fixture through the public CLI without leaking literals", async () => {
    const root = await mkdtemp(resolve(tmpdir(), "tuiminal-http-import-cli-"))
    roots.push(root)
    const fixture = await readFile(resolve(importFixtures, "postman-v2.1.json"), "utf8")
    await writeFile(resolve(root, "collection.json"), fixture)
    const child = Bun.spawn(
      [
        "bun",
        resolve(import.meta.dir, "../apps/cli/bin/tuiminal.ts"),
        "http",
        "import",
        "postman",
        "collection.json",
        "--output",
        "generated",
      ],
      { cwd: root, stdout: "pipe", stderr: "pipe" },
    )
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    const result = JSON.parse(stdout)
    expect(result).toMatchObject({ version: 1, format: "postman", imported: 8 })
    const output = await readFile(result.output, "utf8")
    expect(output).toContain("# @name users-get-structured")
    expect(output).toContain("{{postman_1_users_get_structured_basic_password}}")
    expect(output).not.toContain("literal-password")
    expect(output).not.toContain("literal-api-key")
    expect(output).not.toContain("root-literal-token")
  })
})
