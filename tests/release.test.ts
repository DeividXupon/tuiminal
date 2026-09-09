import { describe, expect, test } from "bun:test"
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
    expect(manifest.bin).toEqual({ tuiminal: "./bin/tuiminal.js" })
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
      expect(platformPackageJson(target, "1.0.0").files).toEqual(["bin"])
    }
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
