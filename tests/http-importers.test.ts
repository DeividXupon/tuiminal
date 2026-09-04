import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { importOpenApiDocument } from "../src/features/http/importing/openapi"
import { importPostmanCollection } from "../src/features/http/importing/postman"
import {
  applyHttpCollectionImport,
  previewHttpCollectionImport,
} from "../src/features/http/services/collection-import"
import { writeImportedHttpCollection } from "../src/features/http/storage/imports"

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })))
})

describe("HTTP collection importers", () => {
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
})
