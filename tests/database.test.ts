import { afterAll, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { clearHistoryContent } from "../src/features/database/services/history-content"

const originalConfigRoot = process.env.XDG_CONFIG_HOME
const configRoot = mkdtempSync(join(tmpdir(), "tuiminal-database-test-"))
const settingsDirectory = join(configRoot, "tuiminal")
const writableDatabasePath = join(configRoot, "one.sqlite")
const secondDatabasePath = join(configRoot, "two.sqlite")
const readOnlyDatabasePath = join(configRoot, "read.sqlite")
process.env.XDG_CONFIG_HOME = configRoot

function createFixtureDatabase(filename: string, userCount: number) {
  const database = new Database(filename, { create: true, strict: true })
  database.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      password TEXT,
      bio TEXT,
      payload BLOB,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX idx_users_email ON users(email);
    CREATE INDEX idx_users_name ON users(name);
    CREATE TABLE memberships (
      tenant_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      label TEXT,
      PRIMARY KEY (tenant_id, code)
    );
    CREATE TABLE audit_log (
      message TEXT,
      created_at TEXT
    );
    CREATE TABLE empty_defaults (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      enabled INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL
    );
  `)
  const insertUser = database.query(`
    INSERT INTO users (name, email, password, bio, payload, active)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const insertUsers = database.transaction((count: number) => {
    for (let index = 1; index <= count; index += 1) {
      insertUser.run(
        `User ${String(index).padStart(4, "0")}`,
        `user${index}@example.test`,
        `secret-${index}`,
        `Biography ${index} ${"x".repeat(280)}`,
        new Uint8Array([index % 255, 2, 3, 4]),
        index % 3 === 0 ? 0 : 1,
      )
    }
  })
  insertUsers(userCount)
  database.exec(`
    INSERT INTO memberships (tenant_id, code, label)
    VALUES (1, 'admin', 'Administrator'), (1, 'viewer', 'Viewer'), (2, 'admin', 'Other');
    INSERT INTO audit_log (message, created_at) VALUES ('created', '2026-01-01');
    CREATE VIEW active_users AS
      SELECT id, name, email FROM users WHERE active = 1;
  `)
  database.close()
}

function writeFixtureSettings() {
  mkdirSync(settingsDirectory, { recursive: true })
  writeFileSync(
    join(settingsDirectory, "databases.json"),
    JSON.stringify({
      version: 1,
      defaultConnectionId: "write-one",
      connections: [
        {
          id: "write-one",
          name: "Writable one",
          driver: "sqlite",
          source: "saved",
          filename: writableDatabasePath,
          ssl: false,
          writeEnabled: true,
        },
        {
          id: "write-two",
          name: "Writable two",
          driver: "sqlite",
          source: "saved",
          filename: secondDatabasePath,
          ssl: false,
          writeEnabled: true,
        },
        {
          id: "read-only",
          name: "Read only",
          driver: "sqlite",
          source: "saved",
          filename: readOnlyDatabasePath,
          ssl: false,
          writeEnabled: false,
        },
      ],
      savedQueries: {},
    }),
  )
}

createFixtureDatabase(writableDatabasePath, 620)
createFixtureDatabase(secondDatabasePath, 4)
createFixtureDatabase(readOnlyDatabasePath, 8)
writeFixtureSettings()

const {
  addDatabaseConnection,
  applyTableMutations,
  awaitCancelableDatabaseQuery,
  closeDatabaseConnection,
  clearLegacyDatabaseQueryHistoryContent,
  coerceDatabaseCellValue,
  databaseConnectionCanWrite,
  databaseQueryHistoryEntryIsRead,
  databaseQueryHistoryParameterPreview,
  databaseQueryHistoryCanRerun,
  databaseSavedQueryIsDirty,
  deleteTableRow,
  executeDatabaseQuery,
  filterDatabaseQueryHistory,
  getDefaultDatabaseConnectionId,
  insertTableRow,
  listDatabaseConnections,
  listDatabaseQueryHistory,
  listDatabaseSavedQueries,
  listDatabaseTables,
  loadDatabaseTableColumns,
  loadDatabaseTableStructure,
  loadTableIndexes,
  loadTablePage,
  previewDatabaseQuery,
  profileFromDraft,
  previewDatabaseTablePageQuery,
  previewTableMutation,
  removeDatabaseConnection,
  removeDatabaseSavedQuery,
  retainDatabaseQueryHistory,
  normalizeQueryHistoryEntry,
  readSettings,
  writeSettings,
  saveDatabaseQuery,
  setDefaultDatabaseConnection,
  testDatabaseConnection,
  updateDatabaseConnection,
  updateTableRow,
  DatabaseQueryCancelledError,
  DATABASE_QUERY_HISTORY_CHANGE_RETENTION_DAYS,
} = await import("../src/features/database/services/database")
const { DEFAULT_SENSITIVE_TERMS, setActiveSensitiveTerms } = await import(
  "../src/shared/security/sensitive-data"
)

afterAll(async () => {
  await closeDatabaseConnection()
  if (originalConfigRoot === undefined) delete process.env.XDG_CONFIG_HOME
  else process.env.XDG_CONFIG_HOME = originalConfigRoot
  rmSync(configRoot, { recursive: true, force: true })
})

describe("database query safety", () => {
  test("does not inherit an existing connection's identity when copying a draft", () => {
    const original = listDatabaseConnections().find((profile) => profile.id === "write-one")
    if (!original) throw new Error("Missing fixture")
    const copy = profileFromDraft({ ...original, writeEnabled: false })
    expect(copy.id).not.toBe(original.id)
    expect(copy.writeEnabled).toBe(false)
    expect(profileFromDraft(original, "explicit-new-id").id).toBe("explicit-new-id")
  })
  test("cancels a running native query through its real query handle", async () => {
    let cancelled = false
    let rejectQuery: (error: Error) => void = () => undefined
    const promise = new Promise<unknown>((_resolve, reject) => {
      rejectQuery = reject
    })
    void promise.catch(() => undefined)
    const query = Object.assign(promise, {
      execute: () => query,
      cancel: () => {
        cancelled = true
        rejectQuery(new Error("driver cancelled"))
        return query
      },
    })
    const controller = new AbortController()
    const pending = awaitCancelableDatabaseQuery(query, controller.signal)
    const observed = pending.catch((error: unknown) => error)
    controller.abort()

    expect(await observed).toBeInstanceOf(DatabaseQueryCancelledError)
    expect(cancelled).toBe(true)
  })

  test("returns cancellation immediately and invokes the connection fallback", async () => {
    let cancelled = false
    let forceClosed = false
    const neverSettles = new Promise<unknown>(() => undefined)
    const query = Object.assign(neverSettles, {
      execute: () => query,
      cancel: () => {
        cancelled = true
        return query
      },
    })
    const controller = new AbortController()
    const pending = awaitCancelableDatabaseQuery(query, controller.signal, () => {
      forceClosed = true
    })
    controller.abort()

    await expect(pending).rejects.toBeInstanceOf(DatabaseQueryCancelledError)
    expect(cancelled).toBe(true)
    expect(forceClosed).toBe(true)
  })

  test("normalizes a single read query", () => {
    expect(previewDatabaseQuery("read-only", " SELECT * FROM users; ")).toEqual({
      sql: "SELECT * FROM users",
      command: "SELECT",
      mutating: false,
    })
  })

  test("classifies writes and enforces read-only connections", () => {
    expect(previewDatabaseQuery("write-one", "UPDATE users SET active = 1")).toMatchObject({
      command: "UPDATE",
      mutating: true,
    })
    expect(() => previewDatabaseQuery("read-only", "DELETE FROM users WHERE id = 1")).toThrow(
      "somente leitura",
    )
  })

  test("does not misclassify SQLite setting PRAGMAs as reads", async () => {
    expect(previewDatabaseQuery("write-one", "PRAGMA user_version = 7").mutating).toBe(true)
    expect(() => previewDatabaseQuery("read-only", "PRAGMA user_version = 7")).toThrow(
      "somente leitura",
    )
    await expect(executeDatabaseQuery("read-only", "PRAGMA user_version = 7")).rejects.toThrow(
      "somente leitura",
    )
    expect((await executeDatabaseQuery("read-only", "PRAGMA user_version")).rows[0]).toEqual({
      user_version: 0,
    })
    const result = await executeDatabaseQuery("write-one", "PRAGMA user_version = 7")
    expect(result.mutating).toBe(true)
    expect((await executeDatabaseQuery("write-one", "PRAGMA user_version")).rows[0]).toEqual({
      user_version: 7,
    })
    await executeDatabaseQuery("write-one", "PRAGMA user_version = 0")
  })

  test("rejects multiple or incomplete statements", () => {
    expect(() => previewDatabaseQuery("write-one", "SELECT 1; SELECT 2")).toThrow(
      "um comando SQL por vez",
    )
    expect(() => previewDatabaseQuery("write-one", "SELECT 'unfinished")).toThrow("incompleto")
  })

  test("accepts delimiters inside strings, comments, and dollar quotes", () => {
    expect(previewDatabaseQuery("read-only", "SELECT ';' AS value;")).toMatchObject({
      sql: "SELECT ';' AS value",
      mutating: false,
    })
    expect(previewDatabaseQuery("read-only", "/* ; */ SELECT 1")).toMatchObject({
      command: "SELECT",
      mutating: false,
    })
    expect(previewDatabaseQuery("write-one", "SELECT $$a;b$$ AS value")).toMatchObject({
      command: "SELECT",
      mutating: false,
    })
  })

  test("classifies CTEs and SELECT INTO conservatively", () => {
    expect(
      previewDatabaseQuery(
        "read-only",
        "WITH active AS (SELECT * FROM users) SELECT * FROM active",
      ),
    ).toMatchObject({ command: "WITH", mutating: false })
    expect(() =>
      previewDatabaseQuery(
        "read-only",
        "WITH removed AS (DELETE FROM users RETURNING *) SELECT * FROM removed",
      ),
    ).toThrow("somente leitura")
    expect(() => previewDatabaseQuery("read-only", "SELECT * INTO backup FROM users")).toThrow(
      "SELECT INTO",
    )
  })

  test("rejects empty, oversized, and missing-connection queries", () => {
    expect(() => previewDatabaseQuery("read-only", " ")).toThrow("Digite um comando SQL")
    expect(() => previewDatabaseQuery("read-only", `SELECT '${"x".repeat(100_001)}'`)).toThrow(
      "100 mil caracteres",
    )
    expect(() => previewDatabaseQuery("missing", "SELECT 1")).toThrow("não existe mais")
  })
})

describe("saved database queries", () => {
  test("detects unsaved changes in an active favorite", () => {
    const query = {
      id: "favorite",
      name: "Favorite",
      sql: "SELECT 1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }
    expect(databaseSavedQueryIsDirty(query, "SELECT 1")).toBe(false)
    expect(databaseSavedQueryIsDirty(query, "SELECT 2")).toBe(true)
    expect(databaseSavedQueryIsDirty(null, "SELECT 2")).toBe(false)
  })

  test("keeps favorites isolated by connection target", () => {
    const saved = saveDatabaseQuery("write-one", {
      name: "Active users",
      sql: "SELECT * FROM users WHERE active = 1",
    })

    expect(listDatabaseSavedQueries("write-one")).toContainEqual(saved)
    expect(listDatabaseSavedQueries("write-two")).toEqual([])
    expect(removeDatabaseSavedQuery("write-one", saved.id)).toBe(true)
    expect(listDatabaseSavedQueries("write-one")).toEqual([])
    expect(removeDatabaseSavedQuery("write-one", saved.id)).toBe(false)
  })

  test("validates, updates, and sorts favorite queries", async () => {
    expect(() => saveDatabaseQuery("write-one", { name: "", sql: "SELECT 1" })).toThrow("nome")
    expect(() => saveDatabaseQuery("write-one", { name: "Empty", sql: "" })).toThrow("query")

    const first = saveDatabaseQuery("write-one", { name: "First", sql: "SELECT 1" })
    await new Promise((resolve) => setTimeout(resolve, 2))
    const second = saveDatabaseQuery("write-one", { name: "Second", sql: "SELECT 2" })
    expect(listDatabaseSavedQueries("write-one").map((query) => query.id)).toEqual([
      second.id,
      first.id,
    ])

    const updated = saveDatabaseQuery("write-one", {
      id: first.id,
      name: "First updated",
      sql: "SELECT 10",
    })
    expect(updated.createdAt).toBe(first.createdAt)
    expect(listDatabaseSavedQueries("write-one")[0]).toMatchObject({
      id: first.id,
      name: "First updated",
      sql: "SELECT 10",
    })

    expect(removeDatabaseSavedQuery("write-one", first.id)).toBe(true)
    expect(removeDatabaseSavedQuery("write-one", second.id)).toBe(true)
  })
})

describe("SQLite catalog and data browsing", () => {
  const usersTable = { schema: "main", name: "users", type: "table" as const }
  const membershipsTable = {
    schema: "main",
    name: "memberships",
    type: "table" as const,
  }

  test("loads tables and views without exposing SQLite internals", async () => {
    const catalog = await listDatabaseTables("write-one")

    expect(catalog.databaseName).toBe("one.sqlite")
    expect(catalog.tables).toContainEqual(usersTable)
    expect(catalog.tables).toContainEqual({
      schema: "main",
      name: "active_users",
      type: "view",
    })
    expect(catalog.tables.some((table) => table.name.startsWith("sqlite_"))).toBe(false)
  })

  test("maps SQLite schema metadata and composite primary keys", async () => {
    const userColumns = await loadDatabaseTableColumns("write-one", usersTable)
    expect(userColumns.find((column) => column.field === "id")).toMatchObject({
      type: "INTEGER",
      nullable: false,
      key: "PRI",
    })
    expect(userColumns.find((column) => column.field === "email")).toMatchObject({
      nullable: true,
      key: "",
      defaultValue: null,
    })
    expect(userColumns.find((column) => column.field === "active")?.defaultValue).toBe("1")

    const membershipColumns = await loadDatabaseTableColumns("write-one", membershipsTable)
    expect(
      membershipColumns.filter((column) => column.key === "PRI").map((column) => column.field),
    ).toEqual(["tenant_id", "code"])
  })

  test("paginates deterministically and clamps unsafe bounds", async () => {
    const first = await loadTablePage("write-one", usersTable, -100, 0)
    expect(first.rows).toHaveLength(1)
    expect(first.rows[0]?.id).toBe(1)
    expect(first.hasMore).toBe(true)

    const middle = await loadTablePage("write-one", usersTable, 50, 500)
    expect(middle.rows).toHaveLength(50)
    expect(middle.rows[0]?.id).toBe(51)
    expect(middle.rows.at(-1)?.id).toBe(100)
    expect(middle.hasMore).toBe(true)

    const last = await loadTablePage("write-one", usersTable, 600, 50)
    expect(last.rows).toHaveLength(20)
    expect(last.rows[0]?.id).toBe(601)
    expect(last.hasMore).toBe(false)
  })

  test("records table rendering without recording internal catalog queries", async () => {
    const historyBefore = listDatabaseQueryHistory("write-one")

    await listDatabaseTables("write-one")
    await loadDatabaseTableColumns("write-one", usersTable)
    await loadTablePage("write-one", usersTable, 0, 5)
    expect(listDatabaseQueryHistory("write-one")).toEqual(historyBefore)

    const page = await loadTablePage(
      "write-one",
      usersTable,
      10,
      5,
      false,
      { search: "User", sort: { column: "id", direction: "desc" } },
      { recordHistory: true },
    )
    const recorded = listDatabaseQueryHistory("write-one")[0]

    expect(page.rows).toHaveLength(5)
    expect(recorded).toMatchObject({
      command: "SELECT",
      status: "success",
      rowCount: 5,
      affectedRows: null,
      rerunnable: true,
    })
    expect(recorded?.sql).toContain('FROM "users"')
    expect(recorded?.sql).toContain("LIKE LOWER('%User%')")
    expect(recorded?.sql).toContain('ORDER BY "id" DESC')
    if (!recorded) throw new Error("Expected the rendered table query in history")
    expect(databaseQueryHistoryCanRerun(recorded)).toBe(true)
  })

  test("masks sensitive values and formats long or binary fields", async () => {
    const hidden = await loadTablePage("write-one", usersTable, 0, 5)
    expect(hidden.rows[0]).toMatchObject({
      email: "<mascarado>",
      password: "<mascarado>",
      payload: "<binário 4 bytes>",
    })
    expect(String(hidden.rows[0]?.bio)).toHaveLength(240)
    expect(hidden.rowKeys[0]).toEqual({ id: 1 })
    expect(Object.keys(hidden.rows[0] ?? {}).some((key) => key.startsWith("__tuiminal"))).toBe(
      false,
    )

    const revealed = await loadTablePage("write-one", usersTable, 0, 1, true)
    expect(revealed.rows[0]).toMatchObject({
      email: "user1@example.test",
      password: "secret-1",
      payload: "<binário 4 bytes>",
    })
  })

  test("loads index definitions and uniqueness", async () => {
    const indexes = await loadTableIndexes("write-one", usersTable)

    expect(indexes).toContainEqual({
      name: "idx_users_email",
      unique: true,
      definition: "email",
    })
    expect(indexes).toContainEqual({
      name: "idx_users_name",
      unique: false,
      definition: "name",
    })
  })

  test("loads DDL, constraints, indexes, and both relationship directions", async () => {
    const users = await loadDatabaseTableStructure("write-one", usersTable)
    expect(users.ddl).toContain("CREATE TABLE users")
    expect(users.constraints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "PRIMARY KEY" }),
        expect.objectContaining({ type: "CHECK", definition: expect.stringContaining("active") }),
        expect.objectContaining({ name: "idx_users_email", type: "UNIQUE" }),
      ]),
    )
    expect(users.indexes).toContainEqual({
      name: "idx_users_name",
      unique: false,
      definition: "name",
    })
    expect(users.relationships).toContainEqual(
      expect.objectContaining({
        direction: "incoming",
        relatedTable: "posts",
        columns: ["id"],
        relatedColumns: ["user_id"],
        onDelete: "CASCADE",
      }),
    )

    const posts = await loadDatabaseTableStructure("write-one", {
      schema: "main",
      name: "posts",
      type: "table",
    })
    expect(posts.relationships).toContainEqual(
      expect.objectContaining({
        direction: "outgoing",
        relatedTable: "users",
        columns: ["user_id"],
        relatedColumns: ["id"],
      }),
    )
  })

  test("handles concurrent catalog and page reads consistently", async () => {
    const pages = await Promise.all(
      Array.from({ length: 40 }, (_item, index) =>
        loadTablePage("write-one", usersTable, index * 5, 5),
      ),
    )

    expect(pages).toHaveLength(40)
    expect(pages.every((page) => page.rows.length === 5)).toBe(true)
    expect(pages.map((page) => page.rows[0]?.id)).toEqual(
      Array.from({ length: 40 }, (_item, index) => index * 5 + 1),
    )
  })

  test("searches similar values across every column and sorts the result", async () => {
    const table = { schema: "main", name: "users", type: "table" as const }
    const columns = await loadDatabaseTableColumns("write-one", table)
    const query = {
      search: "USER 000",
      sort: { column: "id", direction: "desc" as const },
    }

    const sql = previewDatabaseTablePageQuery("write-one", table, columns, 0, 10, false, query)
    expect(sql).toContain("WHERE (LOWER(CAST(\"id\" AS TEXT)) LIKE LOWER('%USER 000%')")
    expect(sql).toContain("OR LOWER(CAST(\"name\" AS TEXT)) LIKE LOWER('%USER 000%')")
    expect(sql).toContain('ORDER BY "id" DESC')
    expect(sql).toContain("LIMIT 11 OFFSET 0")

    const page = await loadTablePage("write-one", table, 0, 10, false, query)
    expect(page.rows.map((row) => row.id)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1])
    expect(page.hasMore).toBe(false)
  })

  test("escapes wildcard and quoted search text instead of treating it as SQL", async () => {
    const table = { schema: "main", name: "users", type: "table" as const }
    const columns = await loadDatabaseTableColumns("write-one", table)
    const patternSql = previewDatabaseTablePageQuery("write-one", table, columns, 0, 5, false, {
      search: "50%_!",
      sort: null,
    })
    expect(patternSql).toContain("LIKE LOWER('%50!%!_!!%') ESCAPE '!'")

    const injectionSql = previewDatabaseTablePageQuery("write-one", table, columns, 0, 5, false, {
      search: "x' OR 1=1 --",
      sort: null,
    })
    expect(injectionSql).toContain("LIKE LOWER('%x'' OR 1=1 --%')")
    const page = await loadTablePage("write-one", table, 0, 5, false, {
      search: "x' OR 1=1 --",
      sort: null,
    })
    expect(page.rows).toEqual([])
  })

  test("validates visual sorting and omits search SQL for blank text", async () => {
    const table = { schema: "main", name: "users", type: "table" as const }
    const columns = await loadDatabaseTableColumns("write-one", table)
    const blankSql = previewDatabaseTablePageQuery("write-one", table, columns, 0, 5, false, {
      search: "   ",
      sort: null,
    })
    expect(blankSql).not.toContain("WHERE")
    expect(() =>
      previewDatabaseTablePageQuery("write-one", table, columns, 0, 5, false, {
        search: "",
        sort: { column: "missing_column", direction: "asc" },
      }),
    ).toThrow("ordenação não existe")
    expect(() =>
      previewDatabaseTablePageQuery("write-one", table, columns, 0, 5, false, {
        search: "",
        sort: { column: "id", direction: "DROP TABLE users" as "asc" },
      }),
    ).toThrow("direção de ordenação é inválida")
  })
})

