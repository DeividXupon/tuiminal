import { afterEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  concretePgpassCandidate,
  matchingPgpassPassword,
  mysqlTlsMode,
  parseMyCnf,
  parseMysqlLoginPaths,
  parsePgpass,
  postgresTlsMode,
} from "../packages/feature-database/src/model/external-connection-config"
import {
  clearExternalDatabaseConnections,
  completeExternalDatabaseConnection,
  discoverExternalDatabaseConnections,
  externalDatabasePaths,
  externalDatabasePassword,
  installExternalDatabaseConnections,
  listExternalDatabaseCandidates,
  listExternalDatabaseProfiles,
  resolvePgpassPassword,
} from "../packages/feature-database/src/services/external-database-connections"

const roots: string[] = []

function temporaryHome() {
  const home = mkdtempSync(join(tmpdir(), "tuiminal-external-database-"))
  roots.push(home)
  return home
}

function privateFile(path: string, content: string) {
  writeFileSync(path, content, { mode: 0o600 })
  chmodSync(path, 0o600)
}

afterEach(() => {
  clearExternalDatabaseConnections()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe("external database configuration parsers", () => {
  test("merges MySQL client groups and recognizes masked login paths", () => {
    const parsed = parseMyCnf(`
      !include /not/read/by/tuiminal.cnf
      [client]
      host = mysql.example.test
      user = app
      password = 'hash#inside'
      database = first
      [mysql]
      database = final # comment
      ssl-mode = VERIFY_IDENTITY
    `)
    expect(parsed.hasUnsupportedInclude).toBe(true)
    expect(parsed.values).toMatchObject({
      host: "mysql.example.test",
      user: "app",
      password: "hash#inside",
      database: "final",
      "ssl-mode": "VERIFY_IDENTITY",
    })
    expect(
      parseMysqlLoginPaths("[remote]\nuser=app\npassword = *****\nhost=db.test\n")[0],
    ).toMatchObject({ name: "remote", hasPassword: true })
  })

  test("matches pgpass in order with escaped separators and contextual wildcards", () => {
    const entries = parsePgpass(
      "db.test:5432:app:alice:first\\:secret\\\\tail \n*:5432:*:alice:fallback\n",
    )
    expect(entries[0]?.password).toBe("first:secret\\tail ")
    expect(
      matchingPgpassPassword(entries, {
        host: "db.test",
        port: 5432,
        database: "app",
        username: "alice",
      }),
    ).toBe("first:secret\\tail ")
    const wildcard = entries[1]
    if (!wildcard) throw new Error("Missing wildcard pgpass fixture")
    expect(concretePgpassCandidate(wildcard)).toBeNull()
  })

  test("normalizes TLS modes without weakening verification", () => {
    expect(mysqlTlsMode("VERIFY_IDENTITY")).toBe("verify-full")
    expect(mysqlTlsMode("DISABLED")).toBe("disable")
    expect(postgresTlsMode("verify-ca")).toBe("verify-ca")
    expect(postgresTlsMode(undefined)).toBe("prefer")
  })
})

describe("external database discovery", () => {
  test("discovers ready profiles and keeps incomplete login paths as candidates", async () => {
    const home = temporaryHome()
    privateFile(
      join(home, ".my.cnf"),
      "[client]\nhost=mysql.test\nport=3307\nuser=myuser\npassword=my-secret\ndatabase=mydb\n",
    )
    privateFile(
      join(home, ".pg_service.conf"),
      "[primary]\nhost=pg.test\nport=5433\nuser=pguser\ndbname=pgdb\npassword=service-secret\nsslmode=verify-full\n",
    )
    privateFile(join(home, ".pgpass"), "pg.test:5433:pgdb:pguser:pg-secret\n")

    const result = await discoverExternalDatabaseConnections({
      home,
      platform: process.platform,
      effectiveUserId: process.geteuid?.() ?? 0,
      environment: {
        PGSERVICEFILE: join(home, ".pg_service.conf"),
        PGPASSFILE: join(home, ".pgpass"),
      },
      runMysqlConfigEditor: async () =>
        "[remote]\nuser = login-user\npassword = *****\nhost = login.test\nport = 3306\n",
    })
    expect(result.profiles.map((profile) => profile.externalSource)).toEqual([
      "mysql-option-file",
      "postgres-service",
      "postgres-passfile",
    ])
    expect(result.profiles.every((profile) => profile.writeEnabled)).toBe(true)
    expect(
      result.profiles.find((profile) => profile.externalSource === "postgres-service"),
    ).toMatchObject({ tlsMode: "verify-full", ssl: true })
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]?.missing).toEqual(["database", "password"])
    expect([...result.credentials.values()]).toEqual(["my-secret", "service-secret", "pg-secret"])
  })

  test("does not use secrets from an insecure Unix file", async () => {
    const home = temporaryHome()
    const mysql = join(home, ".my.cnf")
    writeFileSync(
      mysql,
      "[client]\nhost=mysql.test\nuser=myuser\npassword=exposed\ndatabase=mydb\n",
      { mode: 0o644 },
    )
    chmodSync(mysql, 0o644)
    const service = join(home, ".pg_service.conf")
    writeFileSync(
      service,
      "[unsafe]\nhost=pg.test\nuser=pguser\ndbname=pgdb\npassword=exposed-pg\n",
      { mode: 0o644 },
    )
    chmodSync(service, 0o644)
    const result = await discoverExternalDatabaseConnections({
      home,
      platform: "linux",
      effectiveUserId: process.geteuid?.() ?? 0,
      environment: {},
      runMysqlConfigEditor: async () => null,
    })
    expect(result.profiles).toHaveLength(0)
    expect(result.candidates).toHaveLength(2)
    expect(result.candidates.every((candidate) => candidate.missing.includes("password"))).toBe(
      true,
    )
    expect(result.warnings.join(" ")).not.toContain("exposed")
  })

  test("uses Windows AppData paths and ACL-managed files", async () => {
    const home = temporaryHome()
    const appData = join(home, "AppData", "Roaming")
    const postgres = join(appData, "postgresql")
    mkdirSync(postgres, { recursive: true })
    writeFileSync(
      join(postgres, ".pg_service.conf"),
      "[win]\nhost=win.test\nuser=win\ndbname=app\n",
    )
    writeFileSync(join(postgres, "pgpass.conf"), "win.test:5432:app:win:secret\n")
    expect(externalDatabasePaths(home, "win32", { APPDATA: appData }).pgpass).toBe(
      join(postgres, "pgpass.conf"),
    )
    const result = await discoverExternalDatabaseConnections({
      home,
      platform: "win32",
      environment: { APPDATA: appData },
      runMysqlConfigEditor: async () => null,
    })
    expect(result.profiles.some((profile) => profile.name.includes("win"))).toBe(true)
  })

  test("completes a candidate only for the current session", async () => {
    const result = await discoverExternalDatabaseConnections({
      home: temporaryHome(),
      platform: "linux",
      environment: {},
      runMysqlConfigEditor: async () =>
        "[remote]\nuser=login-user\npassword=*****\nhost=login.test\n",
    })
    installExternalDatabaseConnections(result)
    const candidate = listExternalDatabaseCandidates()[0]
    if (!candidate) throw new Error("Missing external candidate fixture")
    const profile = completeExternalDatabaseConnection(
      candidate,
      {
        name: candidate.name,
        driver: "mysql",
        host: candidate.host,
        port: candidate.port,
        database: "session_db",
        username: candidate.username,
        ssl: true,
        writeEnabled: true,
      },
      "session-secret",
    )
    expect(listExternalDatabaseProfiles()).toContainEqual(profile)
    expect(listExternalDatabaseCandidates()).toHaveLength(0)
    expect(externalDatabasePassword(profile.id)).toBe("session-secret")
    expect(profile.tlsMode).toBe("prefer")
    installExternalDatabaseConnections(result)
    expect(listExternalDatabaseCandidates()).toHaveLength(0)
    expect(listExternalDatabaseProfiles()).toContainEqual(profile)
    expect(externalDatabasePassword(profile.id)).toBe("session-secret")
  })

  test("resolves pgpass without persisting its password", () => {
    const home = temporaryHome()
    privateFile(join(home, ".pgpass"), "saved.test:5432:app:saved-user:saved-secret\n")
    expect(
      resolvePgpassPassword(
        { host: "saved.test", port: 5432, database: "app", username: "saved-user" },
        {
          home,
          platform: process.platform,
          environment: { PGPASSFILE: join(home, ".pgpass") },
          effectiveUserId: process.geteuid?.() ?? 0,
        },
      ),
    ).toBe("saved-secret")
  })
})
