import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DEFAULT_SENSITIVE_TERMS } from "../packages/core/src/security/sensitive-data"
import { PALETTE_OPTIONS, paletteFor } from "../packages/core/src/settings/theme"

describe("UI settings", () => {
  test("offers seven complete palettes in Dark and Light", () => {
    expect(PALETTE_OPTIONS.map((palette) => palette.id)).toEqual([
      "prime",
      "midnight",
      "nord",
      "gruvbox",
      "dracula",
      "catppuccin",
      "tokyo-night",
    ])
    for (const palette of PALETTE_OPTIONS) {
      expect(paletteFor(palette.id, "dark").canvas).toMatch(/^#[\da-f]{6}$/i)
      expect(paletteFor(palette.id, "light").canvas).toMatch(/^#[\da-f]{6}$/i)
    }
  })

  test("migrates old settings and persists color mode with live syntax colors", () => {
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
      const themeUrl = new URL("../packages/core/src/settings/theme.ts", import.meta.url).href
      const syntaxUrl = new URL("../packages/core/src/ui/syntax-style.ts", import.meta.url).href
      const script = `
        const theme = await import(${JSON.stringify(themeUrl)});
        theme.initializeUiSettings();
        const syntax = await import(${JSON.stringify(syntaxUrl)});
        const syntaxStyle = syntax.createUiSyntaxStyle();
        const initial = theme.getUiSettings();
        const darkString = syntaxStyle.getStyle("string")?.fg?.toInts();
        const compactSelection = theme.databaseSelectionColors();
        const compactFocusedPanel = theme.focusedPanelBorder(true, "#123456");
        const compactInactivePanel = theme.focusedPanelBorder(false, "#123456");
        const updated = theme.updateUiSettings({ sensitiveTerms: ["internal code", "token"] });
        const light = theme.updateUiSettings({ colorMode: "light" });
        const lightColors = { canvas: theme.COLORS.canvas, text: theme.COLORS.text };
        const lightString = syntaxStyle.getStyle("string")?.fg?.toInts();
        theme.updateUiSettings({ layout: "framed" });
        const framedSelection = theme.databaseSelectionColors();
        const framedFocusedPanel = theme.focusedPanelBorder(true, "#123456");
        const framedInactivePanel = theme.focusedPanelBorder(false, "#123456");
        console.log(JSON.stringify({ initial, updated: updated.settings, light: light.settings, lightColors, darkString, lightString, compactSelection, framedSelection, compactFocusedPanel, compactInactivePanel, framedFocusedPanel, framedInactivePanel }));
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
        initial: { colorMode: string; sensitiveTerms: string[] }
        updated: { sensitiveTerms: string[] }
        light: { colorMode: string }
        lightColors: { canvas: string; text: string }
        darkString: number[]
        lightString: number[]
        compactSelection: { foreground: string; background: string }
        framedSelection: { foreground: string; background: string }
        compactFocusedPanel: { border: string[]; borderStyle: string; borderColor: string }
        compactInactivePanel: { border: boolean }
        framedFocusedPanel: { border: boolean; borderStyle: string; borderColor: string }
        framedInactivePanel: { border: boolean; borderStyle: string; borderColor: string }
      }
      expect(output.initial.colorMode).toBe("dark")
      expect(output.initial.sensitiveTerms).toEqual([...DEFAULT_SENSITIVE_TERMS])
      expect(output.updated.sensitiveTerms).toEqual(["internal code", "token"])
      expect(output.light.colorMode).toBe("light")
      expect(output.lightColors).toEqual({ canvas: "#eceff4", text: "#2e3440" })
      expect(output.darkString).toEqual([195, 232, 141, 255])
      expect(output.lightString).toEqual([47, 125, 50, 255])
      expect(output.compactSelection).toEqual({
        foreground: "#eceff4",
        background: "#403849",
      })
      expect(output.framedSelection).toEqual({
        foreground: "#eceff4",
        background: "#806079",
      })
      expect(output.compactFocusedPanel).toEqual({
        border: ["left"],
        borderStyle: "single",
        borderColor: "#123456",
      })
      expect(output.compactInactivePanel).toEqual({ border: false })
      expect(output.framedFocusedPanel).toEqual({
        border: true,
        borderStyle: "rounded",
        borderColor: "#123456",
      })
      expect(output.framedInactivePanel).toEqual({
        border: true,
        borderStyle: "rounded",
        borderColor: "#a7b0c0",
      })
      expect(JSON.parse(readFileSync(settingsPath, "utf8")).sensitiveTerms).toEqual([
        "internal code",
        "token",
      ])
      expect(JSON.parse(readFileSync(settingsPath, "utf8")).colorMode).toBe("light")
    } finally {
      rmSync(configRoot, { recursive: true, force: true })
    }
  })
})
