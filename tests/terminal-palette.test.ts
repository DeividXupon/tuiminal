import { expect, test } from "bun:test"
import type { TerminalColors } from "@opentui/core"
import { hostTerminalPaletteSequence } from "../packages/feature-terminal/src/rendering/terminal-palette"

test("host palette sequence includes only valid reported colors", () => {
  const colors = {
    palette: ["#123456", null, "#abcdef", "#12;34;56"],
    defaultForeground: "#fefefe",
    defaultBackground: "#090a0b",
    cursorColor: null,
  } as TerminalColors
  expect(hostTerminalPaletteSequence(colors)).toBe(
    "\u001b]4;0;rgb:12/34/56\u001b\\" +
      "\u001b]4;2;rgb:ab/cd/ef\u001b\\" +
      "\u001b]10;rgb:fe/fe/fe\u001b\\" +
      "\u001b]11;rgb:09/0a/0b\u001b\\",
  )
})
