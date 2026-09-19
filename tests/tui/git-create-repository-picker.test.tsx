import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import * as catalog from "../../packages/feature-git/src/services/github/repository-catalog"
import { GitHubCreateRepositoryPicker } from "../../packages/feature-git/src/ui/shared/GitHubCreateRepositoryPicker"

let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

test("repository picker retains the current choice and cancels its catalog read on close", async () => {
  let resolveCatalog!: (
    value: Awaited<ReturnType<typeof catalog.loadGitHubRepositoryCatalog>>,
  ) => void
  let signal: AbortSignal | undefined
  const read = spyOn(catalog, "loadGitHubRepositoryCatalog").mockImplementation(({ options }) => {
    signal = options?.signal
    return new Promise((resolve) => {
      resolveCatalog = resolve
    })
  })
  try {
    function Harness() {
      const [open, setOpen] = useState(true)
      return open ? (
        <GitHubCreateRepositoryPicker
          host="github.com"
          selected="team/api"
          demo={false}
          onSelect={() => {}}
          onClose={() => setOpen(false)}
        />
      ) : (
        <text id="closed" content="closed" />
      )
    }
    tui = await testRender(<Harness />, { width: 100, height: 30 })
    await tui.renderOnce()
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    expect(tui.captureCharFrame()).toContain("team/api")
    expect(signal?.aborted).toBe(false)
    act(() => tui?.mockInput.pressEscape())
    await act(async () => Bun.sleep(60))
    await tui.renderOnce()
    expect(Boolean(tui.renderer.root.findDescendantById("closed"))).toBe(true)
    expect(signal?.aborted).toBe(true)
    await act(async () => resolveCatalog({ repositories: ["team/web"], partial: false }))
    await tui.renderOnce()
    expect(Boolean(tui.renderer.root.findDescendantById("git-create-repository-picker"))).toBe(
      false,
    )
  } finally {
    read.mockRestore()
  }
})

test("repository picker bounds visible rows while search reaches the full catalog", async () => {
  const read = spyOn(catalog, "loadGitHubRepositoryCatalog").mockResolvedValue({
    repositories: Array.from({ length: 150 }, (_, index) => `team/repo${index}`),
    partial: false,
  })
  try {
    tui = await testRender(
      <GitHubCreateRepositoryPicker
        host="github.com"
        selected=""
        demo={false}
        onSelect={() => {}}
        onClose={() => {}}
      />,
      { width: 100, height: 30 },
    )
    await act(async () => Bun.sleep(10))
    await tui.renderOnce()
    expect(tui.captureCharFrame()).toContain("Mais repositórios disponíveis")
    const search = tui.renderer.root.findDescendantById("git-create-repository-search")
    if (!search) throw new Error("Repository search did not mount")
    await act(async () => {
      await tui?.mockMouse.click(search.screenX + 2, search.screenY)
      tui?.mockInput.typeText("repo149")
    })
    await tui.renderOnce()
    expect(tui.captureCharFrame()).toContain("team/repo149")
    expect(tui.captureCharFrame()).not.toContain("Mais repositórios disponíveis")
  } finally {
    read.mockRestore()
  }
})
