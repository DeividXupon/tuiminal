import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DEFAULT_SENSITIVE_TERMS } from "../src/shared/security/sensitive-data"

describe("UI settings", () => {
  test("migrates and persists configurable sensitive terms in isolation", () => {
    const configRoot = mkdtempSync(join(tmpdir(), "tuiminal-theme-test-"))
    const settingsDirectory = join(configRoot, "tuiminal")
    const settingsPath = join(settingsDirectory, "settings.json")
    mkdirSync(settingsDirectory, { recursive: true })
    writeFileSync(
      settingsPath,
      JSON.stringify({
        palette: "nord",
        layout: "compact",
        language: "en",
      }),
    )

    try {
      const themeUrl = new URL("../src/core/settings/theme.ts", import.meta.url).href
      const script = `
        const theme = await import(${JSON.stringify(themeUrl)});
        theme.initializeUiSettings();
        const initial = theme.getUiSettings();
        const compactSelection = theme.databaseSelectionColors();
        const updated = theme.updateUiSettings({ sensitiveTerms: ["internal code", "token"] });
        theme.updateUiSettings({ layout: "framed" });
        const framedSelection = theme.databaseSelectionColors();
        console.log(JSON.stringify({ initial, updated: updated.settings, compactSelection, framedSelection }));
      `
      const child = Bun.spawnSync({
        cmd: [process.execPath, "-e", script],
        cwd: join(import.meta.dir, ".."),
        env: { ...process.env, XDG_CONFIG_HOME: configRoot },
        stdout: "pipe",
        stderr: "pipe",
      })

      expect(child.exitCode).toBe(0)
      const output = JSON.parse(child.stdout.toString().trim()) as {
        initial: { sensitiveTerms: string[] }
        updated: { sensitiveTerms: string[] }
        compactSelection: { foreground: string; background: string }
        framedSelection: { foreground: string; background: string }
      }
      expect(output.initial.sensitiveTerms).toEqual([...DEFAULT_SENSITIVE_TERMS])
      expect(output.updated.sensitiveTerms).toEqual(["internal code", "token"])
      expect(output.compactSelection).toEqual({
        foreground: "#eceff4",
        background: "#403849",
      })
      expect(output.framedSelection).toEqual({
        foreground: "#1d2129",
        background: "#b48ead",
      })
      expect(JSON.parse(readFileSync(settingsPath, "utf8")).sensitiveTerms).toEqual([
        "internal code",
        "token",
      ])
    } finally {
      rmSync(configRoot, { recursive: true, force: true })
    }
  })
})
