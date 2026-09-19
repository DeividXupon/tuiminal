import { describe, expect, test } from "bun:test"
import {
  activateConfigurationSection,
  configurationSectionsForContext,
  normalizeConfigurationSectionForContext,
} from "../apps/cli/src/model/configuration-context"
import { configurationSettingPatch } from "../apps/cli/src/model/configuration-options"
import { getUiSettings } from "../packages/core/src/settings/theme"

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
      "features",
    ])
    expect(configurationSectionsForContext("git")).toEqual([
      "git",
      "colorMode",
      "palette",
      "layout",
      "language",
      "tutorial",
      "features",
    ])
    expect(configurationSectionsForContext("global")).toEqual([
      "colorMode",
      "palette",
      "layout",
      "language",
      "tutorial",
      "features",
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

  test("Enter opens action categories without dismissing value categories", () => {
    const opened: string[] = []
    const actions = {
      openFeatures: () => opened.push("features"),
      startTutorial: () => opened.push("tutorial"),
      openHistory: () => opened.push("history"),
      openSensitive: () => opened.push("sensitive"),
      openGit: () => opened.push("git"),
    }

    activateConfigurationSection("palette", actions)
    activateConfigurationSection("layout", actions)
    activateConfigurationSection("git", actions)
    activateConfigurationSection("features", actions)

    expect(opened).toEqual(["git", "features"])
  })
})
