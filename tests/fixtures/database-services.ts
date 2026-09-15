import assert from "node:assert/strict"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import * as db from "../../packages/feature-database/src/services/database"
import type { DatabaseQueryHistoryEntry } from "../../packages/feature-database/src/model/types"

const profile = {
  id: "fixture",
  name: "Fixture",
  driver: "sqlite" as const,
  source: "saved" as const,
  filename: "/unused-fixture.sqlite",
  ssl: false,
  writeEnabled: false,
}
const history = (index: number): DatabaseQueryHistoryEntry => ({
  id: `entry-${index}`,
  connectionId: profile.id,
  connectionScope: index % 2 ? "foreign::sqlite::other" : "fixture::sqlite::/unused-fixture.sqlite",
  connectionName: profile.name,
  driver: profile.driver,
  storage: "metadata-only",
  readOnly: true,
  sql: "",
  command: "SELECT",
  status: "success",
  executedAt: new Date().toISOString(),
  durationMs: 1,
  rowCount: 1,
  affectedRows: null,
  error: null,
  rerunnable: false,
  parameterPreview: [],
})

function seedHistory() {
  db.writeSettings({
    ...db.readSettings(),
    connections: [profile],
    queryHistory: Array.from({ length: 100 }, (_, index) => history(index)),
  })
}

function countClones(run: () => void) {
  let clones = 0
  const original = globalThis.structuredClone
  globalThis.structuredClone = (value, options) => {
    clones += 1
    return original(value, options)
  }
  try {
    run()
  } finally {
    globalThis.structuredClone = original
  }
  return clones
}

function historyFiltering() {
  seedHistory()
  const clones = countClones(() => {
    const entries = db.listDatabaseQueryHistory(profile.id)
    assert.equal(entries.length, 50)
    assert(
      entries.every((entry) => entry.connectionScope === "fixture::sqlite::/unused-fixture.sqlite"),
    )
  })
  assert(clones <= 3, `Expected constant settings clones, got ${clones}`)
}

function batchHistory() {
  seedHistory()
  const clones = countClones(() =>
    db.appendDatabaseQueryHistoryBatch(
      profile.id,
      Array.from({ length: 50 }, (_, index) => ({
        ...history(index),
        sql: `UPDATE sample SET value = ${index}`,
        command: "UPDATE",
        rerunnable: false,
      })),
    ),
  )
  const entries = db.listDatabaseQueryHistory(profile.id)
  assert.equal(entries.filter((entry) => entry.command === "UPDATE").length, 50)
  assert(
    entries
      .slice(0, 50)
      .every((entry) => entry.connectionScope === "fixture::sqlite::/unused-fixture.sqlite"),
  )
  assert(clones <= 4, `Expected constant settings clones, got ${clones}`)
}

async function nativeTest(failQuery: boolean, failClose: boolean | "sync" = false) {
  const queryError = new Error("fixture query error")
  let closes = 0
  const original = Bun.SQL
  class FakeSQL {
    async unsafe() {
      if (failQuery) throw queryError
      return [{ connection_ok: 1 }]
    }
    close() {
      closes += 1
      if (failClose === "sync") throw new Error("fixture cleanup error")
      if (failClose) return Promise.reject(new Error("fixture cleanup error"))
      return Promise.resolve()
    }
  }
  Object.defineProperty(Bun, "SQL", { value: FakeSQL })
  try {
    const result = db.testDatabaseConnection(profile, "FICTIONAL_TEST_PASSWORD")
    if (failQuery) await assert.rejects(result, (error) => error === queryError)
    else await result
    assert.equal(closes, 1)
    assert.equal(db.sessionPasswords.size, 0)
  } finally {
    Object.defineProperty(Bun, "SQL", { value: original })
  }
}

async function mcpTest(failAt: "connect" | "list" | "missing" | "query" | null, failClose = false) {
  let closes = 0
  const failure = new Error("fixture MCP failure")
  const original = {
    connect: Client.prototype.connect,
    listTools: Client.prototype.listTools,
    callTool: Client.prototype.callTool,
    close: Client.prototype.close,
  }
  Client.prototype.connect = async () => {
    if (failAt === "connect") throw failure
  }
  Client.prototype.listTools = async () => {
    if (failAt === "list") throw failure
    return {
      tools: failAt === "missing" ? [] : [{ name: "mysql_query", inputSchema: { type: "object" } }],
    }
  }
  Client.prototype.callTool = async () => {
    if (failAt === "query") throw failure
    return { content: [{ type: "text", text: '[{"connection_ok":1}]' }] }
  }
  Client.prototype.close = () => {
    closes += 1
    if (failClose) throw new Error("fixture cleanup error")
    return Promise.resolve()
  }
  try {
    const pending = db.testDatabaseConnection(
      { ...profile, driver: "mcp-mysql", command: process.execPath },
      "",
    )
    if (failAt === "missing") await assert.rejects(pending, /mysql_query/)
    else if (failAt) await assert.rejects(pending, (error) => error === failure)
    else await pending
    assert.equal(closes, 1)
  } finally {
    Object.assign(Client.prototype, original)
  }
}

function environmentPassword() {
  const value = "fictional:@/%2F中文"
  process.env.DATABASE_URL = `postgres://fixture:${encodeURIComponent(value)}@host.test/fixture`
  assert(db.discoveredEnvironmentProfile())
  assert.equal(db.sessionPasswords.get("environment-database-url"), value)
}

function environmentReplacement() {
  process.env.DATABASE_URL = "postgres://fixture:fictional@first.test/one"
  assert(db.discoveredEnvironmentProfile())
  process.env.DATABASE_URL = "postgres://fixture@second.test/two"
  assert(db.discoveredEnvironmentProfile())
  assert.equal(db.sessionPasswords.get("environment-database-url"), "")
  process.env.DATABASE_URL = "invalid URL"
  assert.equal(db.discoveredEnvironmentProfile(), null)
  assert.equal(db.sessionPasswords.has("environment-database-url"), false)
}

const scenarios: Record<string, () => void | Promise<void>> = {
  "history filtering resolves its target once": historyFiltering,
  "batch history resolves its target once": batchHistory,
  "native connection tests close on query failure": () => nativeTest(true),
  "native connection tests preserve the query error if cleanup fails": () => nativeTest(true, true),
  "native connection tests preserve the query error if cleanup throws synchronously": () =>
    nativeTest(true, "sync"),
  "native connection tests still close after success": () => nativeTest(false),
  "MCP connection tests close on query failure": () => mcpTest("query"),
  "MCP discovery closes if listing tools fails": () => mcpTest("list"),
  "MCP cleanup cannot replace the discovery error": () => mcpTest("list", true),
  "MCP discovery closes if connecting fails": () => mcpTest("connect"),
  "MCP discovery closes if the required tool is missing": () => mcpTest("missing"),
  "MCP connection tests still close after success": () => mcpTest(null),
  "environment passwords are decoded once": environmentPassword,
  "environment targets never inherit a previous password": environmentReplacement,
}
const run = scenarios[process.argv[2] ?? ""]
assert(run, "Unknown fixture scenario")
await run()
