import { expect, test } from "bun:test"
import { resolveHttpKeyboardCommand } from "../packages/feature-http/src/model/keyboard"

const command = (shift: boolean, focusedId = "", overlay: "help" | null = null) =>
  resolveHttpKeyboardCommand({
    key: { name: "r", shift },
    focusedId,
    overlay,
    navigationOpen: false,
    running: false,
    minimum: false,
  })

test("R focuses request and Shift+R focuses response", () => {
  expect(command(false)).toEqual({ kind: "pane", pane: "request" })
  expect(command(true)).toEqual({ kind: "pane", pane: "response" })
})

test("pane shortcuts preserve input, editor, search and modal ownership", () => {
  for (const id of [
    "http-url-input",
    "http-script-editor-preRequest-fixture",
    "http-body-editor-fixture",
    "http-response-search-fixture",
    "http-collection-search",
    "http-auth-token-fixture",
    "http-environment-cell-0-value",
    "http-key-value-name-fixture",
  ]) {
    expect(command(false, id)).toEqual({ kind: "ignore" })
    expect(command(true, id)).toEqual({ kind: "ignore" })
  }
  expect(command(false, "", "help")).toEqual({ kind: "ignore" })
  expect(command(true, "", "help")).toEqual({ kind: "ignore" })
})