describe("SQL execution", () => {
  test("caps reads at 100 while retaining changes for at least six months", () => {
    const now = Date.parse("2026-09-03T12:00:00.000Z")
    const day = 24 * 60 * 60 * 1_000
    const historyEntry = (id: string, sql: string, ageMs: number) => ({
      id,
      connectionId: "history-retention",
      connectionScope: "sqlite::history-retention",
      connectionName: "History retention",
      driver: "sqlite" as const,
      sql,
      command: sql.match(/^\w+/)?.[0]?.toLocaleUpperCase() ?? "SQL",
      status: "success" as const,
      executedAt: new Date(now - ageMs).toISOString(),
      durationMs: 1,
      rowCount: 1,
      affectedRows: null,
      error: null,
      rerunnable: true,
      parameterPreview: [],
    })
    const reads = Array.from({ length: 105 }, (_item, index) =>
      historyEntry(`read-${index}`, `SELECT ${index}`, index * 1_000),
    )
    const recentCreate = historyEntry(
      "recent-create",
      "CREATE TABLE retained (id INTEGER)",
      DATABASE_QUERY_HISTORY_CHANGE_RETENTION_DAYS * day,
    )
    const recentDelete = historyEntry(
      "recent-delete",
      "DELETE FROM retained WHERE id = 1",
      (DATABASE_QUERY_HISTORY_CHANGE_RETENTION_DAYS - 1) * day,
    )
    const expiredInsert = historyEntry(
      "expired-insert",
      "INSERT INTO retained (id) VALUES (1)",
      (DATABASE_QUERY_HISTORY_CHANGE_RETENTION_DAYS + 1) * day,
    )

    const retained = retainDatabaseQueryHistory(
      [...reads, expiredInsert, recentCreate, recentDelete],
      now,
    )

    expect(retained.filter(databaseQueryHistoryEntryIsRead)).toHaveLength(100)
    expect(retained.some((entry) => entry.id === "read-99")).toBe(true)
    expect(retained.some((entry) => entry.id === "read-100")).toBe(false)
    expect(retained.some((entry) => entry.id === "recent-create")).toBe(true)
    expect(retained.some((entry) => entry.id === "recent-delete")).toBe(true)
    expect(retained.some((entry) => entry.id === "expired-insert")).toBe(false)
    expect(filterDatabaseQueryHistory(retained, false)).toEqual(
      retained.filter((entry) => !databaseQueryHistoryEntryIsRead(entry)),
    )
    expect(
      filterDatabaseQueryHistory(retained, false).every(
        (entry) => !databaseQueryHistoryEntryIsRead(entry),
      ),
    ).toBe(true)
    expect(filterDatabaseQueryHistory(retained, true)).toEqual(retained)
    expect(
      databaseQueryHistoryEntryIsRead(
        historyEntry("cte-read", "WITH items AS (SELECT 1) SELECT * FROM items", 0),
      ),
    ).toBe(true)
  })

  test("labels history parameters while permanently masking sensitive columns", () => {
    const preview = databaseQueryHistoryParameterPreview(
      ["Visible name", "super-secret", 42, new Uint8Array([1, 2, 3])],
      ["name", "password", "id", "payload"],
    )

    expect(preview).toEqual([
      { position: 1, name: "name", value: '"Visible name"', masked: false },
      { position: 2, name: "password", value: "<mascarado>", masked: true },
      { position: 3, name: "id", value: "42", masked: false },
      { position: 4, name: "payload", value: "Uint8Array(3 bytes)", masked: false },
    ])
    expect(JSON.stringify(preview)).not.toContain("super-secret")

    setActiveSensitiveTerms([])
    try {
      expect(databaseQueryHistoryParameterPreview(["still-secret"], ["api_key"])).toEqual([
        { position: 1, name: "api_key", value: "<mascarado>", masked: true },
      ])
    } finally {
      setActiveSensitiveTerms([...DEFAULT_SENSITIVE_TERMS])
    }
  })

  test("cancels an expensive SQLite query without blocking the interface thread", async () => {
    const controller = new AbortController()
    const startedAt = performance.now()
    const pending = executeDatabaseQuery(
      "write-two",
      "WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM cnt WHERE x < 1000000000) SELECT sum(x) AS total FROM cnt",
      false,
      { signal: controller.signal },
    )
    setTimeout(() => controller.abort(), 25)

    await expect(pending).rejects.toBeInstanceOf(DatabaseQueryCancelledError)
    expect(performance.now() - startedAt).toBeLessThan(2_000)

    const followUp = await executeDatabaseQuery("write-two", "SELECT 42 AS answer")
    expect(followUp.rows).toEqual([{ answer: 42 }])
  })

  test("records successful and failed executions with useful metadata", async () => {
    await executeDatabaseQuery("write-two", "SELECT id, name FROM users ORDER BY id")
    await executeDatabaseQuery(
      "write-two",
      "INSERT INTO audit_log (message, created_at) VALUES ('history', '2026-09-02')",
    )
    await expect(
      executeDatabaseQuery("write-two", "SELECT * FROM missing_history_table"),
    ).rejects.toThrow()

    const history = listDatabaseQueryHistory("write-two")
    const failed = history.find((entry) => entry.sql.includes("missing_history_table"))
    const selected = history.find((entry) => entry.sql.includes("SELECT id, name"))
    const inserted = history.find((entry) => entry.sql.includes("VALUES ('history'"))

    expect(failed).toMatchObject({
      command: "SELECT",
      status: "error",
      rowCount: null,
      affectedRows: null,
    })
    expect(failed?.error).toBeTruthy()
    expect(selected).toMatchObject({
      connectionId: "write-two",
      connectionName: "Writable two",
      status: "success",
      rowCount: 4,
      affectedRows: null,
    })
    expect(inserted).toMatchObject({
      command: "INSERT",
      status: "success",
      rowCount: null,
      affectedRows: 1,
    })
    if (!selected) throw new Error("Expected the successful query in history")
    expect(selected?.durationMs).toBeGreaterThanOrEqual(0)
    expect(Number.isNaN(Date.parse(selected?.executedAt ?? ""))).toBe(false)
    expect(databaseQueryHistoryCanRerun(selected)).toBe(true)
    expect(listDatabaseQueryHistory()).toContainEqual(selected)
  })

  test("persists only execution metadata, not ad-hoc SQL, comments, literals or driver errors", async () => {
    const secret = "SQL_HISTORY_FAKE_PRIVATE_VALUE"
    for (const sql of [
      `SELECT '${secret}' AS value /* https://example.test/${secret} */`,
      `UPDATE audit_log SET message = '${secret}'`,
      `INSERT INTO audit_log (message) VALUES ('${secret}')`,
    ])
      await executeDatabaseQuery("write-two", sql)
    await expect(
      executeDatabaseQuery("write-two", `SELECT * FROM missing_${secret}`),
    ).rejects.toThrow()
    const entries = listDatabaseQueryHistory("write-two").filter((entry) =>
      entry.sql.includes(secret),
    )
    expect(entries).toHaveLength(4)
    expect(entries.every(databaseQueryHistoryCanRerun)).toBe(true)
    const persisted = readFileSync(join(settingsDirectory, "databases.json"), "utf8")
    expect(persisted).not.toContain(secret)
    const stored = JSON.parse(persisted).queryHistory.find(
      (entry: { id: string }) => entry.id === entries[0]?.id,
    )
    expect(stored).toMatchObject({
      storage: "metadata-only",
      sql: "",
      rerunnable: false,
      parameterPreview: [],
    })
    expect(stored.error).toBe("Não foi possível executar a consulta.")
    clearHistoryContent()
    for (const old of entries) {
      const restarted = listDatabaseQueryHistory("write-two").find((entry) => entry.id === old.id)
      expect(restarted?.sql).toBe("")
      if (!restarted) throw new Error("Missing retained metadata")
      expect(databaseQueryHistoryCanRerun(restarted)).toBe(false)
      expect(databaseQueryHistoryEntryIsRead(restarted)).toBe(databaseQueryHistoryEntryIsRead(old))
      expect(normalizeQueryHistoryEntry(restarted)).toEqual(restarted)
    }
  })

  test("legacy cleanup is explicit, preserves metadata and never removes saved favorites", async () => {
    await executeDatabaseQuery("write-two", "SELECT 42 AS answer")
    const current = listDatabaseQueryHistory("write-two")[0]
    if (!current) throw new Error("Missing fixture execution")
    const legacy = {
      ...current,
      id: "legacy-privacy-fixture",
      sql: "SELECT 'LEGACY_FAKE_SECRET'",
      storage: undefined,
      readOnly: undefined,
    }
    const { storage: _storage, readOnly: _readOnly, ...legacyEntry } = legacy
    const settings = readSettings()
    writeSettings({ ...settings, queryHistory: [legacyEntry, ...settings.queryHistory] })
    const favorite = saveDatabaseQuery("write-two", {
      name: "Explicit favorite",
      sql: "SELECT 'FAVORITE_FAKE_SECRET'",
    })
    await executeDatabaseQuery("write-two", "SELECT 43 AS answer")
    expect(readFileSync(join(settingsDirectory, "databases.json"), "utf8")).toContain(
      "LEGACY_FAKE_SECRET",
    )
    expect(
      listDatabaseQueryHistory("write-two").find((entry) => entry.id === legacyEntry.id)?.sql,
    ).toBe(legacyEntry.sql)
    clearLegacyDatabaseQueryHistoryContent()
    const cleaned = listDatabaseQueryHistory("write-two").find(
      (entry) => entry.id === legacyEntry.id,
    )
    expect(cleaned).toMatchObject({
      id: legacyEntry.id,
      sql: "",
      storage: "metadata-only",
      executedAt: current.executedAt,
    })
    const persisted = readFileSync(join(settingsDirectory, "databases.json"), "utf8")
    expect(persisted).not.toContain("LEGACY_FAKE_SECRET")
    expect(persisted).toContain("FAVORITE_FAKE_SECRET")
    removeDatabaseSavedQuery("write-two", favorite.id)
  })

  test("returns query metadata and caps large result sets", async () => {
    const result = await executeDatabaseQuery(
      "write-one",
      "SELECT id, name, active FROM users ORDER BY id",
    )

    expect(result).toMatchObject({
      command: "SELECT",
      mutating: false,
      columns: ["id", "name", "active"],
      rowCount: 620,
      truncated: true,
    })
    expect(result.rows).toHaveLength(500)
    expect(result.rows[0]).toEqual({ id: 1, name: "User 0001", active: 1 })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  test("masks sensitive and binary values in ad-hoc query results by default", async () => {
    const hidden = await executeDatabaseQuery(
      "write-one",
      "SELECT email, password, payload FROM users WHERE id = 1",
    )
    expect(hidden.rows[0]).toEqual({
      email: "<mascarado>",
      password: "<mascarado>",
      payload: "<binário 4 bytes>",
    })

    const revealed = await executeDatabaseQuery(
      "write-one",
      "SELECT email, password FROM users WHERE id = 1",
      true,
    )
    expect(revealed.rows[0]).toEqual({
      email: "user1@example.test",
      password: "secret-1",
    })
  })

  test("uses customized sensitive terms in tables and ad-hoc query results", async () => {
    const usersTable = { schema: "main", name: "users", type: "table" as const }
    setActiveSensitiveTerms(["name"])
    try {
      const page = await loadTablePage("write-one", usersTable, 0, 1)
      expect(page.rows[0]).toMatchObject({
        name: "<mascarado>",
        email: "user1@example.test",
      })

      const query = await executeDatabaseQuery(
        "write-one",
        "SELECT name, email FROM users WHERE id = 1",
      )
      expect(query.rows[0]).toEqual({
        name: "<mascarado>",
        email: "user1@example.test",
      })
    } finally {
      setActiveSensitiveTerms([...DEFAULT_SENSITIVE_TERMS])
    }
  })

  test("executes writes only on explicitly writable profiles", async () => {
    const inserted = await executeDatabaseQuery(
      "write-one",
      "INSERT INTO audit_log (message, created_at) VALUES ('query editor', '2026-02-01')",
    )
    expect(inserted).toMatchObject({ command: "INSERT", mutating: true })

    const rows = await executeDatabaseQuery(
      "write-one",
      "SELECT message FROM audit_log ORDER BY rowid",
    )
    expect(rows.rows.at(-1)).toEqual({ message: "query editor" })
    expect(() =>
      previewDatabaseQuery("read-only", "INSERT INTO audit_log (message) VALUES ('blocked')"),
    ).toThrow("somente leitura")
  })
})

describe("staged table mutations", () => {
  const usersTable = { schema: "main", name: "users", type: "table" as const }
  const membershipsTable = {
    schema: "main",
    name: "memberships",
    type: "table" as const,
  }
  const view = { schema: "main", name: "active_users", type: "view" as const }
  const noPrimaryKey = { schema: "main", name: "audit_log", type: "table" as const }

  test("previews inserts, updates, deletes, and composite keys", async () => {
    const userColumns = await loadDatabaseTableColumns("write-one", usersTable)
    expect(
      previewTableMutation("write-one", usersTable, userColumns, {
        kind: "insert",
        values: { name: "Preview", email: "preview@example.test" },
      }),
    ).toEqual({
      sql: 'INSERT INTO "users" ("name", "email") VALUES (?, ?)',
      parameters: ["Preview", "preview@example.test"],
    })
    expect(
      previewTableMutation("write-one", usersTable, userColumns, {
        kind: "update",
        rowKey: { id: 10 },
        values: { name: "Changed", active: 0 },
      }),
    ).toEqual({
      sql: 'UPDATE "users" SET "name" = ?, "active" = ? WHERE "id" = ?',
      parameters: ["Changed", 0, 10],
    })
    expect(
      previewTableMutation("write-one", usersTable, userColumns, {
        kind: "delete",
        rowKey: { id: 10 },
      }),
    ).toEqual({
      sql: 'DELETE FROM "users" WHERE "id" = ?',
      parameters: [10],
    })

    const membershipColumns = await loadDatabaseTableColumns("write-one", membershipsTable)
    expect(
      previewTableMutation("write-one", membershipsTable, membershipColumns, {
        kind: "delete",
        rowKey: { tenant_id: 1, code: "viewer" },
      }),
    ).toEqual({
      sql: 'DELETE FROM "memberships" WHERE "tenant_id" = ? AND "code" = ?',
      parameters: [1, "viewer"],
    })
  })

  test("blocks unsafe row mutations", async () => {
    const userColumns = await loadDatabaseTableColumns("write-one", usersTable)
    const noKeyColumns = await loadDatabaseTableColumns("write-one", noPrimaryKey)

    expect(() =>
      previewTableMutation("read-only", usersTable, userColumns, {
        kind: "delete",
        rowKey: { id: 1 },
      }),
    ).toThrow("Habilite leitura e escrita")
    expect(() =>
      previewTableMutation("write-one", view, userColumns, {
        kind: "delete",
        rowKey: { id: 1 },
      }),
    ).toThrow("Views não podem")
    expect(() =>
      previewTableMutation("write-one", noPrimaryKey, noKeyColumns, {
        kind: "delete",
        rowKey: {},
      }),
    ).toThrow("chave primária")
    expect(() =>
      previewTableMutation("write-one", usersTable, userColumns, {
        kind: "update",
        rowKey: {},
        values: { name: "Unsafe" },
      }),
    ).toThrow("identificar este registro")
    expect(() =>
      previewTableMutation("write-one", usersTable, userColumns, {
        kind: "update",
        rowKey: { id: 1 },
        values: {},
      }),
    ).toThrow("Nenhuma alteração")
  })

  test("applies insert, update, and delete against the disposable database", async () => {
    await insertTableRow("write-one", usersTable, {
      name: "Mutation target",
      email: "mutation@example.test",
      active: 1,
    })
    const inserted = await executeDatabaseQuery(
      "write-one",
      "SELECT id, name FROM users WHERE email = 'mutation@example.test'",
    )
    const id = inserted.rows[0]?.id
    expect(typeof id).toBe("number")

    await updateTableRow(
      "write-one",
      usersTable,
      { id },
      {
        name: "Mutation updated",
        active: 0,
      },
    )
    const updated = await executeDatabaseQuery(
      "write-one",
      `SELECT name, active FROM users WHERE id = ${id}`,
    )
    expect(updated.rows[0]).toEqual({ name: "Mutation updated", active: 0 })

    await deleteTableRow("write-one", usersTable, { id })
    const deleted = await executeDatabaseQuery("write-one", `SELECT id FROM users WHERE id = ${id}`)
    expect(deleted.rows).toEqual([])
  })

  test("supports inserts containing only database defaults", async () => {
    const table = { schema: "main", name: "empty_defaults", type: "table" as const }
    await insertTableRow("write-one", table, {})
    const result = await executeDatabaseQuery("write-one", "SELECT enabled FROM empty_defaults")
    expect(result.rows).toEqual([{ enabled: 1 }])
  })

  test("coerces edited values according to the database column type", () => {
    const column = (type: string) => ({
      field: "value",
      type,
      nullable: false,
      key: "",
      defaultValue: null,
    })
    expect(coerceDatabaseCellValue(column("INTEGER"), "42")).toBe(42)
    expect(coerceDatabaseCellValue(column("BIGINT"), "9007199254740993")).toBe(9007199254740993n)
    expect(coerceDatabaseCellValue(column("BOOLEAN"), "false")).toBe(false)
    expect(coerceDatabaseCellValue(column("DECIMAL(10,2)"), "12.50")).toBe(12.5)
    expect(coerceDatabaseCellValue(column("JSON"), '{"active":true}')).toEqual({ active: true })
    expect(coerceDatabaseCellValue(column("TEXT"), "001")).toBe("001")
    expect(() => coerceDatabaseCellValue(column("INTEGER"), "4.2")).toThrow("inteiro")
    expect(() => coerceDatabaseCellValue(column("JSON"), "{")).toThrow("JSON")
  })

  test("commits an approved batch atomically and rolls every command back on failure", async () => {
    const userColumns = await loadDatabaseTableColumns("write-one", usersTable)
    await applyTableMutations("write-one", [
      {
        table: usersTable,
        columns: userColumns,
        mutation: { kind: "update", rowKey: { id: 1 }, values: { name: "Atomic commit" } },
      },
      {
        table: usersTable,
        columns: userColumns,
        mutation: {
          kind: "insert",
          values: { name: "Atomic insert", email: "atomic@example.test" },
        },
      },
    ])
    const committed = await executeDatabaseQuery("write-one", "SELECT name FROM users WHERE id = 1")
    expect(committed.rows[0]).toEqual({ name: "Atomic commit" })

    const successfulWrites = listDatabaseQueryHistory("write-one")
      .filter(
        (entry) =>
          entry.status === "success" &&
          (entry.sql.startsWith('UPDATE "users" SET') ||
            entry.sql.startsWith('INSERT INTO "users"')),
      )
      .slice(0, 2)
    expect(successfulWrites.map((entry) => entry.command).sort()).toEqual(["INSERT", "UPDATE"])
    expect(successfulWrites.every((entry) => entry.affectedRows === 1)).toBe(true)
    expect(successfulWrites.every((entry) => entry.rerunnable === false)).toBe(true)
    expect(successfulWrites.every((entry) => !databaseQueryHistoryCanRerun(entry))).toBe(true)
    expect(successfulWrites.some((entry) => entry.sql.includes("Atomic insert"))).toBe(false)
    expect(successfulWrites.some((entry) => entry.sql.includes("atomic@example.test"))).toBe(false)
    const updateHistory = successfulWrites.find((entry) => entry.command === "UPDATE")
    const insertHistory = successfulWrites.find((entry) => entry.command === "INSERT")
    expect(updateHistory?.parameterPreview).toEqual([
      { position: 1, name: "name", value: '"Atomic commit"', masked: false },
      { position: 2, name: "id", value: "1", masked: false },
    ])
    expect(insertHistory?.parameterPreview).toEqual([
      { position: 1, name: "name", value: '"Atomic insert"', masked: false },
      {
        position: 2,
        name: "email",
        value: "<mascarado>",
        masked: true,
        revealedValue: '"atomic@example.test"',
      },
    ])
    const persistedHistory = readFileSync(join(settingsDirectory, "databases.json"), "utf8")
    expect(persistedHistory).not.toContain("Atomic commit")
    expect(persistedHistory).not.toContain("atomic@example.test")
    expect(persistedHistory).not.toContain("revealedValue")

    await expect(
      applyTableMutations("write-one", [
        {
          table: usersTable,
          columns: userColumns,
          mutation: { kind: "update", rowKey: { id: 1 }, values: { name: "Must roll back" } },
        },
        {
          table: usersTable,
          columns: userColumns,
          mutation: {
            kind: "insert",
            values: { name: "Duplicate", email: "atomic@example.test" },
          },
        },
      ]),
    ).rejects.toThrow()
    const rolledBack = await executeDatabaseQuery(
      "write-one",
      "SELECT name FROM users WHERE id = 1",
    )
    expect(rolledBack.rows[0]).toEqual({ name: "Atomic commit" })

    const rolledBackWrites = listDatabaseQueryHistory("write-one")
      .filter((entry) => entry.status === "error" && entry.rerunnable === false)
      .slice(0, 2)
    expect(rolledBackWrites).toHaveLength(2)
    expect(rolledBackWrites.map((entry) => entry.command).sort()).toEqual(["INSERT", "UPDATE"])
    expect(rolledBackWrites.every((entry) => entry.error)).toBe(true)
  })
})

describe("connection lifecycle", () => {
  test("normalizes saved profiles and reports write capability", () => {
    const connections = listDatabaseConnections()
    const writable = connections.find((connection) => connection.id === "write-one")
    const readOnly = connections.find((connection) => connection.id === "read-only")
    expect(writable).toMatchObject({
      filename: writableDatabasePath,
      ssl: false,
      writeEnabled: true,
    })
    if (!writable || !readOnly) throw new Error("Fixture connections were not loaded")
    expect(databaseConnectionCanWrite(writable)).toBe(true)
    expect(databaseConnectionCanWrite(readOnly)).toBe(false)
  })

  test("persists the default connection and protects the settings file", () => {
    setDefaultDatabaseConnection("write-two")
    expect(getDefaultDatabaseConnectionId()).toBe("write-two")
    setDefaultDatabaseConnection("write-one")
    expect(statSync(join(settingsDirectory, "databases.json")).mode & 0o777).toBe(0o600)
  })

  test("tests, creates, edits, and removes a disposable SQLite profile", async () => {
    const thirdDatabasePath = join(configRoot, "third.sqlite")
    createFixtureDatabase(thirdDatabasePath, 2)
    const draft = {
      name: "Temporary profile",
      driver: "sqlite" as const,
      filename: thirdDatabasePath,
      ssl: false,
      writeEnabled: false,
    }

    await expect(testDatabaseConnection(draft, "")).resolves.toBeUndefined()
    const created = await addDatabaseConnection(draft, "", false)
    expect(created.warning).toBeNull()
    expect(getDefaultDatabaseConnectionId()).toBe(created.profile.id)
    expect(listDatabaseConnections()).toContainEqual(created.profile)

    saveDatabaseQuery(created.profile.id, { name: "Temporary", sql: "SELECT 1" })
    await executeDatabaseQuery(created.profile.id, "SELECT 1 AS available")
    expect(listDatabaseQueryHistory(created.profile.id)).toHaveLength(1)
    const removedConnectionHistory = listDatabaseQueryHistory(created.profile.id)[0]
    const updated = await updateDatabaseConnection(
      created.profile.id,
      { ...draft, name: "Renamed profile", writeEnabled: true },
      "",
      false,
    )
    expect(updated.profile).toMatchObject({
      id: created.profile.id,
      name: "Renamed profile",
      writeEnabled: true,
    })
    expect(listDatabaseSavedQueries(created.profile.id)).toHaveLength(1)

    expect(await removeDatabaseConnection(created.profile.id)).toBe(true)
    expect(await removeDatabaseConnection(created.profile.id)).toBe(false)
    expect(listDatabaseConnections().some((profile) => profile.id === created.profile.id)).toBe(
      false,
    )
    expect(listDatabaseSavedQueries(created.profile.id)).toEqual([])
    expect(listDatabaseQueryHistory(created.profile.id)).toEqual([])
    if (!removedConnectionHistory) throw new Error("Expected query history before removal")
    expect(databaseQueryHistoryCanRerun(removedConnectionHistory)).toBe(false)
  })

  test("fails clearly when a SQLite file does not exist", async () => {
    await expect(
      testDatabaseConnection(
        {
          name: "Missing",
          driver: "sqlite",
          filename: join(configRoot, "missing.sqlite"),
          ssl: false,
          writeEnabled: false,
        },
        "",
      ),
    ).rejects.toThrow()
  })
})
