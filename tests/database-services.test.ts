import { expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// These services capture their config root at import. Use a fresh process so
// the existing SQLite suite and these fakes cannot share caches or credentials.
test.each([
  "history filtering resolves its target once",
  "batch history resolves its target once",
  "native connection tests close on query failure",
  "native connection tests preserve the query error if cleanup fails",
  "native connection tests preserve the query error if cleanup throws synchronously",
  "native connection tests still close after success",
  "MCP connection tests close on query failure",
  "MCP discovery closes if listing tools fails",
  "MCP cleanup cannot replace the discovery error",
  "MCP discovery closes if connecting fails",
  "MCP discovery closes if the required tool is missing",
  "MCP connection tests still close after success",
  "environment passwords are decoded once",
  "environment targets never inherit a previous password",
])("database services: %s", async (scenario) => {
  const root = mkdtempSync(join(tmpdir(), "tuiminal-db-services-"))
  try {
    const child = Bun.spawn({
      cmd: [process.execPath, join(import.meta.dir, "fixtures/database-services.ts"), scenario],
      env: { ...process.env, XDG_CONFIG_HOME: root },
      stdout: "pipe",
      stderr: "pipe",
    })
    const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
    expect(stderr).toBe("")
    expect(code).toBe(0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
