import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { importPostmanCollection } from "../packages/feature-http/src/importing/postman"
import {
  parseHttpFile,
  requestFromHttpFile,
  serializeHttpRequestBlock,
} from "../packages/feature-http/src/model/http-file"
import { readPostmanRequestDocumentation } from "../packages/feature-http/src/postman/documentation"
import { pullPostmanCollection } from "../packages/feature-http/src/postman/pull"
import { refreshPostmanCollection } from "../packages/feature-http/src/postman/refresh"

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const description =
  '# Get users\n\nLists **active** users.\n\n```json\n{"limit": 10}\n```\n\n### Example\n# @no-log\nGET https://example.invalid/only-documentation'

for (const version of ["v2.0.0", "v2.1.0"]) {
  test(`imports ${version} descriptions and preserves Markdown through save and reopen`, () => {
    const report = importPostmanCollection({
      info: { schema: `https://schema.getpostman.com/json/collection/${version}/collection.json` },
      item: [
        {
          name: "Users",
          description: "Folder description",
          item: [
            {
              name: "List",
              request: { method: "GET", url: "https://example.invalid", description },
            },
            {
              name: "Object",
              request: {
                method: "GET",
                url: "https://example.invalid",
                description: { content: description, type: "text/markdown" },
              },
            },
            {
              name: "Item",
              description,
              request: { method: "GET", url: "https://example.invalid" },
            },
            {
              name: "Empty",
              request: { method: "GET", url: "https://example.invalid", description: "" },
            },
            { name: "Missing", request: { method: "GET", url: "https://example.invalid" } },
          ],
        },
      ],
    })
    expect(report.requests.map((request) => request.description)).toEqual([
      description,
      description,
      description,
      "",
      "",
    ])
    for (const request of report.requests) {
      const file = parseHttpFile(serializeHttpRequestBlock(request), "docs.http")
      expect(file.requests).toHaveLength(1)
      const block = file.requests[0]
      if (!block) throw new Error("Missing request block")
      expect(block.editable).toBe(true)
      const reopened = requestFromHttpFile(file, block)
      expect(reopened.description).toBe(request.description)
      expect(reopened.options.noLog).toBe(false)
      expect(reopened.body.kind).toBe("none")
      expect(serializeHttpRequestBlock(reopened)).toBe(serializeHttpRequestBlock(request))
    }
  })
}

test.each(['{"content":"not a string"}', '"unterminated', "null", "42"])(
  "malformed documentation remains an opaque block: %s",
  (value) => {
    const source = `### Opaque\n# @description ${value}\nGET https://example.invalid\n`
    const file = parseHttpFile(source, "docs.http")
    expect(file.requests[0]?.editable).toBe(false)
    expect(file.requests[0]?.rawText).toBe(source)
  },
)

test("pull and refresh preserve docs, and older linked copies read the correct remote ID without writes", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "tuiminal-request-docs-"))
  roots.push(root)
  const remote = {
    item: [
      {
        id: "r1",
        name: "Repeated",
        request: { method: "GET", url: "https://example.invalid/1", description },
      },
      {
        id: "r2",
        name: "Repeated",
        request: { method: "GET", url: "https://example.invalid/2", description: "Second request" },
      },
    ],
  }
  const api = {
    async collections() {
      return [{ id: "c1", name: "Docs" }]
    },
    async collection() {
      return structuredClone(remote)
    },
    async globals() {
      return []
    },
    async environments() {
      return []
    },
    async environment() {
      return { name: "Unused", values: [] }
    },
  }
  const { path } = await pullPostmanCollection(root, api, { workspaceId: "w1", collectionId: "c1" })
  const absolute = resolve(root, path)
  const imported = parseHttpFile(await readFile(absolute, "utf8"), path)
  expect(imported.requests.map((request) => request.description)).toEqual([
    description,
    "Second request",
  ])
  const second = remote.item[1]
  if (!second) throw new Error("Missing second request")
  second.request.description = "Updated documentation"
  const refreshed = await refreshPostmanCollection(root, api, path)
  expect(refreshed.file.requests[1]?.description).toBe("Updated documentation")

  const oldSource = refreshed.file.source.replace(/^# @description .*\n/gm, "")
  await writeFile(absolute, oldSource)
  const sidecar = await readFile(`${absolute}.postman.json`, "utf8")
  const legacy = parseHttpFile(oldSource, path)
  const block = legacy.requests[1]
  if (!block) throw new Error("Missing legacy request")
  const request = requestFromHttpFile(legacy, block)
  expect(request.description).toBeUndefined()
  expect(await readPostmanRequestDocumentation(root, api, request)).toBe("Updated documentation")
  expect(await readFile(absolute, "utf8")).toBe(oldSource)
  expect(await readFile(`${absolute}.postman.json`, "utf8")).toBe(sidecar)
  remote.item.pop()
  await expect(readPostmanRequestDocumentation(root, api, request)).rejects.toThrow(
    "Recurso Postman não encontrado.",
  )
  const metadata = JSON.parse(sidecar)
  metadata.entries.push(metadata.entries[1])
  await writeFile(`${absolute}.postman.json`, JSON.stringify(metadata))
  await expect(readPostmanRequestDocumentation(root, api, request)).rejects.toThrow(
    "não possui ID remoto",
  )
})
