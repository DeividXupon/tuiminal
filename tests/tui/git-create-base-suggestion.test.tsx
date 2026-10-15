import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import type { GitHubCreateDraft } from "../../packages/feature-git/src/model/create-item"
import * as baseReader from "../../packages/feature-git/src/services/github/repository-default-branch"
import { useGitHubCreateDefaultBase } from "../../packages/feature-git/src/ui/shared/useGitHubCreateDefaultBase"

let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

test("default base follows the repository without replacing a manual choice or accepting late reads", async () => {
  const requests: Array<{
    repository: string
    signal: AbortSignal | undefined
    resolve: (branch: string) => void
  }> = []
  const reader = spyOn(baseReader, "readGitHubRepositoryDefaultBranch").mockImplementation(
    (_host, repository, options) =>
      new Promise((resolve) => {
        requests.push({ repository, signal: options?.signal, resolve })
      }),
  )
  try {
    let changeDraft!: (patch: Partial<GitHubCreateDraft>) => void
    let setOpenValue!: (open: boolean) => void
    let currentDraft!: GitHubCreateDraft
    function Harness() {
      const [open, setOpen] = useState(true)
      const [draft, setDraft] = useState<GitHubCreateDraft>({
        kind: "pr",
        repository: "team/api",
        head: "feat/one",
        base: "",
        title: "",
        body: "",
      })
      const suggestion = useGitHubCreateDefaultBase(draft, setDraft, open, "github.com", false)
      changeDraft = (patch) => {
        suggestion.noteChange(patch)
        setDraft((current) => ({
          ...current,
          ...patch,
          ...(patch.repository !== undefined ? { base: "" } : {}),
        }))
      }
      setOpenValue = setOpen
      currentDraft = draft
      return <text content={draft.base ?? ""} />
    }
    tui = await testRender(<Harness />, { width: 60, height: 10 })
    await tui.renderOnce()
    expect(requests.map((request) => request.repository)).toEqual(["team/api"])

    act(() => changeDraft({ repository: "team/web" }))
    await tui.renderOnce()
    expect(requests.map((request) => request.repository)).toEqual(["team/api", "team/web"])
    expect(requests[0]?.signal?.aborted).toBe(true)
    await act(async () => requests[0]?.resolve("old-main"))
    await tui.renderOnce()
    expect(currentDraft.base).toBe("")

    await act(async () => requests[1]?.resolve("develop"))
    await tui.renderOnce()
    expect(currentDraft.base).toBe("develop")

    act(() => changeDraft({ repository: "team/mobile" }))
    await tui.renderOnce()
    act(() => changeDraft({ base: "release" }))
    await tui.renderOnce()
    await act(async () => requests[2]?.resolve("trunk"))
    await tui.renderOnce()
    expect(currentDraft.base).toBe("release")

    act(() => changeDraft({ repository: "team/next" }))
    await tui.renderOnce()
    act(() => setOpenValue(false))
    await tui.renderOnce()
    expect(requests[3]?.signal?.aborted).toBe(true)
    await act(async () => requests[3]?.resolve("late-main"))
    await tui.renderOnce()
    expect(currentDraft.base).toBe("")
  } finally {
    reader.mockRestore()
  }
})
