import { afterEach, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseMyCnf } from "../packages/feature-database/src/model/external-connection-config"
import { discoverExternalDatabaseConnections } from "../packages/feature-database/src/services/external-database-connections"

const roots: string[] = []

function fixture(files: Record<string, string>, mode = 0o600) {
  const home = mkdtempSync(join(tmpdir(), "tuiminal-external-profiles-"))
  roots.push(home)
  for (const [name, content] of Object.entries(files)) {
    const path = join(home, name)
    writeFileSync(path, content, { mode })
    chmodSync(path, mode)
  }
  return {
    home,
    platform: "linux" as const,
    effectiveUserId: process.geteuid?.() ?? 0,
    environment: {},
    runMysqlConfigEditor: async () => null,
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

test("discovers client_dev and client_test as separate MySQL connections", async () => {
  const options = fixture({
    ".my.cnf": `
[client_dev]
host=dev.example.test
user=dev_user
password=dev_secret
database=dev_db
[client_test]
host=test.example.test
user=test_user
password=test_secret
database=test_db
[mysqld]
host=not-a-client.example.test
[mysqldump]
user=not-a-profile
`,
  })
  const result = await discoverExternalDatabaseConnections(options)
  expect(result.candidates).toEqual([])
  expect(result.profiles).toHaveLength(2)
  expect(result.profiles.every((profile) => !("missing" in profile))).toBe(true)
  expect(result.profiles[0]).toMatchObject({
    name: ".my.cnf · client_dev",
    host: "dev.example.test",
    database: "dev_db",
    username: "dev_user",
  })
  expect(result.profiles[1]).toMatchObject({
    name: ".my.cnf · client_test",
    host: "test.example.test",
    database: "test_db",
    username: "test_user",
  })
  expect(result.profiles.map(({ id }) => result.credentials.get(id))).toEqual([
    "dev_secret",
    "test_secret",
  ])
  const refreshed = await discoverExternalDatabaseConnections(options)
  expect(refreshed.profiles).toEqual(result.profiles)
})

test("merges shared defaults and matching MySQL suffixes without mixing environments", () => {
  const parsed = parseMyCnf(`
[client]
host=shared.example.test
port=3307
user=shared_user
password=shared_secret
[mysql]
database=shared_db
[client_dev]
host=dev.example.test
password=dev_secret
[mysql_dev]
database=dev_db
ssl-mode=VERIFY_IDENTITY
[client_dev]
user=dev_user
[mysql_test]
host=test.example.test
database=test_db
`)
  expect(parsed.profiles).toEqual([
    { name: "client", values: parsed.values },
    {
      name: "client_dev",
      values: {
        host: "dev.example.test",
        port: "3307",
        user: "dev_user",
        password: "dev_secret",
        database: "dev_db",
        "ssl-mode": "VERIFY_IDENTITY",
      },
    },
    {
      name: "mysql_test",
      values: {
        ...parsed.values,
        host: "test.example.test",
        database: "test_db",
      },
    },
  ])
})

test("keeps named profiles visible without accepting secrets from an unsafe file", async () => {
  const result = await discoverExternalDatabaseConnections(
    fixture(
      {
        ".my.cnf":
          "[client_dev]\nhost=dev.test\nuser=dev\npassword=private-value\n" +
          "[client_test]\nhost=test.test\nuser=test\npassword=other-value\ndatabase=test\n",
      },
      0o644,
    ),
  )
  expect(result.profiles).toEqual([])
  expect(result.candidates.map(({ missing }) => missing)).toEqual([
    ["database", "password"],
    ["password"],
  ])
  expect(result.credentials.size).toBe(0)
  expect(result.warnings.length).toBeGreaterThan(0)
  expect(JSON.stringify(result)).not.toContain("private-value")
  expect(JSON.stringify(result)).not.toContain("other-value")
})

test("discovers hyphenated suffixes with their own TLS settings and an explicit empty password", async () => {
  const result = await discoverExternalDatabaseConnections(
    fixture({
      ".my.cnf":
        "[client]\nhost=base.test\nuser=app\ndatabase=app\npassword=base-secret\n" +
        "[client-dev]\nhost=dev.test\npassword=\n" +
        "[mysql-dev]\nssl-mode=VERIFY_IDENTITY\n" +
        "[client-test]\nhost=test.test\nssl-mode=DISABLED\n",
    }),
  )
  expect(result.profiles).toHaveLength(3)
  const dev = result.profiles[1]
  const testProfile = result.profiles[2]
  expect(dev).toMatchObject({ name: ".my.cnf · client-dev", tlsMode: "verify-full", ssl: true })
  expect(testProfile).toMatchObject({
    name: ".my.cnf · client-test",
    tlsMode: "disable",
    ssl: false,
  })
  expect(dev && result.credentials.get(dev.id)).toBe("")
  expect(testProfile && result.credentials.get(testProfile.id)).toBe("base-secret")
})

test("keeps incomplete PostgreSQL services available for session completion", async () => {
  const result = await discoverExternalDatabaseConnections(
    fixture({
      ".pg_service.conf": "[dev]\nuser=dev\npassword=pg-secret\nsslmode=verify-full\n",
    }),
  )
  expect(result.candidates).toHaveLength(1)
  expect(result.candidates[0]).toMatchObject({
    name: "PostgreSQL service · dev",
    database: "dev",
    username: "dev",
    missing: ["host"],
    tlsMode: "verify-full",
  })
  expect([...result.credentials.values()]).toEqual(["pg-secret"])
})
