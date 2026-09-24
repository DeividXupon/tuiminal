import { expect, test } from "bun:test"
import {
  nextTerminalFocusTarget,
  TERMINAL_SIDEBAR_FOCUS_TARGET,
  terminalFocusTargetKey,
  terminalFocusTargetRenderableId,
} from "../packages/feature-terminal/src/model/focus-selection"

const left = {
  key: terminalFocusTargetKey("terminal", "left"),
  left: 0,
  top: 0,
  width: 40,
  height: 20,
}
const right = {
  key: terminalFocusTargetKey("live-diff", "left"),
  left: 40,
  top: 0,
  width: 30,
  height: 40,
}
const below = {
  key: terminalFocusTargetKey("history", "left"),
  left: 0,
  top: 20,
  width: 40,
  height: 20,
}
const targets = [left, right, below]

test("the sidebar has a stable focus target and renderable", () => {
  expect(TERMINAL_SIDEBAR_FOCUS_TARGET).toBe("sidebar:main")
  expect(terminalFocusTargetRenderableId(TERMINAL_SIDEBAR_FOCUS_TARGET)).toBe("terminal-sidebar")
})

test("box focus navigation follows each spatial direction", () => {
  expect(nextTerminalFocusTarget(targets, left.key, "right")).toBe(right.key)
  expect(nextTerminalFocusTarget(targets, left.key, "down")).toBe(below.key)
  expect(nextTerminalFocusTarget(targets, below.key, "up")).toBe(left.key)
  expect(nextTerminalFocusTarget(targets, right.key, "left")).toBe(left.key)
})

test("box focus navigation keeps the selection when no box exists in that direction", () => {
  expect(nextTerminalFocusTarget(targets, left.key, "left")).toBe(left.key)
  expect(nextTerminalFocusTarget(targets, left.key, "up")).toBe(left.key)
})
