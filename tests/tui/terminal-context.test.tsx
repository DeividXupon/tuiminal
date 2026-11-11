import "./setup"
import { afterEach, expect, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { TerminalContextTags } from "../../packages/feature-terminal/src/ui/TerminalContextTags"

let tui: TestRendererSetup | undefined

afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

test.each([48, 80, 120])(
  "remote metadata retains Git context alongside upload and sync at %s columns",
  async (width) => {
    await act(async () => {
      tui = await testRender(
        <TerminalContextTags
          sessionId="fixture"
          context={{
            directory: "/synthetic/tuiminal",
            projectName: "tuiminal",
            branch: "main",
            state: "dirty",
            changes: { additions: 8, deletions: 8, partial: false },
          }}
          sync={{ kind: "unmapped" }}
          agentOrigin="remote"
          masterKey="Ctrl+B"
          availableWidth={width}
          onActivate={() => {}}
          onSendFiles={() => {}}
        />,
        { width, height: 4 },
      )
    })
    await act(async () => {
      await tui?.renderOnce()
    })
    const frame = tui?.captureCharFrame()
    for (const text of ["tuiminal", "main", "+8 -8", "[.]", "[R]"]) expect(frame).toContain(text)
    const kinds = ["origin", "directory", "branch", "state", "upload", "sync"]
    let previousEnd = 0
    for (const kind of kinds) {
      const tag = tui?.renderer.root.findDescendantById(`terminal-context-${kind}-fixture`)
      if (!tag) throw new Error(`Missing ${kind} metadata`)
      expect(tag.screenX).toBeGreaterThanOrEqual(previousEnd)
      previousEnd = tag.screenX + tag.width
      expect(previousEnd).toBeLessThanOrEqual(width)
    }
  },
)
