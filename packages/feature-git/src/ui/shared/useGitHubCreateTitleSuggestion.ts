import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { type GitHubCreateDraft, validGitHubBranch } from "../../model/create-item"
import { DEMO_PULL_REQUESTS } from "../../model/pr/fixtures"
import { validateRepositoryName } from "../../model/pr/query"
import { readGitHubBranchCommitTitle } from "../../services/github/branch-commit-title"

type TitleSuggestionStatus = "idle" | "loading" | "error"

function demoCommitTitle(repository: string, branch: string) {
  return (
    DEMO_PULL_REQUESTS.find(
      (item) =>
        `${item.identity.owner}/${item.identity.repository}` === repository &&
        item.headBranch === branch,
    )?.title ?? ""
  )
}

function canSuggestTitle(
  kind: GitHubCreateDraft["kind"],
  repository: string,
  branch: string,
  open: boolean,
  manual: boolean,
) {
  return (
    open &&
    kind === "pr" &&
    !manual &&
    validateRepositoryName(repository) &&
    validGitHubBranch(branch)
  )
}

function withSuggestedTitle(
  current: GitHubCreateDraft,
  repository: string,
  branch: string,
  title: string,
) {
  return current.kind === "pr" &&
    current.repository.trim() === repository &&
    current.head === branch
    ? { ...current, title }
    : current
}

async function suggestedTitle(
  host: string,
  repository: string,
  branch: string,
  demo: boolean,
  signal: AbortSignal,
) {
  if (demo) return demoCommitTitle(repository, branch)
  const executable = process.env.TUIMINAL_GH_EXECUTABLE?.trim()
  return readGitHubBranchCommitTitle(host, repository, branch, {
    signal,
    ...(executable ? { executable } : {}),
  })
}

export function useGitHubCreateTitleSuggestion(
  draft: GitHubCreateDraft,
  setDraft: Dispatch<SetStateAction<GitHubCreateDraft>>,
  open: boolean,
  host: string | undefined,
  demo: boolean,
) {
  const manualTitleRef = useRef(false)
  const latestDraftRef = useRef(draft)
  latestDraftRef.current = draft
  const [status, setStatus] = useState<TitleSuggestionStatus>("idle")

  const changeDraft = (patch: Partial<GitHubCreateDraft>) => {
    if (patch.title !== undefined && patch.title !== latestDraftRef.current.title) {
      manualTitleRef.current = true
      setStatus("idle")
    }
    setDraft((current) => {
      const repositoryChanged =
        patch.repository !== undefined && patch.repository !== current.repository
      const headChanged = patch.head !== undefined && patch.head !== current.head
      const next = {
        ...current,
        ...patch,
        ...(repositoryChanged ? { base: "", head: "" } : {}),
        ...(!manualTitleRef.current && (repositoryChanged || headChanged) ? { title: "" } : {}),
      }
      latestDraftRef.current = next
      return next
    })
  }

  const reset = () => {
    manualTitleRef.current = false
    setStatus("idle")
  }

  useEffect(() => {
    const repository = draft.repository.trim()
    const branch = draft.head?.trim() ?? ""
    if (!host || !canSuggestTitle(draft.kind, repository, branch, open, manualTitleRef.current)) {
      setStatus("idle")
      return
    }
    const controller = new AbortController()
    setStatus("loading")
    const load = async () => {
      try {
        const title = await suggestedTitle(host, repository, branch, demo, controller.signal)
        if (controller.signal.aborted || manualTitleRef.current) return
        setDraft((current) => {
          const next = withSuggestedTitle(current, repository, branch, title)
          latestDraftRef.current = next
          return next
        })
        setStatus(title ? "idle" : "error")
      } catch {
        if (!controller.signal.aborted && !manualTitleRef.current) setStatus("error")
      }
    }
    void load()
    return () => controller.abort()
  }, [demo, draft.head, draft.kind, draft.repository, host, open, setDraft])

  return { status, changeDraft, reset }
}
