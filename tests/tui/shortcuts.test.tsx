import "./setup"
import { afterEach, expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { ShortcutText } from "../../src/shared/ui/ShortcutText"
import { InlineButton } from "../../src/shared/ui/InlineButton"
import {
  COLORS,
  getUiSettings,
  PALETTES,
  updateUiSettings,
  type PaletteId,
} from "../../src/core/settings/theme"
import { App } from "../../src/app/App"

let tui: TestRendererSetup | undefined
const initialSettings = getUiSettings()

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  updateUiSettings(initialSettings)
})

function colorOf(text: string) {
  const span = tui
    ?.captureSpans()
    .lines.flatMap((line) => line.spans)
    .find((span) => span.text.includes(text))
  if (!span) throw new Error(`Missing colored span: ${text}\n${tui?.captureCharFrame()}`)
  return span.fg.toInts()
}

test("native rendering changes only UI shortcuts, not labels or bracketed log data", async () => {
  tui = await testRender(
    <box>
      <ShortcutText content="Ação [Ctrl+S]" style={{ fg: "#F7C873" }} />
      <text content="log [x] = [1, 2]" style={{ fg: "#FF6B6B" }} />
      <ShortcutText highlight={false} content="sql [column]" style={{ fg: "#FF6B6B" }} />
      <InlineButton label="Fechar [Ctrl+X]" onPress={() => undefined} />
    </box>,
    { width: 80, height: 12 },
  )
  await tui.renderOnce()
  expect(colorOf("[Ctrl+S]")).toEqual(RGBA.fromHex("#4B75FF").toInts())
  expect(colorOf("[Ctrl+X]")).toEqual(RGBA.fromHex("#4B75FF").toInts())
  expect(colorOf("Ação")).toEqual(RGBA.fromHex("#F7C873").toInts())
  expect(colorOf("log [x]")).toEqual(RGBA.fromHex("#FF6B6B").toInts())
  expect(colorOf("sql [column]")).toEqual(RGBA.fromHex("#FF6B6B").toInts())
  expect(tui.captureCharFrame()).toContain("Ação [Ctrl+S]")
})

for (const palette of Object.keys(PALETTES) as PaletteId[]) {
  for (const layout of ["compact", "framed"] as const) {
    test(`logo and global shortcuts share the brand accent: ${palette}/${layout}`, async () => {
      updateUiSettings({ palette, layout, language: "pt-BR" })
      tui = await testRender(<App />, { width: 180, height: 36 })
      await tui.waitForFrame((frame) => frame.includes("TUIMINAL") && frame.includes("[Q]"))
      expect(colorOf("TUIMINAL")).toEqual(RGBA.fromHex("#4B75FF").toInts())
      expect(colorOf("[Q]")).toEqual(colorOf("TUIMINAL"))
      expect(colorOf("Config")).toEqual(RGBA.fromHex(COLORS.muted).toInts())
    })
  }
}

test("translation and wide glyphs retain their text and shortcut accent", async () => {
  updateUiSettings({ language: "ja" })
  tui = await testRender(<ShortcutText content="Digite uma URL e pressione [Enter]." />, {
    width: 80,
    height: 6,
  })
  await tui.renderOnce()
  expect(tui.captureCharFrame()).not.toContain("Digite uma URL")
  expect(colorOf("[Enter]")).toEqual(RGBA.fromHex("#4B75FF").toInts())
})

test("directional hints distinguish the A/F key from the semantic arrow", async () => {
  tui = await testRender(
    <ShortcutText content="[A←] anterior  [F→] próximo" style={{ fg: "#A0A0A0" }} />,
    { width: 40, height: 4 },
  )
  await tui.renderOnce()
  expect(colorOf("[A")).toEqual(RGBA.fromHex("#4B75FF").toInts())
  expect(colorOf("[F")).toEqual(RGBA.fromHex("#4B75FF").toInts())
  expect(colorOf("←]")).toEqual(RGBA.fromHex("#A0A0A0").toInts())
  expect(colorOf("→]")).toEqual(RGBA.fromHex("#A0A0A0").toInts())
})
