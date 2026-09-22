import "./setup"
import { expect, test } from "bun:test"
import {
  CliRenderEvents,
  type EmbeddedTerminalRenderable,
  RGBA,
  type TerminalColors,
} from "@opentui/core"
import { useRenderer } from "@opentui/react"
import { testRender } from "@opentui/react/test-utils"
import { act, type ReactNode, useLayoutEffect } from "react"
import { useTerminalPalette } from "../../packages/feature-terminal/src/hooks/use-terminal-palette"
import type { TerminalSession } from "../../packages/feature-terminal/src/model/sessions"
import { FreeTerminalPane } from "../../packages/feature-terminal/src/ui/FreeTerminalPane"

test("embedded terminal loads and updates host colors without changing RGB output", async () => {
  const initialColors = {
    palette: [null, "#876543"],
    defaultForeground: "#fefefe",
    defaultBackground: "#101112",
    cursorColor: null,
  } as TerminalColors
  const paletteResult = Promise.withResolvers<TerminalColors>()
  let requestedSize: number | undefined
  function HostPalette({ children }: { children: ReactNode }) {
    const renderer = useRenderer()
    useLayoutEffect(() => {
      const original = renderer.getPalette
      renderer.getPalette = (options) => {
        requestedSize = options?.size
        return paletteResult.promise
      }
      return () => {
        renderer.getPalette = original
      }
    }, [renderer])
    return children
  }
  const session: TerminalSession = {
    id: "test",
    sectionId: "section",
    folderId: "terminal",
    row: 0,
    column: 0,
    title: "test",
    status: "running",
    pid: 1,
    exitCode: null,
    startedAt: 1,
    agent: null,
    kind: "shell",
    label: "test",
    shortLabel: "TTY",
    displayCommand: "sh",
    command: ["sh"],
    accent: "#ffffff",
  }
  let terminal: EmbeddedTerminalRenderable | undefined
  function PalettePane() {
    const paletteSequence = useTerminalPalette()
    return (
      <FreeTerminalPane
        session={session}
        active
        visible
        appearanceKey="test"
        paletteSequence={paletteSequence}
        layout={{
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          borderTop: false,
          borderLeft: false,
        }}
        onActivate={() => {}}
        onReady={(_, current) => {
          terminal = current
        }}
        onGone={() => {}}
        onInput={() => {}}
        onResize={() => {}}
      />
    )
  }
  const tui = await testRender(
    <HostPalette>
      <PalettePane />
    </HostPalette>,
    { width: 12, height: 3 },
  )
  try {
    await act(async () => {
      paletteResult.resolve(initialColors)
      await paletteResult.promise
    })
    const current = terminal
    if (!current) throw new Error("Terminal did not mount")
    current.write("\u001b[31mR\u001b[0m \u001b[38;5;1mI\u001b[0m \u001b[38;2;9;8;7mT\u001b[0m D")
    await tui.renderOnce()
    expect(requestedSize).toBe(16)
    expect(tui.renderer.listenerCount(CliRenderEvents.PALETTE)).toBe(1)
    expect(
      tui
        .captureSpans()
        .lines[0]?.spans.find((span) => span.text.includes("R"))
        ?.fg.toInts(),
    ).toEqual(RGBA.fromHex("#876543").toInts())

    const colors = {
      palette: [null, "#123456"],
      defaultForeground: "#abcdef",
      defaultBackground: "#202122",
      cursorColor: null,
    } as TerminalColors
    act(() => tui.renderer.emit(CliRenderEvents.PALETTE, colors))
    await tui.renderOnce()

    const spans = tui.captureSpans().lines[0]?.spans ?? []
    const colorOf = (letter: string) => spans.find((span) => span.text.includes(letter))
    expect(colorOf("R")?.fg.toInts()).toEqual(RGBA.fromHex("#123456").toInts())
    expect(colorOf("I")?.fg.toInts()).toEqual(RGBA.fromHex("#123456").toInts())
    expect(colorOf("T")?.fg.toInts()).toEqual(RGBA.fromInts(9, 8, 7).toInts())
    expect(colorOf("D")?.fg.toInts()).toEqual(RGBA.fromHex("#abcdef").toInts())
    expect(colorOf("D")?.bg.toInts()).toEqual(RGBA.fromHex("#202122").toInts())
  } finally {
    act(() => tui.renderer.destroy())
  }
})
