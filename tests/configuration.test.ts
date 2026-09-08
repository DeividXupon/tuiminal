import { describe, expect, test } from "bun:test"
import {
  configurationSectionsForContext,
  normalizeConfigurationSectionForContext,
} from "../src/app/ui/ConfigurationModal"
import { configurationSettingPatch, PALETTE_ROWS } from "../src/app/model/configuration-options"
import { getUiSettings } from "../src/core/settings/theme"

describe("contextual settings", () => {
  test("shows Database settings first only in the Database context", () => {
    expect(configurationSectionsForContext("database")).toEqual([
      "sensitive",
      "history",
      "colorMode",
      "palette",
      "layout",
      "language",
      "tutorial",
    ])
    expect(configurationSectionsForContext("git")).toEqual([
      "git",
      "colorMode",
      "palette",
      "layout",
      "language",
      "tutorial",
    ])
    expect(configurationSectionsForContext("global")).toEqual([
      "colorMode",
      "palette",
      "layout",
      "language",
      "tutorial",
    ])
  })

  test("moves focus away from a hidden Database section", () => {
    expect(normalizeConfigurationSectionForContext("history", "global")).toBe("colorMode")
    expect(normalizeConfigurationSectionForContext("sensitive", "git")).toBe("git")
    expect(normalizeConfigurationSectionForContext("history", "database")).toBe("history")
    expect(normalizeConfigurationSectionForContext("language", "global")).toBe("language")
  })

  test("cycles the independent color mode while preserving the selected palette", () => {
    const settings = { ...getUiSettings(), colorMode: "dark", palette: "nord" } as const
    expect(configurationSettingPatch("colorMode", settings, 1)).toEqual({ colorMode: "light" })
    expect(configurationSettingPatch("colorMode", { ...settings, colorMode: "light" }, -1)).toEqual(
      {
        colorMode: "dark",
      },
    )
  })

  test("shows every palette in compact two-column rows", () => {
    expect(PALETTE_ROWS.map((row) => row.length)).toEqual([2, 2, 2, 1])
    expect(PALETTE_ROWS.flatMap((row) => row.map((palette) => palette.id))).toEqual([
      "prime",
      "midnight",
      "nord",
      "gruvbox",
      "dracula",
      "catppuccin",
      "tokyo-night",
    ])
  })
})
