import { describe, expect, test } from "bun:test"
import {
  configurationSectionsForContext,
  normalizeConfigurationSectionForContext,
} from "../src/app/ui/ConfigurationModal"

describe("contextual settings", () => {
  test("shows Database settings first only in the Database context", () => {
    expect(configurationSectionsForContext(true)).toEqual([
      "sensitive",
      "history",
      "palette",
      "layout",
      "language",
      "tutorial",
    ])
    expect(configurationSectionsForContext(false)).toEqual([
      "palette",
      "layout",
      "language",
      "tutorial",
    ])
  })

  test("moves focus away from a hidden Database section", () => {
    expect(normalizeConfigurationSectionForContext("history", false)).toBe("palette")
    expect(normalizeConfigurationSectionForContext("sensitive", false)).toBe("palette")
    expect(normalizeConfigurationSectionForContext("history", true)).toBe("history")
    expect(normalizeConfigurationSectionForContext("language", false)).toBe("language")
  })
})
