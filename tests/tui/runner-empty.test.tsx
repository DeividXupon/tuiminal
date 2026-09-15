import "./setup"
import { expect, test } from "bun:test"
import { readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { Runner } from "../../packages/feature-runner/src/RunnerWorkspace"

test("Runner opens an empty directory and offers project selection", async () => {
  // This manifest belongs to tests/setup.ts, never to the opened user project.
  const manifest = join(process.env.TUIMINAL_WORKDIR!, "package.json")
  const original = readFileSync(manifest)
  unlinkSync(manifest)
  let tui: Awaited<ReturnType<typeof testRender>> | undefined
  try {
    tui = await testRender(<Runner active />, { width: 120, height: 35 })
    for (let attempt = 0; attempt < 150; attempt += 1) {
      await act(async () => Bun.sleep(10))
      await tui.renderOnce()
      if (tui.captureCharFrame().includes("Nenhum projeto encontrado nesta pasta.")) break
    }
    expect(tui.captureCharFrame()).toContain("Nenhum projeto encontrado nesta pasta.")
    expect(tui.captureCharFrame()).toContain("[N] Escolher projeto")
  } finally {
    act(() => tui?.renderer.destroy())
    writeFileSync(manifest, original)
  }
})
