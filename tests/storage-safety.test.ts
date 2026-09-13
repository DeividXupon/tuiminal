import { afterEach, describe, expect, test } from "bun:test"
import {
  mkdirSync,
  mkdtempSync,
  existsSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { atomicWriteFileSync, AtomicFileConflictError } from "../src/shared/storage/atomic-file"
import { loadHttpHistory, persistHttpHistoryEntry } from "../src/features/http/storage/history"
import { DEFAULT_HTTP_WORKSPACE_CONFIG } from "../src/features/http/storage/config"

describe("recoverable storage boundaries", () => {
  const temporaryDirectories: string[] = []

  function temporaryDirectory(prefix: string) {
    const root = mkdtempSync(join(tmpdir(), prefix))
    temporaryDirectories.push(root)
    return root
  }

  afterEach(() => {
    for (const root of temporaryDirectories.splice(0).reverse()) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test("detects stale writes, keeps a backup, and rejects symlinked ancestors", () => {
    const root = temporaryDirectory("tuiminal-atomic-")
    const path = join(root, "config", "settings.json")
    const firstHash = atomicWriteFileSync(path, '{"value":1}\n', {
      expectedHash: null,
      backup: true,
    })
    writeFileSync(path, '{"value":2}\n')
    expect(() =>
      atomicWriteFileSync(path, '{"value":3}\n', {
        expectedHash: firstHash,
        backup: true,
      }),
    ).toThrow(AtomicFileConflictError)
    expect(readFileSync(path, "utf8")).toBe('{"value":2}\n')

    const currentHash = atomicWriteFileSync(path, '{"value":4}\n', {
      backup: true,
    })
    expect(currentHash).toHaveLength(64)
    expect(readFileSync(`${path}.bak`, "utf8")).toBe('{"value":2}\n')
    expect(statSync(path).mode & 0o777).toBe(0o600)

    const outside = temporaryDirectory("tuiminal-atomic-outside-")
    const project = temporaryDirectory("tuiminal-atomic-project-")
    symlinkSync(outside, join(project, "config"))
    expect(() => atomicWriteFileSync(join(project, "config", "escaped.json"), "{}\n")).toThrow(
      /symlink/i,
    )
    expect(existsSync(join(outside, "escaped.json"))).toBe(false)
  })

  test("preserves corrupted HTTP history instead of replacing it with an empty file", async () => {
    const root = temporaryDirectory("tuiminal-history-corrupt-")
    const directory = join(root, ".tuiminal", "http")
    const path = join(directory, "history.json")
    mkdirSync(directory, { recursive: true })
    writeFileSync(path, "{not-json\n")
    const config = {
      ...DEFAULT_HTTP_WORKSPACE_CONFIG,
      history: { persistMetadata: true, persistBodies: false },
    }
    await expect(loadHttpHistory(root, config)).rejects.toThrow(/JSON inválido/i)
    await expect(
      persistHttpHistoryEntry(root, config, {
        id: "safe",
        createdAt: Date.now(),
        requestId: "request",
        requestName: "Request",
        environmentName: null,
        method: "GET",
        url: "https://example.test",
        status: null,
        durationMs: null,
        error: null,
        persisted: false,
        bodyDiscarded: false,
      }),
    ).rejects.toThrow(/JSON inválido/i)
    expect(readFileSync(path, "utf8")).toBe("{not-json\n")
  })

  test("requires explicit recovery for corrupted UI and Database settings", () => {
    const configRoot = temporaryDirectory("tuiminal-recovery-")
    const directory = join(configRoot, "tuiminal")
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, "settings.json"), "{broken-settings\n")
    writeFileSync(join(directory, "databases.json"), "{broken-databases\n")
    const themeUrl = new URL("../src/core/settings/theme.ts", import.meta.url).href
    const databaseUrl = new URL("../src/features/database/services/database.ts", import.meta.url)
      .href
    const script = `
      const fs = await import("node:fs");
      const theme = await import(${JSON.stringify(themeUrl)});
      theme.initializeUiSettings();
      const update = theme.updateUiSettings({ layout: "compact" });
      const settingsBeforeRecovery = fs.readFileSync(theme.UI_SETTINGS_PATH, "utf8");
      const reset = theme.resetUiSettings();
      const database = await import(${JSON.stringify(databaseUrl)});
      const empty = database.readSettings();
      const databaseError = database.databaseSettingsStorageError();
      let databaseWriteError = "";
      try { database.writeSettings(empty); } catch (error) { databaseWriteError = error.message; }
      const databaseBeforeRecovery = fs.readFileSync(database.DATABASE_SETTINGS_PATH, "utf8");
      database.recoverDatabaseSettings(empty);
      console.log(JSON.stringify({
        updateError: update.error,
        settingsBeforeRecovery,
        resetError: reset.error,
        settingsBackup: fs.readFileSync(theme.UI_SETTINGS_PATH + ".bak", "utf8"),
        databaseError,
        databaseWriteError,
        databaseBeforeRecovery,
        databaseBackup: fs.readFileSync(database.DATABASE_SETTINGS_PATH + ".bak", "utf8"),
        settingsMode: fs.statSync(theme.UI_SETTINGS_PATH).mode & 0o777,
        databaseMode: fs.statSync(database.DATABASE_SETTINGS_PATH).mode & 0o777,
      }));
    `
    const child = Bun.spawnSync({
      cmd: [process.execPath, "-e", script],
      cwd: join(import.meta.dir, ".."),
      env: { ...process.env, XDG_CONFIG_HOME: configRoot },
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(child.exitCode).toBe(0)
    const result = JSON.parse(child.stdout.toString()) as Record<string, string | number | null>
    expect(result.updateError).toMatch(/corrompida/i)
    expect(result.settingsBeforeRecovery).toBe("{broken-settings\n")
    expect(result.resetError).toBeNull()
    expect(result.settingsBackup).toBe("{broken-settings\n")
    expect(result.databaseWriteError).toMatch(/corrompido/i)
    expect(result.databaseError).toBeTruthy()
    expect(result.databaseBeforeRecovery).toBe("{broken-databases\n")
    expect(result.databaseBackup).toBe("{broken-databases\n")
    expect(result.settingsMode).toBe(0o600)
    expect(result.databaseMode).toBe(0o600)
  })
})
