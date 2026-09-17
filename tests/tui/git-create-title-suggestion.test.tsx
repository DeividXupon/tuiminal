import "./setup"
import { afterEach, expect, spyOn, test } from "bun:test"
import type { TestRendererSetup } from "@opentui/core/testing"
import { testRender } from "@opentui/react/test-utils"
import { act, useState } from "react"
import type { GitHubCreateDraft } from "../../packages/feature-git/src/model/create-item"
import * as titleReader from "../../packages/feature-git/src/services/github/branch-commit-title"
import { useGitHubCreateTitleSuggestion } from "../../packages/feature-git/src/ui/shared/useGitHubCreateTitleSuggestion"

let tui: TestRendererSetup | undefined
afterEach(() => {
  act(() => tui?.renderer.destroy())
  tui = undefined
})

test("late commit titles cannot replace a newer branch or a manually edited title", async () => {
  const requests: Array<{
    branch: string
    signal: AbortSignal | undefined
    resolve: (title: string) => void
  }> = []
  const reader = spyOn(titleReader, "readGitHubBranchCommitTitle").mockImplementation(
    (_host, _repository, branch, options) =>
      new Promise((resolve) => {
        requests.push({ branch, signal: options?.signal, resolve })
      }),
  )
  try {
    let changeDraft!: (patch: Partial<GitHubCreateDraft>) => void
    let resetSuggestion!: () => void
    let setOpenValue!: (open: boolean) => void
    let currentDraft!: GitHubCreateDraft
    function Harness() {
      const [open, setOpen] = useState(true)
      const [draft, setDraft] = useState<GitHubCreateDraft>({
        kind: "pr",
        repository: "team/api",
        head: "feat/one",
        base: "main",
        title: "",
        body: "",
      })
      const suggestion = useGitHubCreateTitleSuggestion(draft, setDraft, open, "github.com", false)
      changeDraft = suggestion.changeDraft
      resetSuggestion = suggestion.reset
      setOpenValue = setOpen
      currentDraft = draft
      return <text content={`${draft.title} · ${suggestion.status}`} />
    }
    tui = await testRender(<Harness />, { width: 60, height: 10 })
    await tui.renderOnce()
    expect(requests.map((request) => request.branch)).toEqual(["feat/one"])

    act(() => changeDraft({ head: "feat/two" }))
    await tui.renderOnce()
    expect(requests.map((request) => request.branch)).toEqual(["feat/one", "feat/two"])
    expect(requests[0]?.signal?.aborted).toBe(true)
    await act(async () => requests[0]?.resolve("Old title"))
    await tui.renderOnce()
    expect(currentDraft.title).toBe("")

    await act(async () => requests[1]?.resolve("Suggested title"))
    await tui.renderOnce()
    expect(currentDraft.title).toBe("Suggested title")

    act(() => changeDraft({ head: "feat/three" }))
    await tui.renderOnce()
    expect(currentDraft.title).toBe("")
    act(() => changeDraft({ title: "My own title" }))
    await tui.renderOnce()
    await act(async () => requests[2]?.resolve("Late title"))
    await tui.renderOnce()
    expect(currentDraft.title).toBe("My own title")

    act(() => {
      resetSuggestion()
      changeDraft({ head: "feat/four" })
    })
    await tui.renderOnce()
    expect(currentDraft.title).toBe("")
    act(() => setOpenValue(false))
    await tui.renderOnce()
    expect(requests[3]?.signal?.aborted).toBe(true)
    await act(async () => requests[3]?.resolve("Closed title"))
    await tui.renderOnce()
    expect(currentDraft.title).toBe("")
  } finally {
    reader.mockRestore()
  }
})
