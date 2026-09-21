import { expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { paletteFor, type UiSettings } from "../packages/core/src/settings/theme"

test.each(["constructor", "__proto__", "toString", "hasOwnProperty", "not-a-palette"])(
  "rejects the invalid palette %s on load and update without losing other settings",
  (palette) => {
    const configRoot = mkdtempSync(join(tmpdir(), "tuiminal-palette-validation-"))
    const settingsPath = join(configRoot, "tuiminal", "settings.json")
    mkdirSync(join(configRoot, "tuiminal"))
    try {
      const themeUrl = new URL("../packages/core/src/settings/theme.ts", import.meta.url).href
      const script = `
        import { readFileSync, writeFileSync } from "node:fs";
        const theme = await import(${JSON.stringify(themeUrl)});
        const palette = ${JSON.stringify(palette)};
        const settingsPath = ${JSON.stringify(settingsPath)};
        const results = [];
        for (const colorMode of ["dark", "light"]) {
          const source = JSON.stringify({ palette, colorMode, layout: "framed", language: "en", sensitiveTerms: ["fixture"] });
          writeFileSync(settingsPath, source);
          const initial = theme.initializeUiSettings();
          const initialCanvas = theme.COLORS.canvas;
          const untouched = readFileSync(settingsPath, "utf8") === source;
          const valid = theme.updateUiSettings({ palette: "nord" });
          const updated = theme.updateUiSettings({ palette, layout: "compact" });
          results.push({ initial, initialCanvas, untouched, validError: valid.error, updated,
            updatedCanvas: theme.COLORS.canvas, persisted: JSON.parse(readFileSync(settingsPath, "utf8")) });
        }
        console.log(JSON.stringify(results));
      `
      const child = Bun.spawnSync({
        cmd: [process.execPath, "-e", script],
        cwd: join(import.meta.dir, ".."),
        env: { ...process.env, XDG_CONFIG_HOME: configRoot },
        stdout: "pipe",
        stderr: "pipe",
      })
      expect(child.exitCode).toBe(0)
      expect(child.stderr.toString()).toBe("")
      const results = JSON.parse(child.stdout.toString()) as {
        initial: UiSettings
        initialCanvas: string
        untouched: boolean
        validError: string | null
        updated: { settings: UiSettings; error: string | null }
        updatedCanvas: string
        persisted: UiSettings
      }[]
      expect(results).toHaveLength(2)
      expect(results.map((result) => result.initial.colorMode)).toEqual(["dark", "light"])
      for (const result of results) {
        expect(result.initial).toEqual({
          palette: "prime",
          colorMode: result.initial.colorMode,
          layout: "framed",
          language: "en",
          terminalMasterKey: "Ctrl+B",
          terminalAgentCommands: [],
          sensitiveTerms: ["fixture"],
        })
        expect(result.initialCanvas).toBe(paletteFor("prime", result.initial.colorMode).canvas)
        expect(result.untouched).toBe(true)
        expect(result.validError).toBeNull()
        expect(result.updated.error).toBeNull()
        expect(result.updated.settings).toEqual({
          ...result.initial,
          palette: "nord",
          layout: "compact",
        })
        expect(result.updatedCanvas).toBe(paletteFor("nord", result.initial.colorMode).canvas)
        expect(result.persisted).toEqual(result.updated.settings)
      }
    } finally {
      rmSync(configRoot, { recursive: true, force: true })
    }
  },
)
