import "./setup"
import { afterEach, expect, test } from "bun:test"
import { act, useState } from "react"
import { useTerminalDimensions } from "@opentui/react"
import { testRender } from "@opentui/react/test-utils"
import type { TestRendererSetup } from "@opentui/core/testing"
import type { ScrollBoxRenderable } from "@opentui/core"
import { writeFileSync } from "node:fs"
import { updateUiSettings } from "../../packages/core/src/settings/theme"
import { HttpResponsePane } from "../../packages/feature-http/src/ui/HttpResponsePane"
import type { HttpDocumentState } from "../../packages/feature-http/src/model/types"
import { responseTableFixture, responseTableCookies } from "../fixtures/http-response-table"

let tui: TestRendererSetup | undefined
let copied = ""
const noop = () => {}
const cookieFixture = responseTableCookies
function Harness({
  initial = responseTableFixture(),
  emptyCookies = false,
}: {
  initial?: HttpDocumentState
  emptyCookies?: boolean
}) {
  const [document, setDocument] = useState(initial)
  const { width, height } = useTerminalDimensions()
  return (
    <HttpResponsePane
      document={document}
      visible
      focused
      position={{ left: 0, top: 0, width, height }}
      cookies={emptyCookies ? [] : cookieFixture}
      registerScroll={noop}
      registerSearchInput={noop}
      onSelectView={(responseView) => setDocument((value) => ({ ...value, responseView }))}
      onPresentationChange={(patch) =>
        setDocument((value) => ({
          ...value,
          responsePresentation: { ...value.responsePresentation, ...patch },
        }))
      }
      onFocus={noop}
      onCopy={(value) => {
        copied = value
      }}
      onSave={noop}
      onOpen={noop}
      onDownload={noop}
      onCancelDownload={noop}
      onCancel={noop}
      downloading={false}
    />
  )
}
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
  copied = ""
})
async function settle(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (check()) return
  }
  throw new Error(tui?.captureCharFrame())
}
function node(id: string) {
  const found = tui?.renderer.root.findDescendantById(id)
  if (!found) throw new Error(`Missing ${id}`)
  return found
}
async function click(id: string) {
  await settle(() => true)
  const target = node(id)
  await act(async () => tui?.mockMouse.click(target.screenX + 1, target.screenY))
  await tui?.renderOnce()
}
for (const layout of ["compact", "framed"] as const) {
  for (const colorMode of ["dark", "light"] as const) {
    test.each([34, 52, 100])(
      `all response tabs use colored tables in ${layout}/${colorMode} at %s columns`,
      async (width) => {
        updateUiSettings({ layout, colorMode, language: "pt-BR" })
        tui = await testRender(<Harness />, { width, height: 30 })
        await settle(() =>
          Boolean(tui?.renderer.root.findDescendantById("http-response-json-table")),
        )
        for (const view of [
          "raw",
          "headers",
          "timing",
          "summary",
          "cookies",
          "redirects",
          "assertions",
          "console",
        ]) {
          if (["raw", "headers", "timing"].includes(view)) await click(`http-response-view-${view}`)
          else {
            await click("http-response-view-more")
            await click(`http-response-more-${view}`)
          }
          await settle(() =>
            Boolean(tui?.renderer.root.findDescendantById("http-response-table-table")),
          )
          const table = node("http-response-table-table")
          const scroll = node("http-response-scroll-table") as ScrollBoxRenderable
          expect(table.width).toBeLessThanOrEqual(scroll.viewport.width)
          expect(tui.captureCharFrame()).toContain("┌")
          expect(tui.captureCharFrame()).toContain("│")
          const spans = tui
            .captureSpans()
            .lines.slice(table.screenY, scroll.screenY + scroll.height)
            .flatMap((line) => line.spans)
          const colors = new Set(
            spans
              .filter((span) => span.text.trim())
              .map((span) => JSON.stringify(span.fg.toInts())),
          )
          expect(colors.size).toBeGreaterThanOrEqual(3)
          writeFileSync(
            `/tmp/http-response-${layout}-${colorMode}-${width}-${view}.txt`,
            tui.captureCharFrame(),
          )
          if (view === "cookies")
            expect(tui.captureCharFrame()).not.toContain("PRIVATE_COOKIE_FIXTURE")
          await click("http-response-copy-table")
          expect(copied.length).toBeGreaterThan(0)
        }
        await click("http-response-view-pretty")
        expect(Boolean(tui.renderer.root.findDescendantById("http-response-json-table"))).toBe(true)
        expect(Boolean(tui.renderer.root.findDescendantById("http-response-table-table"))).toBe(
          false,
        )
      },
    )
  }
}

test("table search follows wrapped values through resizing and copies the complete logical row", async () => {
  updateUiSettings({ layout: "framed", colorMode: "dark", language: "pt-BR" })
  const initial = responseTableFixture()
  initial.responseView = "headers"
  tui = await testRender(<Harness initial={initial} />, { width: 100, height: 24 })
  await click("http-response-search-open-table")
  await settle(() => tui?.renderer.currentFocusedRenderable?.id === "http-response-search-table")
  await act(async () => tui?.mockInput.typeText("continuous-searchable-identifier"))
  await settle(() => tui?.captureCharFrame().includes("1/1") ?? false)
  for (const width of [34, 52, 100]) {
    await act(async () => tui?.resize(width, 24))
    await settle(() => tui?.captureCharFrame().includes("1/1") ?? false)
    const frame = tui.captureCharFrame()
    expect(frame).toContain("Copiar linha")
    const lines = frame.split("\n")
    const row = lines.findIndex((line) => line.includes("Copiar linha"))
    await act(async () => tui?.mockMouse.click((lines[row]?.indexOf("Copiar linha") ?? 0) + 1, row))
    expect(copied).toContain("long-continuous-searchable-identifier-中文-👩‍💻-ending")
    expect(copied).not.toContain("│")
  }
})

test.each(["text", "xml", "html", "binary"] as const)(
  "Pretty uses a table for a %s body",
  async (bodyKind) => {
    const initial = responseTableFixture()
    if (initial.execution.status !== "success") throw new Error("No response")
    initial.execution.response.bodyKind = bodyKind
    initial.execution.response.contentType =
      bodyKind === "binary" ? "application/octet-stream" : `text/${bodyKind}`
    initial.execution.response.body = new TextEncoder().encode("<data>fixture</data>\nsecond line")
    tui = await testRender(<Harness initial={initial} />, { width: 80, height: 24 })
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-response-table-table")))
    expect(tui.captureCharFrame()).toContain(bodyKind === "binary" ? "octet-stream" : "fixture")
  },
)

test.each(["headers", "cookies", "redirects", "assertions"])(
  "empty %s keeps table headings and an honest empty message",
  async (view) => {
    const initial = responseTableFixture()
    if (initial.execution.status !== "success") throw new Error("No response")
    initial.execution.response.headers = []
    initial.execution.response.redirects = []
    initial.execution.response.assertions = []
    initial.responseView = view === "headers" ? "headers" : "more"
    initial.responsePresentation.moreView =
      view === "headers" ? "summary" : (view as "cookies" | "redirects" | "assertions")
    tui = await testRender(<Harness initial={initial} emptyCookies />, { width: 80, height: 24 })
    await settle(() => Boolean(tui?.renderer.root.findDescendantById("http-response-table-table")))
    expect(tui.captureCharFrame()).toContain("Nenhum")
    expect(tui.captureCharFrame()).toContain("┌")
  },
)
