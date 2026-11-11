import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { SQL } from "bun"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir, userInfo } from "node:os"
import { join } from "node:path"
import type { DatabaseTable } from "../packages/feature-database/src/model/types"
import { nativeReadOnlyQuery } from "../packages/feature-database/src/services/read-only-query"

// An explicitly enabled, owned local server complements the Docker matrix.
// Never attach to an existing socket, data directory, or configured database.
const enabled = process.env.TUIMINAL_LOCAL_MYSQL_INTEGRATION === "1"
const suite = describe.skipIf(!enabled)
let root = ""
let server: ReturnType<typeof Bun.spawn> | undefined
let admin: SQL | undefined
let api: typeof import("../packages/feature-database/src/services/database") | undefined
let connectionId = ""
const table: DatabaseTable = { schema: "tuiminal_test", name: "items", type: "table" }

suite("owned local MySQL recovery", () => {
  beforeAll(async () => {
    const executable = Bun.which("mysqld")
    if (!executable) throw new Error("Local MySQL validation requires mysqld")
    root = mkdtempSync(join(tmpdir(), "tuiminal-mysql-recovery-"))
    const initialized = Bun.spawnSync(
      [
        executable,
        "--no-defaults",
        "--initialize-insecure",
        `--user=${userInfo().username}`,
        `--datadir=${root}`,
        `--log-error=${join(root, "server.log")}`,
      ],
      { stdout: "pipe", stderr: "pipe", timeout: 60_000 },
    )
    if (initialized.exitCode !== 0) throw new Error(initialized.stderr.toString())
    const portReservation = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
    const port = portReservation.port
    portReservation.stop(true)
    server = Bun.spawn(
      [
        executable,
        "--no-defaults",
        `--user=${userInfo().username}`,
        `--datadir=${root}`,
        `--socket=${join(root, "mysql.sock")}`,
        `--pid-file=${join(root, "mysql.pid")}`,
        `--log-error=${join(root, "server.log")}`,
        "--bind-address=127.0.0.1",
        `--port=${port}`,
        "--mysqlx=0",
        "--skip-log-bin",
      ],
      { stdout: "ignore", stderr: "pipe" },
    )
    admin = new SQL({
      adapter: "mysql",
      hostname: "127.0.0.1",
      port,
      username: "root",
      password: "",
      database: "mysql",
      tls: false,
    })
    const deadline = Date.now() + 30_000
    while (true) {
      try {
        await admin.unsafe("SELECT 1")
        break
      } catch (error) {
        if (server.exitCode !== null || Date.now() >= deadline)
          throw new Error(`${error}\n${readFileSync(join(root, "server.log"), "utf8")}`)
        await Bun.sleep(50)
      }
    }
    await admin.unsafe("CREATE DATABASE tuiminal_test")
    await admin.unsafe("CREATE USER 'tuiminal_fixture'@'127.0.0.1' IDENTIFIED BY ''")
    await admin.unsafe("GRANT ALL ON tuiminal_test.* TO 'tuiminal_fixture'@'127.0.0.1'")
    api = await import("../packages/feature-database/src/services/database")
    const result = await api.addDatabaseConnection(
      {
        name: "Owned local MySQL",
        driver: "mysql",
        host: "127.0.0.1",
        port,
        database: "tuiminal_test",
        username: "tuiminal_fixture",
        ssl: false,
        writeEnabled: true,
      },
      "",
      false,
    )
    connectionId = result.profile.id
    await api.executeDatabaseQuery(
      connectionId,
      "CREATE TABLE items (id INTEGER PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE) ENGINE=InnoDB",
      true,
    )
    await api.executeDatabaseQuery(
      connectionId,
      "INSERT INTO items VALUES (1, 'original'), (2, 'second')",
      true,
    )
  }, 90_000)

  afterAll(async () => {
    try {
      if (connectionId) await api?.removeDatabaseConnection(connectionId)
      await admin?.close()
    } finally {
      if (server) {
        if (server.exitCode === null) server.kill("SIGTERM")
        const deadline = setTimeout(() => server?.kill("SIGKILL"), 10_000)
        try {
          await server.exited
        } finally {
          clearTimeout(deadline)
        }
      }
      if (root) rmSync(root, { recursive: true, force: true })
    }
  }, 20_000)

  function database() {
    if (!api) throw new Error("MySQL fixture was not initialized")
    return api
  }
  const read = () =>
    database().executeDatabaseQuery(connectionId, "SELECT id, name FROM items ORDER BY id", true)

  test("rolls back the complete failed batch, rejects stale snapshots and commits a reviewed retry", async () => {
    const api = database()
    const columns = await api.loadDatabaseTableColumns(connectionId, table)
    const update = {
      table,
      columns,
      mutation: { kind: "update" as const, rowKey: { id: 1 }, values: { name: "updated" } },
      originalRow: { id: 1, name: "original" },
    }
    await expect(
      api.applyTableMutations(connectionId, [
        update,
        {
          table,
          columns,
          mutation: { kind: "insert", values: { id: 3, name: "second" } },
          originalRow: null,
        },
      ]),
    ).rejects.toThrow()
    expect((await read()).rows).toEqual([
      { id: 1, name: "original" },
      { id: 2, name: "second" },
    ])
    await api.executeDatabaseQuery(
      connectionId,
      "UPDATE items SET name = 'concurrent' WHERE id = 1",
      true,
    )
    await expect(api.applyTableMutations(connectionId, [update])).rejects.toThrow()
    expect((await read()).rows[0]).toEqual({ id: 1, name: "concurrent" })
    await api.applyTableMutations(connectionId, [
      { ...update, originalRow: { id: 1, name: "concurrent" } },
    ])
    expect((await read()).rows[0]).toEqual({ id: 1, name: "updated" })
  })

  test("cancellation retires the query and the connection remains reusable", async () => {
    const api = database()
    const controller = new AbortController()
    const pending = api.executeDatabaseQuery(connectionId, "SELECT SLEEP(30)", true, {
      signal: controller.signal,
    })
    const timer = setTimeout(() => controller.abort(), 100)
    try {
      await expect(pending).rejects.toBeInstanceOf(api.DatabaseQueryCancelledError)
    } finally {
      clearTimeout(timer)
    }
    expect((await read()).rows).toHaveLength(2)
  }, 15_000)

  test("native read-only protection rejects writes and restores the writable session", async () => {
    const api = database()
    const client = await api.getNativeClient(api.connectionProfile(connectionId))
    const before = (await read()).rows
    await expect(
      Promise.resolve(nativeReadOnlyQuery(client, "DELETE FROM items", "mysql")),
    ).rejects.toThrow()
    expect((await read()).rows).toEqual(before)
    await api.executeDatabaseQuery(
      connectionId,
      "INSERT INTO items VALUES (3, 'after-read-only')",
      true,
    )
    expect((await read()).rows).toHaveLength(3)
  })

  test("a dropped server connection rejects the in-flight read and a new query recovers", async () => {
    const control = admin
    if (!control) throw new Error("MySQL fixture was not initialized")
    const controller = new AbortController()
    const pending = database().executeDatabaseQuery(
      connectionId,
      "SELECT SLEEP(30) /* tuiminal-owned-drop */",
      true,
      { signal: controller.signal },
    )
    const outcome = pending.then(
      () => "unexpected-success",
      () => "rejected",
    )
    try {
      const deadline = Date.now() + 5_000
      let id: number | undefined
      while (Date.now() < deadline) {
        const rows = await control.unsafe(
          "SELECT ID FROM information_schema.PROCESSLIST WHERE USER = 'tuiminal_fixture' AND INFO LIKE '%tuiminal-owned-drop%'",
        )
        id = rows[0] ? Number(rows[0].ID) : undefined
        if (id) break
        await Bun.sleep(10)
      }
      if (!id || !Number.isSafeInteger(id)) throw new Error("Owned query did not reach MySQL")
      await control.unsafe(`KILL CONNECTION ${id}`)
      expect(await outcome).toBe("rejected")
      expect((await read()).rows).toHaveLength(3)
    } finally {
      controller.abort()
      await outcome
    }
  }, 15_000)
})
