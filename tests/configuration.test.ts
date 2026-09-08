import { describe, expect, test } from "bun:test"
import {
  configurationSectionsForContext,
  normalizeConfigurationSectionForContext,
} from "../src/app/ui/ConfigurationModal"

describe("contextual settings", () => {
  test("shows Database settings first only in the Database context", () => {
    expect(configurationSectionsForContext("database")).toEqual([
      "sensitive",
      "history",
      "palette",
      "layout",
      "language",
      "tutorial",
    ])
    expect(configurationSectionsForContext("git")).toEqual([
      "git",
      "palette",
      "layout",
      "language",
      "tutorial",
    ])
    expect(configurationSectionsForContext("global")).toEqual([
      "palette",
      "layout",
      "language",
      "tutorial",
    ])
  })

  test("moves focus away from a hidden Database section", () => {
    expect(normalizeConfigurationSectionForContext("history", "global")).toBe("palette")
    expect(normalizeConfigurationSectionForContext("sensitive", "git")).toBe("git")
    expect(normalizeConfigurationSectionForContext("history", "database")).toBe("history")
    expect(normalizeConfigurationSectionForContext("language", "global")).toBe("language")
  })
})
