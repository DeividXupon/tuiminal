import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { InputRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { DatabaseViewer } from "../../packages/feature-database/src/DatabaseWorkspace"
import * as service from "../../packages/feature-database/src/services/database"
import * as external from "../../packages/feature-database/src/services/external-database-connections"

let tui: TestRendererSetup | undefined
const roots: string[] = []
const restore: Array<() => void> = []
const originalDiscovery = external.discoverExternalDatabaseConnections
const discoverySetting = process.env.TUIMINAL_DATABASE_EXTERNAL_DISCOVERY

function discovery(files: Record<string, string>, loginPaths = "", mode = 0o600) {
  const home = mkdtempSync(join(tmpdir(), "tuiminal-discovery-ui-"))
  roots.push(home)
  for (const [name, content] of Object.entries(files)) {
    const path = join(home, name)
    writeFileSync(path, content, { mode })
    chmodSync(path, mode)
  }
  process.env.TUIMINAL_DATABASE_EXTERNAL_DISCOVERY = "1"
  const spy = spyOn(external, "discoverExternalDatabaseConnections").mockImplementation((options) =>
    originalDiscovery({
      home,
      platform: "linux",
      effectiveUserId: process.geteuid?.() ?? 0,
      environment: {},
      runMysqlConfigEditor: async () => loginPaths,
      ...options,
    }),
  )
  restore.push(() => spy.mockRestore())
  return spy
}

afterEach(async () => {
  await act(async () => tui?.renderer.destroy())
  tui = undefined
  for (const undo of restore.splice(0).reverse()) undo()
  external.clearExternalDatabaseConnections()
  if (discoverySetting === undefined) delete process.env.TUIMINAL_DATABASE_EXTERNAL_DISCOVERY
  else process.env.TUIMINAL_DATABASE_EXTERNAL_DISCOVERY = discoverySetting
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function settle(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await act(async () => {
      await Bun.sleep(10)
      await tui?.renderOnce()
    })
    if (predicate()) return
  }
  throw new Error(`Discovery UI did not settle:\n${tui?.captureCharFrame()}`)
}

async function key(name: string, options: { ctrl?: boolean } = {}) {
  await act(async () => tui?.mockInput.pressKey(name, options))
  await tui?.renderOnce()
}

function input(id: string) {
  const element = tui?.renderer.root.findDescendantById(id)
  if (!(element instanceof InputRenderable)) throw new Error(`Missing input ${id}`)
  return element
}

async function mount() {
  await act(async () => {
    tui = await testRender(<DatabaseViewer active />, { width: 110, height: 38 })
  })
}

test("opens named MySQL profiles and keeps the discovered password when completing a database", async () => {
  discovery({
    ".my.cnf":
      "[client_dev]\nhost=dev.test\nuser=dev_user\npassword=dev-secret\n" +
      "[client_test]\nhost=test.test\nuser=test_user\npassword=test-secret\n",
  })
  const connectionTest = spyOn(service, "testDatabaseConnection").mockResolvedValue(undefined)
  restore.push(() => connectionTest.mockRestore())
  await mount()
  await settle(() => Boolean(tui?.captureCharFrame().includes(".my.cnf · client_test")))
  expect(tui?.captureCharFrame()).toContain(".my.cnf · client_dev")
  expect(tui?.captureCharFrame()).not.toContain("NOVA CONEXÃO")
  await key("RETURN")
  await settle(() => Boolean(tui?.captureCharFrame().includes("COMPLETAR CONEXÃO EXTERNA")))
  expect(input("db-connection-host").value).toBe("dev.test")
  expect(input("db-connection-username").value).toBe("dev_user")
  expect(tui?.captureCharFrame()).not.toContain("dev-secret")
  await act(async () => {
    input("db-connection-database").focus()
    tui?.mockInput.typeText("dev_db")
  })
  await key("r", { ctrl: true })
  await settle(() => connectionTest.mock.calls.length === 1)
  expect(connectionTest.mock.calls[0]).toEqual([
    expect.objectContaining({ database: "dev_db", host: "dev.test" }),
    "dev-secret",
  ])
  await key("ESCAPE")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id !== "db-connection-database")
  await key("ESCAPE")
  await settle(() => Boolean(tui?.renderer.root.findDescendantById("database-connection-list")))
  await key("ESCAPE")
  await settle(() => Boolean(tui?.captureCharFrame().includes("Conexões externas encontradas")))
  expect(tui?.captureCharFrame()).toContain("Conexões externas encontradas")
  expect(tui?.captureCharFrame()).not.toContain("Nenhuma conexão configurada")
  await key("c")
  await settle(() => Boolean(tui?.captureCharFrame().includes(".my.cnf · client_test")))
})

test.each([
  ["PostgreSQL service · dev", { ".pg_service.conf": "[dev]\nuser=dev\npassword=pg-secret\n" }, ""],
  [".pgpass · pg.test/app", { ".pgpass": "pg.test:5432:app:dev:pg-secret\n" }, ""],
  ["MySQL login · dev", {}, "[dev]\nhost=dev.test\nuser=dev\npassword=*****\n"],
] as const)("shows incomplete %s in the initial manager", async (name, files, loginPaths) => {
  discovery(files, loginPaths, 0o644)
  await mount()
  await settle(() => Boolean(tui?.captureCharFrame().includes(name)))
  expect(tui?.captureCharFrame()).not.toContain("NOVA CONEXÃO")
  await key("RETURN")
  await settle(() => Boolean(tui?.captureCharFrame().includes("COMPLETAR CONEXÃO EXTERNA")))
  expect(tui?.captureCharFrame()).not.toContain("pg-secret")
})

test("shows discovery warnings even when no profiles could be loaded", async () => {
  discovery({ ".my.cnf": "!include /not-read-by-this-test.cnf\n" })
  await mount()
  await settle(() => Boolean(tui?.captureCharFrame().includes("não são seguidas")))
  expect(tui?.captureCharFrame()).not.toContain("NOVA CONEXÃO")
  await key("c")
  await settle(() => Boolean(tui?.captureCharFrame().includes("NOVA CONEXÃO")))
})

test("waits for discovery before claiming no connections are configured", async () => {
  const spy = discovery({})
  let release = () => {}
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  const result = {
    profiles: [],
    candidates: [],
    credentials: new Map<string, string>(),
    warnings: [],
  }
  spy.mockImplementationOnce(async () => {
    await pending
    return result
  })
  try {
    await mount()
    await settle(() => Boolean(tui?.captureCharFrame().includes("Lendo configurações de banco…")))
    expect(tui?.captureCharFrame()).not.toContain("Nenhuma conexão configurada")
    expect(tui?.captureCharFrame()).not.toContain("NOVA CONEXÃO")
    release()
    await settle(() => Boolean(tui?.captureCharFrame().includes("NOVA CONEXÃO")))
  } finally {
    release()
  }
})
