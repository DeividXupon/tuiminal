import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  HTTP_LAST_WORKSPACE_FILE,
  readHttpLastWorkspace,
  saveHttpLastWorkspace,
} from "../packages/feature-http/src/storage/last-workspace"

const roots: string[] = []
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "http-last-workspace-"))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

test("defaults to local and remembers only the selected remote IDs", () => {
  const root = fixture()
  expect(readHttpLastWorkspace(root)).toEqual({ source: "local" })
  const remote = { source: "postman" as const, workspaceId: "w2", environmentId: "e2" }
  expect(saveHttpLastWorkspace({ ...remote, ...{ apiKey: "never-store-this" } }, root)).toBe(true)
  expect(readHttpLastWorkspace(root)).toEqual(remote)
  expect(JSON.parse(readFileSync(join(root, HTTP_LAST_WORKSPACE_FILE), "utf8"))).toEqual({
    schema: 1,
    ...remote,
  })
  expect(saveHttpLastWorkspace({ source: "local" }, root)).toBe(true)
  expect(readHttpLastWorkspace(root)).toEqual({ source: "local" })
})

test.each([
  "broken json",
  JSON.stringify({ schema: 2, source: "postman", workspaceId: "w1" }),
  JSON.stringify({ schema: 1, source: "postman", workspaceId: "../w1" }),
  JSON.stringify({ schema: 1, source: "postman", workspaceId: "w1", environmentId: [] }),
  " ".repeat(4097),
])("unreadable or invalid startup preferences fall back to local (%#)", (content) => {
  const root = fixture()
  writeFileSync(join(root, HTTP_LAST_WORKSPACE_FILE), content)
  expect(readHttpLastWorkspace(root)).toEqual({ source: "local" })
})

test.skipIf(process.platform === "win32")("never follows a preference symlink", () => {
  const root = fixture()
  const target = join(root, "untouched.json")
  const content = JSON.stringify({ schema: 1, source: "postman", workspaceId: "w1" })
  writeFileSync(target, content)
  symlinkSync(target, join(root, HTTP_LAST_WORKSPACE_FILE))
  expect(readHttpLastWorkspace(root)).toEqual({ source: "local" })
  expect(saveHttpLastWorkspace({ source: "local" }, root)).toBe(false)
  expect(readFileSync(target, "utf8")).toBe(content)
})
