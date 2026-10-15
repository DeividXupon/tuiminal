import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { TreeSitterClient } from "@opentui/core"
import { syntaxFiletype } from "../packages/core/src/syntax/index"
import { syntaxParsers } from "../packages/core/src/syntax/parsers"
import { syntaxSamples } from "./fixtures/syntax-samples"

const root = mkdtempSync(join(tmpdir(), "tuiminal-syntax-"))
const client = new TreeSitterClient({ dataPath: root })
afterAll(async () => {
  try {
    await client.destroy()
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test.each(syntaxSamples)("bundled grammar highlights %s", async (path, content, token, group) => {
  const result = await client.highlightOnce(content, syntaxFiletype(path))
  expect(result.error).toBeUndefined()
  expect(result.warning).toBeUndefined()
  const start = content.indexOf(token)
  expect(
    result.highlights?.some(
      ([from, to, name]) =>
        from <= start && to >= start + token.length && name.split(".")[0] === group,
    ),
  ).toBe(true)
})

test("every bundled parser uses local assets", () => {
  for (const parser of syntaxParsers) {
    for (const path of [
      parser.wasm,
      ...parser.queries.highlights,
      ...(parser.queries.injections ?? []),
    ]) {
      expect(path).not.toMatch(/^https?:/)
    }
  }
})

test.each([
  ["C:\\project\\App.TSX", "typescriptreact"],
  ["Dockerfile.production", "dockerfile"],
  ["deploy/worker.dockerfile", "dockerfile"],
  ["Containerfile.dev", "dockerfile"],
  [".env.local", "bash"],
  ["project.csproj", "xml"],
  ["logo.svg", "xml"],
  ["tsconfig.jsonc", "json"],
  ["unknown.custom", "text"],
])("resolves syntax for %s", (path, language) => {
  expect(syntaxFiletype(path)).toBe(language)
})
