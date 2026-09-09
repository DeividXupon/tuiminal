import { describe, expect, test } from "bun:test"
import { focusedRenderableId, ownsInterrupt, ownsKeyboardFocus } from "../src/core/keyboard/scope"
import { gitKeyboardScope } from "../src/features/git/keyboard"
import { httpKeyboardScope } from "../src/features/http/keyboard"
import { shutdownResources } from "../src/core/lifecycle/shutdown"
import { definedProperties } from "../src/shared/data/defined-properties"
import { runnerKeyboardScope } from "../src/features/runner/keyboard"
import { databaseKeyboardScope } from "../src/features/database/keyboard"
import { terminalKeyboardScope } from "../src/features/terminal/keyboard"
import { isToolId, resolveToolLaunch, TOOL_COMMANDS, TOOL_SHORTCUTS } from "../src/app/tool-catalog"
import { globalApplicationShortcut } from "../src/app/global-shortcuts"

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
    expect(ownsKeyboardFocus(gitKeyboardScope, "git-pr-action-modal")).toBe(true)
    expect(ownsKeyboardFocus(gitKeyboardScope, "git-pr-open-browser")).toBe(false)
    expect(ownsKeyboardFocus(httpKeyboardScope, "http-url-input")).toBe(true)
    expect(ownsKeyboardFocus(httpKeyboardScope, "http-response-scroll-scratch")).toBe(false)
  })

  test("stale or blurred renderables do not retain global shortcut ownership", () => {
    expect(focusedRenderableId({ id: "http-url-input", focused: true })).toBe("http-url-input")
    expect(focusedRenderableId({ id: "http-url-input", focused: false })).toBeUndefined()
    expect(focusedRenderableId({ id: "db-connection-name" })).toBeUndefined()
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
    expect(TOOL_SHORTCUTS.map((tool) => tool.key)).toEqual(["1", "2", "3", "4", "5"])
    for (const tool of Object.values(TOOL_COMMANDS)) expect(isToolId(tool)).toBe(true)
    expect(isToolId("unknown")).toBe(false)
    expect(isToolId("pomodoro")).toBe(false)
    expect(Object.hasOwn(TOOL_COMMANDS, "pomo")).toBe(false)
    expect(Object.hasOwn(TOOL_COMMANDS, "pomodoro")).toBe(false)
  })

  test("global tool shortcuts require Alt and preserve local number and symbol keys", () => {
    expect(globalApplicationShortcut({ name: "1", meta: true }, true, false)).toBe("database")
    expect(globalApplicationShortcut({ name: "2", option: true }, true, false)).toBe("git")
    expect(globalApplicationShortcut({ name: "3", meta: true }, true, false)).toBe("runner")
    expect(globalApplicationShortcut({ name: "4", option: true }, true, false)).toBe("http")
    expect(globalApplicationShortcut({ name: "5", meta: true }, true, false)).toBe("terminal")
    expect(globalApplicationShortcut({ name: "1" }, true, false)).toBeNull()
    expect(globalApplicationShortcut({ name: "1", ctrl: true }, true, false)).toBeNull()
    expect(globalApplicationShortcut({ name: "@", shift: true }, true, false)).toBeNull()
    expect(globalApplicationShortcut({ name: "1", meta: true }, false, false)).toBeNull()
    expect(globalApplicationShortcut({ name: "1", meta: true }, true, true)).toBeNull()
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
