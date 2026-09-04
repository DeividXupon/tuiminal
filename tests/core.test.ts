import { describe, expect, test } from "bun:test"
import { ownsInterrupt, ownsKeyboardFocus } from "../src/core/keyboard/scope"
import { shutdownResources } from "../src/core/lifecycle/shutdown"
import { definedProperties } from "../src/shared/data/defined-properties"
import { runnerKeyboardScope } from "../src/features/runner/keyboard"
import { databaseKeyboardScope } from "../src/features/database/keyboard"
import { terminalKeyboardScope } from "../src/features/terminal/keyboard"
import { isToolId, resolveToolLaunch, TOOL_COMMANDS, TOOL_SHORTCUTS } from "../src/app/tool-catalog"

describe("application boundaries", () => {
  test("focused modal and input scopes retain keyboard ownership", () => {
    for (const id of [
      ...runnerKeyboardScope.ids,
      "runner-save-command-dialog",
      "runner-save-command-name",
    ]) {
      expect(ownsKeyboardFocus(runnerKeyboardScope, id)).toBe(true)
    }
    expect(ownsKeyboardFocus(runnerKeyboardScope, "runner-log")).toBe(false)
    expect(ownsKeyboardFocus(runnerKeyboardScope, undefined)).toBe(false)
    expect(ownsKeyboardFocus(databaseKeyboardScope, "database-saved-query-modal")).toBe(true)
    expect(ownsKeyboardFocus(databaseKeyboardScope, "db-connection-dialog")).toBe(true)
    expect(ownsInterrupt(databaseKeyboardScope, undefined)).toBe(true)
    expect(ownsInterrupt(terminalKeyboardScope, "free-terminal-1")).toBe(true)
    expect(ownsInterrupt(terminalKeyboardScope, "terminal-command-input")).toBe(false)
    expect(ownsInterrupt(runnerKeyboardScope, "runner-command-input")).toBe(false)
  })

  test("one failing resource never prevents another from shutting down", async () => {
    const disposed: string[] = []
    const results = await shutdownResources([
      () => {
        disposed.push("runner")
        throw new Error("fixture failure")
      },
      async () => {
        disposed.push("database")
      },
      () => {
        disposed.push("terminal")
      },
    ])
    expect(disposed).toEqual(["runner", "database", "terminal"])
    expect(results.map((result) => result.status)).toEqual(["rejected", "fulfilled", "fulfilled"])
  })

  test("configuration normalization omits undefined without dropping null, false, zero or empty text", () => {
    const original = { absent: undefined, empty: "", flag: false, count: 0, cleared: null }
    const normalized = definedProperties(original)
    expect(normalized).toEqual({ empty: "", flag: false, count: 0, cleared: null })
    expect(Object.hasOwn(normalized, "absent")).toBe(false)
    expect(Object.hasOwn(original, "absent")).toBe(true)
  })

  test("every CLI alias resolves to a unique registered tab", () => {
    expect(new Set(TOOL_SHORTCUTS.map((tool) => tool.tab)).size).toBe(5)
    expect(TOOL_SHORTCUTS.map((tool) => tool.symbol)).toEqual(["@", "#", "$", "%", "^"])
    for (const tool of Object.values(TOOL_COMMANDS)) expect(isToolId(tool)).toBe(true)
    expect(isToolId("unknown")).toBe(false)
    expect(isToolId("pomodoro")).toBe(false)
    expect(Object.hasOwn(TOOL_COMMANDS, "pomo")).toBe(false)
    expect(Object.hasOwn(TOOL_COMMANDS, "pomodoro")).toBe(false)
  })

  test("launches Runner by default and safely ignores obsolete tool IDs", () => {
    const defaults = { onlyTab: null, initialTab: "runner" } as const
    expect(resolveToolLaunch(undefined, undefined)).toEqual(defaults)
    expect(resolveToolLaunch("pomodoro", "pomodoro")).toEqual(defaults)
    expect(resolveToolLaunch("unknown", "unknown")).toEqual(defaults)
    expect(resolveToolLaunch("git", undefined)).toEqual({ onlyTab: null, initialTab: "git" })
    for (const { tab } of TOOL_SHORTCUTS) {
      expect(resolveToolLaunch("runner", tab)).toEqual({ onlyTab: tab, initialTab: tab })
    }
  })
})
