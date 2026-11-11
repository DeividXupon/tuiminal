import "./setup"
import { afterEach, expect, mock, test } from "bun:test"
import type { DiffRenderable, ScrollBoxRenderable } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useRef, useState } from "react"
import { useLiveDiffPatch } from "../../packages/feature-terminal/src/hooks/use-live-diff-patch"
import type { LiveDiffFile } from "../../packages/feature-terminal/src/model/live-diff"

let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

const file: LiveDiffFile = {
  root: "/fixture",
  path: "file.ts",
  fingerprint: "first",
  additions: 1,
  deletions: 0,
  untracked: true,
  newFile: true,
  headExists: true,
  changedAt: 1,
}
const patch = (line: string) => `--- /dev/null\n+++ b/file.ts\n@@ -0,0 +1 @@\n+${line}\n`

async function mount(readPatch: (file: LiveDiffFile, signal: AbortSignal) => Promise<string>) {
  let update = (_file: LiveDiffFile) => {}
  function Preview() {
    const [selected, setSelected] = useState(file)
    update = setSelected
    const preview = useRef<ScrollBoxRenderable | null>(null)
    const diff = useRef<DiffRenderable | null>(null)
    const { patch } = useLiveDiffPatch(
      selected,
      false,
      [selected],
      true,
      "#ffffff",
      preview,
      diff,
      readPatch,
      25,
    )
    return <text>{patch || "waiting"}</text>
  }
  await act(async () => {
    tui = await testRender(<Preview />, { width: 60, height: 8 })
  })
  return (selected: LiveDiffFile) => act(async () => update(selected))
}

async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await act(async () => Bun.sleep(10))
    await tui?.renderOnce()
    if (check()) return
  }
  expect(check()).toBe(true)
}

test("remote preview retries a failed read without requiring another repository change", async () => {
  const read = mock(async (_file: LiveDiffFile, _signal: AbortSignal) =>
    patch("recovered"),
  ).mockRejectedValueOnce(new Error("Disconnected"))
  await mount(read)
  await waitFor(() => Boolean(tui?.captureCharFrame().includes("+recovered")))
  expect(read).toHaveBeenCalledTimes(2)
  expect(read.mock.calls[0]?.[0]).toBe(read.mock.calls[1]?.[0])
})

test("remote preview preserves its last patch during failure and stops retries on close", async () => {
  let failed = false
  const read = mock(async (_file: LiveDiffFile, _signal: AbortSignal) => {
    if (failed) throw new Error("Disconnected")
    return patch("last snapshot")
  })
  const select = await mount(read)
  await waitFor(() => Boolean(tui?.captureCharFrame().includes("+last snapshot")))
  failed = true
  await select({ ...file, fingerprint: "updated" })
  await waitFor(() => read.mock.calls.length >= 3)
  expect(tui?.captureCharFrame()).toContain("+last snapshot")
  act(() => tui?.renderer.destroy())
  tui = undefined
  const attempts = read.mock.calls.length
  expect(read.mock.calls.at(-1)?.[1].aborted).toBe(true)
  await Bun.sleep(75)
  expect(read).toHaveBeenCalledTimes(attempts)
})
