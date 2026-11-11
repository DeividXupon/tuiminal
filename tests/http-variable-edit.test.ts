import { afterEach, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { localCollectionVariableEditor } from "../packages/feature-http/src/storage/collection-variable"
import { localEnvironmentVariableEditor } from "../packages/feature-http/src/storage/environment-variable"
import {
  loadHttpEnvironmentCatalog,
  httpEnvironmentsForRequest,
} from "../packages/feature-http/src/storage/environments"
import {
  httpVariableTokens,
  variableAt,
} from "../packages/feature-http/src/ui/http-variable-rendering"

const roots: string[] = []
const originalSecrets = Bun.secrets
afterEach(async () => {
  Object.assign(Bun, { secrets: originalSecrets })
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "http-variable-edit-"))
  roots.push(root)
  return root
}
test("variable positions use grapheme display columns, tabs and multiline bodies", () => {
  const tokens = httpVariableTokens('日本\t{{name}}\n{"a":"{{ env }}"}', 4)
  expect(tokens).toEqual([
    { name: "name", row: 0, start: 8, end: 16 },
    { name: "env", row: 1, start: 6, end: 15 },
  ])
  expect(variableAt(tokens, 0, 15)?.name).toBe("name")
  expect(variableAt(tokens, 0, 16)).toBeUndefined()
})
test("local collection edit preserves all request bytes and unrelated variable changes", async () => {
  const root = await fixture()
  const original =
    "@name = before\r\n@other = original\r\n\r\n### Call\r\nGET https://example.invalid/{{name}}\r\n"
  await writeFile(join(root, "demo.http"), original)
  let refreshed = 0
  const save = await localCollectionVariableEditor(root, "demo.http", "name", async () => {
    refreshed++
  })
  await writeFile(
    join(root, "demo.http"),
    original.replace("@other = original", "@other = changed"),
  )
  await save("after")
  expect(await readFile(join(root, "demo.http"), "utf8")).toBe(
    original
      .replace("name = before", "name = after")
      .replace("other = original", "other = changed"),
  )
  expect(refreshed).toBe(1)
  await save("after")
  expect(refreshed).toBe(1)
  await expect(save("bad\nvalue")).rejects.toThrow("uma linha")
})
test("local variable conflicts preserve the newer stored value", async () => {
  const root = await fixture()
  await writeFile(join(root, "demo.http"), "@name = before\nGET https://example.invalid\n")
  const save = await localCollectionVariableEditor(root, "demo.http", "name", async () => {})
  await writeFile(join(root, "demo.http"), "@name = external\nGET https://example.invalid\n")
  await expect(save("mine")).rejects.toThrow("A variável mudou")
  expect(await readFile(join(root, "demo.http"), "utf8")).toContain("external")
})
test.each(["@globals", "Stage"])(
  "local %s edits use credential storage and preserve other variables",
  async (key) => {
    const root = await fixture()
    const name = key === "@globals" ? "Globals" : key
    await writeFile(
      join(root, "http-client.env.json"),
      JSON.stringify({ [name]: { value: "before", other: "keep" } }),
    )
    const secrets = new Map<string, string>()
    Object.assign(Bun, {
      secrets: {
        get: async ({ name }: { name: string }) => secrets.get(name) ?? null,
        set: async ({ name, value }: { name: string; value: string }) => {
          secrets.set(name, value)
        },
        delete: async ({ name }: { name: string }) => secrets.delete(name),
      },
    })
    const save = await localEnvironmentVariableEditor(root, key, "value", async () => {})
    await save("new secret")
    const catalog = await loadHttpEnvironmentCatalog(root, [])
    expect(httpEnvironmentsForRequest(catalog).find((env) => env.name === name)?.values).toEqual({
      value: "new secret",
      other: "keep",
    })
    expect(await readFile(join(root, "http-client.private.env.json"), "utf8")).not.toContain(
      "new secret",
    )
  },
)

test("saving a collection variable rebases source hashes without marking request drafts saved", async () => {
  const { createHttpWorkspaceState, httpWorkspaceReducer } = await import(
    "../packages/feature-http/src/model/workspace"
  )
  const { parseHttpFile, requestFromHttpFile } = await import(
    "../packages/feature-http/src/model/http-file"
  )
  const source = "@name = before\n### Call\nGET https://example.invalid/{{name}}\n"
  const file = parseHttpFile(source, "demo.http")
  const block = file.requests[0]
  if (!block) throw Error("Missing fixture request")
  const request = requestFromHttpFile(file, block)
  let state = createHttpWorkspaceState(request)
  state = httpWorkspaceReducer(state, {
    type: "update-request",
    documentId: request.id,
    patch: { url: "https://example.invalid/unsaved" },
  })
  const revised = httpWorkspaceReducer(state, {
    type: "rebase-collection-variable",
    path: "demo.http",
    beforeHash: file.sourceHash,
    sourceHash: "new-hash",
  })
  expect(revised.documents[0]?.request.source).toMatchObject({ sourceHash: "new-hash" })
  expect(revised.documents[0]?.request.url).toBe("https://example.invalid/unsaved")
  expect(revised.documents[0]?.revision).toBe(1)
  expect(revised.documents[0]?.savedRevision).toBe(0)
  const stale = httpWorkspaceReducer(revised, {
    type: "rebase-collection-variable",
    path: "demo.http",
    beforeHash: file.sourceHash,
    sourceHash: "stale-hash",
  })
  expect(stale.documents[0]?.request.source).toMatchObject({ sourceHash: "new-hash" })
})
