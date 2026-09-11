import { describe, expect, test } from "bun:test"
import {
  runnerFocusDestination,
  runnerHistoryPanelHeight,
  runnerLogIsAtBottom,
  runnerProjectCloseResult,
  runnerProjectPickerShortcut,
} from "../src/features/runner/model/navigation"

describe("Runner spatial keyboard navigation", () => {
  test("opens the project picker with the global N convention", () => {
    expect(runnerProjectPickerShortcut({ name: "n" })).toBe(true)
    expect(runnerProjectPickerShortcut({ name: "N" })).toBe(true)
    expect(runnerProjectPickerShortcut({ name: "=" })).toBe(false)
    expect(runnerProjectPickerShortcut({ name: "p" })).toBe(false)
    expect(runnerProjectPickerShortcut({ name: "n", ctrl: true })).toBe(false)
    expect(runnerProjectPickerShortcut({ name: "n", shift: true })).toBe(false)
    expect(runnerProjectPickerShortcut({ name: "n", meta: true })).toBe(false)
    expect(runnerProjectPickerShortcut({ name: "n", super: true })).toBe(false)
  })

  test("moves between commands, log, and history without stealing local navigation", () => {
    expect(runnerFocusDestination("commands", "right")).toBe("log")
    expect(runnerFocusDestination("commands", "l")).toBe("log")
    expect(runnerFocusDestination("log", "left")).toBe("commands")
    expect(runnerFocusDestination("log", "h")).toBe("commands")
    expect(runnerFocusDestination("history", "left", { historyIndex: 2 })).toBe("commands")
    expect(runnerFocusDestination("history", "h", { historyIndex: 2 })).toBe("commands")
    expect(runnerFocusDestination("history", "up", { historyIndex: 0 })).toBe("log")
    expect(runnerFocusDestination("history", "k", { historyIndex: 0 })).toBe("log")

    expect(runnerFocusDestination("history", "up", { historyIndex: 1 })).toBeNull()
    expect(runnerFocusDestination("history", "j", { historyIndex: 1 })).toBeNull()
    expect(runnerFocusDestination("log", "j")).toBeNull()
    expect(runnerFocusDestination("log", "k")).toBeNull()
  })

  test("moves from the bottom of the log into an available history", () => {
    const bottomContext = { historyAvailable: true, logAtBottom: true }
    expect(runnerFocusDestination("log", "down", bottomContext)).toBe("history")
    expect(runnerFocusDestination("log", "j", bottomContext)).toBe("history")
    expect(
      runnerFocusDestination("log", "down", {
        ...bottomContext,
        logAtBottom: false,
      }),
    ).toBeNull()
    expect(
      runnerFocusDestination("log", "down", {
        ...bottomContext,
        historyAvailable: false,
      }),
    ).toBeNull()
  })

  test("detects the bottom edge with a small rendering tolerance", () => {
    expect(runnerLogIsAtBottom(80, 100, 20)).toBe(true)
    expect(runnerLogIsAtBottom(79, 100, 20)).toBe(true)
    expect(runnerLogIsAtBottom(78, 100, 20)).toBe(false)
    expect(runnerLogIsAtBottom(0, 10, 20)).toBe(true)
  })

  test("closes project tabs and selects the nearest remaining neighbor", () => {
    expect(runnerProjectCloseResult(["a", "b", "c"], "b", "b")).toEqual({
      openedProjects: ["a", "c"],
      activeProject: "c",
      closed: true,
    })
    expect(runnerProjectCloseResult(["a", "b", "c"], "c", "c")).toEqual({
      openedProjects: ["a", "b"],
      activeProject: "b",
      closed: true,
    })
    expect(runnerProjectCloseResult(["a", "b"], "b", "a")).toEqual({
      openedProjects: ["a"],
      activeProject: "a",
      closed: true,
    })
    expect(runnerProjectCloseResult(["a"], "a", "a")).toEqual({
      openedProjects: [],
      activeProject: null,
      closed: true,
    })
  })

  test("reserves room for at most eight visible history items", () => {
    expect(runnerHistoryPanelHeight(20, false)).toBe(10)
    expect(runnerHistoryPanelHeight(8, false)).toBe(10)
    expect(runnerHistoryPanelHeight(3, false)).toBe(5)
    expect(runnerHistoryPanelHeight(20, true)).toBe(0)
  })
})
