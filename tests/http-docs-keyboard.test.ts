import { expect, test } from "bun:test"
import { resolveHttpKeyboardCommand } from "../packages/feature-http/src/model/keyboard"
import { httpKeyboardScope } from "../packages/feature-http/src/keyboard"

test("the Docs editor owns text and Escape while retaining request save commands", () => {
  const command = (name: string, ctrl = false) =>
    resolveHttpKeyboardCommand({
      key: { name, ctrl },
      focusedId: "http-docs-editor-fixture",
      requestView: "more",
      requestMoreView: "docs",
      activePane: "request",
      navigationOpen: false,
      running: false,
      minimum: false,
    })
  for (const name of ["a", "f", "e", "s", "m", "?", "tab", "enter", "escape"]) {
    expect(command(name)).toEqual({ kind: "ignore" })
  }
  expect(command("enter", true)).toEqual({ kind: "ignore" })
  expect(command("s", true)).toEqual({ kind: "save-document" })
  expect(command("p", true)).toEqual({ kind: "push-postman-document" })
  expect(httpKeyboardScope.prefixes).toContain("http-docs-editor-")
})

test("HTTP uses plus/minus for split sizing and X for closing, without stealing input", () => {
  const command = (name: string, focusedId = "", ctrl = false) =>
    resolveHttpKeyboardCommand({
      key: { name, ctrl },
      focusedId,
      activePane: "request",
      navigationOpen: false,
      running: false,
      minimum: false,
    })
  expect(command("+")).toEqual({ kind: "resize-split", direction: 1 })
  expect(command("-")).toEqual({ kind: "resize-split", direction: -1 })
  expect(command("x")).toEqual({ kind: "close-document" })
  expect(command("w")).toEqual({ kind: "open-overlay", overlay: "curl-export" })
  expect(command("w", "", true)).toEqual({ kind: "close-document" })
  expect(command("up", "", true).kind).not.toBe("resize-split")
  expect(command("down", "", true).kind).not.toBe("resize-split")
  for (const key of ["+", "-", "w", "x"])
    expect(command(key, "http-environment-name")).toEqual({ kind: "ignore" })
})
