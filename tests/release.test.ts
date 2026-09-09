import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  mainPackageJson,
  npmLauncherSource,
  platformPackageJson,
  RELEASE_TARGETS,
} from "../scripts/release-model"
import { sqliteQueryProcessCommand } from "../src/features/database/services/sqlite-query-runtime"

describe("standalone npm release", () => {
  test("covers supported operating systems and architectures with unique packages", () => {
    expect(RELEASE_TARGETS.map((target) => target.id)).toEqual([
      "darwin-arm64",
      "darwin-x64",
      "linux-arm64",
      "linux-x64",
      "win32-arm64",
      "win32-x64",
    ])
    expect(new Set(RELEASE_TARGETS.map((target) => target.npmPackage)).size).toBe(
      RELEASE_TARGETS.length,
    )
  })

  test("publishes one optional package for every standalone executable", () => {
    const version = "0.2.0-pre-alpha.0"
    const manifest = mainPackageJson(version)
    expect(manifest.bin).toEqual({ tuiminal: "bin/tuiminal.js" })
    expect(manifest.license).toBe("Apache-2.0")
    expect(manifest.engines).toEqual({ node: ">=18" })
    expect(Object.keys(manifest.optionalDependencies)).toHaveLength(RELEASE_TARGETS.length)
    expect(Object.values(manifest.optionalDependencies).every((value) => value === version)).toBe(
      true,
    )
  })

  test("uses a Node launcher while platform packages contain both executables", () => {
    const launcher = npmLauncherSource()
    expect(launcher.startsWith("#!/usr/bin/env node\n")).toBe(true)
    expect(launcher).toContain("spawnSync(executable")
    for (const target of RELEASE_TARGETS) {
      expect(launcher).toContain(target.npmPackage)
      const manifest = platformPackageJson(target, "1.0.0")
      expect(manifest.files).toEqual(["bin"])
      expect(manifest.license).toBe("Apache-2.0")
    }
  })

  test("uses the canonical Apache 2.0 license in the repository", () => {
    const license = readFileSync(new URL("../LICENSE", import.meta.url), "utf8")
    const packageMetadata = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    )
    expect(packageMetadata.license).toBe("Apache-2.0")
    expect(license).toContain(
      "Apache License\n                           Version 2.0, January 2004",
    )
  })

  test("prefers the adjacent SQLite helper and retains the source fallback", () => {
    expect(
      sqliteQueryProcessCommand({
        executablePath: "/release/tuiminal",
        platform: "linux",
        pathExists: () => true,
        sourcePath: "/source/sqlite-query-process.ts",
      }),
    ).toEqual(["/release/tuiminal-sqlite-query"])
    expect(
      sqliteQueryProcessCommand({
        executablePath: "C:\\release\\tuiminal.exe",
        platform: "win32",
        pathExists: () => false,
        sourcePath: "C:\\source\\sqlite-query-process.ts",
      }),
    ).toEqual(["C:\\release\\tuiminal.exe", "C:\\source\\sqlite-query-process.ts"])
  })
})
